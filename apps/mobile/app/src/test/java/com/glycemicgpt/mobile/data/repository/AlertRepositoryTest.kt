package com.glycemicgpt.mobile.data.repository

import com.glycemicgpt.mobile.data.local.dao.AlertDao
import com.glycemicgpt.mobile.data.local.entity.AlertEntity
import com.glycemicgpt.mobile.data.remote.GlycemicGptApi
import com.glycemicgpt.mobile.data.remote.dto.AcknowledgeResponse
import com.glycemicgpt.mobile.data.remote.dto.AlertResponse
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.coVerifyOrder
import io.mockk.mockk
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.runTest
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.Response
import java.io.IOException

/**
 * Unit tests for the GLY-130 acknowledge state machine: the local mark must run before —
 * and completely independently of — the server POST, and the `ack_synced` flag must classify
 * server outcomes correctly (2xx/terminal-4xx stamp it, transport/5xx leave the row pending
 * for [AlertRepository.reconcilePendingAcks]).
 */
class AlertRepositoryTest {

    /**
     * In-memory [AlertDao] keyed by `server_id`, mirroring the table's unique index and REPLACE
     * semantics. A fake (not a mock) so the default-method clobber guard
     * [AlertDao.insertPreservingLocalAck] runs its real merge logic against real state.
     */
    private class FakeAlertDao : AlertDao {
        val rows = linkedMapOf<String, AlertEntity>()
        private var nextId = 1L

        override suspend fun insert(alert: AlertEntity): Long {
            val id = if (alert.id != 0L) alert.id else nextId++
            rows[alert.serverId] = alert.copy(id = id)
            return id
        }

        override suspend fun getByServerId(serverId: String): AlertEntity? = rows[serverId]

        override fun observeRecentAlerts(): Flow<List<AlertEntity>> = flowOf(rows.values.toList())

        override suspend fun markAcknowledgedPending(serverId: String) {
            rows[serverId]?.let {
                rows[serverId] = it.copy(acknowledged = true, ackSynced = false)
            }
        }

        override suspend fun markAckSynced(serverId: String) {
            rows[serverId]?.let { rows[serverId] = it.copy(ackSynced = true) }
        }

        override suspend fun getPendingAckServerIds(): List<String> =
            rows.values.filter { it.acknowledged && !it.ackSynced }
                .sortedWith(compareBy({ it.timestampMs }, { it.id }))
                .map { it.serverId }

        override suspend fun getLatestUnacknowledgedServerId(): String? =
            rows.values.filter { !it.acknowledged }
                .maxWithOrNull(compareBy({ it.timestampMs }, { it.id }))
                ?.serverId

        override suspend fun getLatestUnacknowledgedTimestampForType(alertType: String, sinceMs: Long): Long? =
            rows.values.filter { it.alertType == alertType && !it.acknowledged && it.timestampMs >= sinceMs }
                .maxOfOrNull { it.timestampMs }

        override suspend fun deleteOlderThan(cutoffMs: Long) {
            rows.values.removeAll { it.timestampMs < cutoffMs }
        }

        override suspend fun deleteAll() = rows.clear()
    }

    private lateinit var dao: FakeAlertDao
    private lateinit var api: GlycemicGptApi
    private lateinit var repository: AlertRepository

    @Before
    fun setUp() {
        dao = FakeAlertDao()
        api = mockk()
        repository = AlertRepository(dao, api)
    }

    private fun makeResponse(
        id: String = "alert-1",
        acknowledged: Boolean = false,
        timestamp: String = "2026-07-03T10:00:00Z",
    ) = AlertResponse(
        id = id,
        alertType = "low_urgent",
        severity = "urgent",
        currentValue = 55.0,
        message = "Low glucose",
        timestamp = timestamp,
        acknowledged = acknowledged,
    )

    private suspend fun seedUnackedAlert(id: String = "alert-1", timestamp: String = "2026-07-03T10:00:00Z") {
        repository.saveAlert(makeResponse(id = id, timestamp = timestamp))
    }

    private fun ackSuccess(id: String = "alert-1"): Response<AcknowledgeResponse> =
        Response.success(AcknowledgeResponse(status = "acknowledged", alertId = id))

    private fun ackError(code: Int): Response<AcknowledgeResponse> =
        Response.error(code, "{}".toResponseBody("application/json".toMediaType()))

    // -- acknowledgeAlert: the chokepoint state machine ---------------------------------------

    @Test
    fun `offline ack marks the row locally and leaves it pending - the safety fix`() = runTest {
        seedUnackedAlert()
        coEvery { api.acknowledgeAlert("alert-1") } throws IOException("network unreachable")

        val result = repository.acknowledgeAlert("alert-1")

        val row = dao.rows.getValue("alert-1")
        assertTrue("local mark must not depend on the network", row.acknowledged)
        assertFalse("server ack did not land, must stay pending", row.ackSynced)
        assertTrue("caller still learns the sync failed", result.isFailure)
    }

    @Test
    fun `markAcknowledgedLocally marks the row pending without touching the network`() = runTest {
        seedUnackedAlert()

        repository.markAcknowledgedLocally("alert-1")

        val row = dao.rows.getValue("alert-1")
        assertTrue(row.acknowledged)
        assertFalse(row.ackSynced)
        coVerify(exactly = 0) { api.acknowledgeAlert(any()) }
    }

    @Test
    fun `successful ack marks the row acknowledged and synced in one pass`() = runTest {
        seedUnackedAlert()
        coEvery { api.acknowledgeAlert("alert-1") } returns ackSuccess()

        val result = repository.acknowledgeAlert("alert-1")

        val row = dao.rows.getValue("alert-1")
        assertTrue(row.acknowledged)
        assertTrue(row.ackSynced)
        assertTrue(result.isSuccess)
    }

    @Test
    fun `terminal 4xx marks synced to stop retries but still reports a typed terminal failure`() = runTest {
        for (code in listOf(403, 404, 422)) {
            val id = "alert-$code"
            seedUnackedAlert(id = id)
            coEvery { api.acknowledgeAlert(id) } returns ackError(code)

            val result = repository.acknowledgeAlert(id)

            val row = dao.rows.getValue(id)
            assertTrue(row.acknowledged)
            assertTrue("HTTP $code can never succeed on retry", row.ackSynced)
            val e = result.exceptionOrNull()
            assertTrue("failure must be typed", e is AlertAckHttpException)
            assertTrue("HTTP $code must classify as terminal", (e as AlertAckHttpException).terminal)
            assertEquals(code, e.code)
        }
    }

    @Test
    fun `transient 5xx leaves the row pending and reports a typed transient failure`() = runTest {
        seedUnackedAlert()
        coEvery { api.acknowledgeAlert("alert-1") } returns ackError(500)

        val result = repository.acknowledgeAlert("alert-1")

        val row = dao.rows.getValue("alert-1")
        assertTrue(row.acknowledged)
        assertFalse(row.ackSynced)
        val e = result.exceptionOrNull()
        assertTrue("failure must be typed", e is AlertAckHttpException)
        assertFalse("HTTP 500 must classify as transient", (e as AlertAckHttpException).terminal)
    }

    @Test
    fun `401 is transient - a token refresh may fix it, so the row stays pending`() = runTest {
        seedUnackedAlert()
        coEvery { api.acknowledgeAlert("alert-1") } returns ackError(401)

        repository.acknowledgeAlert("alert-1")

        assertFalse(dao.rows.getValue("alert-1").ackSynced)
    }

    // -- reconcilePendingAcks ------------------------------------------------------------------

    @Test
    fun `reconcile drains every pending ack on success`() = runTest {
        seedUnackedAlert(id = "a", timestamp = "2026-07-03T10:00:00Z")
        seedUnackedAlert(id = "b", timestamp = "2026-07-03T10:05:00Z")
        coEvery { api.acknowledgeAlert(any()) } throws IOException("offline")
        repository.acknowledgeAlert("a")
        repository.acknowledgeAlert("b")

        coEvery { api.acknowledgeAlert("a") } returns ackSuccess("a")
        coEvery { api.acknowledgeAlert("b") } returns ackSuccess("b")
        repository.reconcilePendingAcks()

        assertTrue(dao.rows.getValue("a").ackSynced)
        assertTrue(dao.rows.getValue("b").ackSynced)
        assertTrue(dao.getPendingAckServerIds().isEmpty())
    }

    @Test
    fun `reconcile marks a terminally rejected ack synced so it stops retrying`() = runTest {
        seedUnackedAlert()
        coEvery { api.acknowledgeAlert("alert-1") } throws IOException("offline")
        repository.acknowledgeAlert("alert-1")

        coEvery { api.acknowledgeAlert("alert-1") } returns ackError(404)
        repository.reconcilePendingAcks()

        assertTrue(dao.rows.getValue("alert-1").ackSynced)
    }

    @Test
    fun `reconcile leaves a transiently failed ack pending`() = runTest {
        seedUnackedAlert()
        coEvery { api.acknowledgeAlert("alert-1") } throws IOException("offline")
        repository.acknowledgeAlert("alert-1")

        coEvery { api.acknowledgeAlert("alert-1") } returns ackError(503)
        repository.reconcilePendingAcks()

        assertFalse(dao.rows.getValue("alert-1").ackSynced)
        assertEquals(listOf("alert-1"), dao.getPendingAckServerIds())
    }

    @Test
    fun `reconcile bails on a transport failure without losing the remaining pending acks`() = runTest {
        seedUnackedAlert(id = "a", timestamp = "2026-07-03T10:00:00Z")
        seedUnackedAlert(id = "b", timestamp = "2026-07-03T10:05:00Z")
        coEvery { api.acknowledgeAlert(any()) } throws IOException("offline")
        repository.acknowledgeAlert("a")
        repository.acknowledgeAlert("b")

        repository.reconcilePendingAcks()

        // The first POST failed at transport level; the pass stops (the backend is unreachable,
        // the rest would fail identically) and both stay pending for the next trigger.
        assertEquals(listOf("a", "b"), dao.getPendingAckServerIds())
        coVerify(exactly = 3) { api.acknowledgeAlert(any()) } // 2 from acks + 1 from reconcile
    }

    @Test
    fun `reconcile survives an unexpected per-alert failure - continues and leaves the row pending`() = runTest {
        seedUnackedAlert(id = "a", timestamp = "2026-07-03T10:00:00Z")
        seedUnackedAlert(id = "b", timestamp = "2026-07-03T10:05:00Z")
        coEvery { api.acknowledgeAlert(any()) } throws IOException("offline")
        repository.acknowledgeAlert("a")
        repository.acknowledgeAlert("b")

        // Non-IO, non-cancellation failure (e.g. a malformed 2xx body): unlike the IOException
        // bail, the pass must move on to the remaining alerts and never throw to its
        // app-lifetime caller.
        coEvery { api.acknowledgeAlert("a") } throws IllegalStateException("malformed body")
        coEvery { api.acknowledgeAlert("b") } returns ackSuccess("b")

        repository.reconcilePendingAcks()

        assertFalse("failed alert stays pending for the next trigger", dao.rows.getValue("a").ackSynced)
        assertTrue("failure on one alert must not strand the rest", dao.rows.getValue("b").ackSynced)
        assertEquals(listOf("a"), dao.getPendingAckServerIds())
    }

    @Test
    fun `reconcile with nothing pending makes no network calls`() = runTest {
        seedUnackedAlert()

        repository.reconcilePendingAcks()

        coVerify(exactly = 0) { api.acknowledgeAlert(any()) }
    }

    // -- saveAlert clobber guard (guard 1) ------------------------------------------------------

    @Test
    fun `saveAlert never downgrades a locally-acknowledged row on a stale server echo`() = runTest {
        seedUnackedAlert()
        coEvery { api.acknowledgeAlert("alert-1") } throws IOException("offline")
        repository.acknowledgeAlert("alert-1")

        // SSE re-delivery of the same alert, still unacked server-side.
        val persisted = repository.saveAlert(makeResponse(acknowledged = false))

        assertTrue("local ack is user-intent truth", persisted.acknowledged)
        assertFalse("still pending server sync", persisted.ackSynced)
        assertTrue(dao.rows.getValue("alert-1").acknowledged)
    }

    @Test
    fun `saveAlert with a server-acknowledged response needs no sync`() = runTest {
        val persisted = repository.saveAlert(makeResponse(acknowledged = true))

        assertTrue(persisted.acknowledged)
        assertTrue("server already knows, nothing to reconcile", persisted.ackSynced)
        assertTrue(dao.getPendingAckServerIds().isEmpty())
    }

    @Test
    fun `saveAlert stores a fresh unacknowledged alert as-is`() = runTest {
        val persisted = repository.saveAlert(makeResponse(acknowledged = false))

        assertFalse(persisted.acknowledged)
        assertFalse(persisted.ackSynced)
        assertNotNull(dao.rows["alert-1"])
    }

    @Test
    fun `saveAlert re-delivery refreshes non-ack fields while preserving the local ack`() = runTest {
        seedUnackedAlert()
        coEvery { api.acknowledgeAlert("alert-1") } throws IOException("offline")
        repository.acknowledgeAlert("alert-1")

        val persisted = repository.saveAlert(
            makeResponse(acknowledged = false).copy(message = "Low glucose - updated"),
        )

        assertEquals("Low glucose - updated", persisted.message)
        assertTrue(persisted.acknowledged)
    }

    // -- getLatestUnacknowledgedServerId (the Wear dismiss lookup) ------------------------------

    @Test
    fun `a locally-acknowledged alert no longer resolves as the latest unacknowledged`() = runTest {
        seedUnackedAlert()
        coEvery { api.acknowledgeAlert("alert-1") } throws IOException("offline")

        assertEquals("alert-1", repository.getLatestUnacknowledgedServerId())
        repository.acknowledgeAlert("alert-1")

        assertNull(
            "a watch dismiss must stick offline - no re-resolve, no re-fire",
            repository.getLatestUnacknowledgedServerId(),
        )
    }

    // -- fetchPendingAlerts: push before pull ---------------------------------------------------

    @Test
    fun `fetchPendingAlerts pushes pending acks before pulling`() = runTest {
        seedUnackedAlert()
        coEvery { api.acknowledgeAlert("alert-1") } throws IOException("offline")
        repository.acknowledgeAlert("alert-1")

        coEvery { api.acknowledgeAlert("alert-1") } returns ackSuccess()
        coEvery { api.getPendingAlerts() } returns
            Response.success(listOf(makeResponse(acknowledged = false)))

        val result = repository.fetchPendingAlerts()

        assertTrue(result.isSuccess)
        coVerifyOrder {
            api.acknowledgeAlert("alert-1")
            api.getPendingAlerts()
        }
        // Even though the pull echoed the alert as unacknowledged, the row stays acknowledged.
        assertTrue(dao.rows.getValue("alert-1").acknowledged)
    }

    @Test
    fun `fetchPendingAlerts still pulls when the push cannot land`() = runTest {
        seedUnackedAlert()
        coEvery { api.acknowledgeAlert("alert-1") } throws IOException("offline")
        repository.acknowledgeAlert("alert-1")

        coEvery { api.getPendingAlerts() } returns
            Response.success(listOf(makeResponse(acknowledged = false)))

        val result = repository.fetchPendingAlerts()

        assertTrue(result.isSuccess)
        // The pull must not clobber the pending local ack (guard 1).
        val row = dao.rows.getValue("alert-1")
        assertTrue(row.acknowledged)
        assertFalse(row.ackSynced)
    }
}
