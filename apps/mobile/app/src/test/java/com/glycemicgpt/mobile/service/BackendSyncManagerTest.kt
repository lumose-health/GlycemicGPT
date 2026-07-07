package com.glycemicgpt.mobile.service

import com.glycemicgpt.mobile.data.local.AppSettingsStore
import com.glycemicgpt.mobile.data.local.AuthTokenStore
import com.glycemicgpt.mobile.data.local.dao.RawHistoryLogDao
import com.glycemicgpt.mobile.data.local.dao.SyncDao
import com.glycemicgpt.mobile.data.local.entity.SyncQueueEntity
import com.glycemicgpt.mobile.data.remote.GlycemicGptApi
import com.glycemicgpt.mobile.data.remote.InstantAdapter
import com.glycemicgpt.mobile.data.remote.dto.PumpPushResponse
import com.squareup.moshi.Moshi
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import retrofit2.Response

@OptIn(ExperimentalCoroutinesApi::class)
class BackendSyncManagerTest {

    private val syncDao = mockk<SyncDao>(relaxed = true)
    private val rawHistoryLogDao = mockk<RawHistoryLogDao>(relaxed = true)
    private val api = mockk<GlycemicGptApi>()
    private val authTokenStore = mockk<AuthTokenStore>()
    private val appSettingsStore = mockk<AppSettingsStore> {
        every { backendSyncEnabled } returns true
        every { dataRetentionDays } returns 7
    }
    private val moshi = Moshi.Builder().add(InstantAdapter()).build()

    private val manager = BackendSyncManager(syncDao, rawHistoryLogDao, api, authTokenStore, appSettingsStore, moshi)

    private fun sampleEntity(id: Long = 1L): SyncQueueEntity =
        SyncQueueEntity(
            id = id,
            eventType = "basal",
            eventTimestampMs = System.currentTimeMillis(),
            payload = """{"event_type":"basal","event_timestamp":"2025-01-01T00:00:00Z","units":0.5,"is_automated":true}""",
        )

    @Test
    fun `processQueue sends batch to API and deletes on success`() = runTest {
        every { authTokenStore.hasActiveSession() } returns true
        coEvery { syncDao.getPendingBatch(any(), any(), any()) } returns listOf(sampleEntity())
        coEvery { api.pushPumpEvents(any()) } returns Response.success(
            PumpPushResponse(accepted = 1, duplicates = 0),
        )

        manager.processQueue()

        coVerify { syncDao.deleteSent(listOf(1L)) }
        assertNull(manager.syncStatus.value.lastError)
    }

    @Test
    fun `processQueue skips when not logged in`() = runTest {
        every { authTokenStore.hasActiveSession() } returns false

        manager.processQueue()

        coVerify(exactly = 0) { syncDao.getPendingBatch(any(), any(), any()) }
    }

    @Test
    fun `processQueue skips when backend sync disabled`() = runTest {
        every { appSettingsStore.backendSyncEnabled } returns false

        manager.processQueue()

        coVerify(exactly = 0) { authTokenStore.hasActiveSession() }
        coVerify(exactly = 0) { syncDao.getPendingBatch(any(), any(), any()) }
    }

    @Test
    fun `processQueue still prunes an over-cap queue without an active session`() = runTest {
        // The bound must not depend on being able to drain: a signed-out (or refresh-expired)
        // user with a paired pump keeps enqueueing, so prune has to run ahead of the session
        // gate. Reverting that ordering turns this red (unbounded-growth latent bug).
        every { authTokenStore.hasActiveSession() } returns false
        coEvery { syncDao.countAll() } returns BackendSyncManager.MAX_QUEUE_SIZE + 500

        manager.processQueue()

        coVerify { syncDao.pruneOldest(500) }
        coVerify(exactly = 0) { syncDao.getPendingBatch(any(), any(), any()) }
        coVerify(exactly = 0) { api.pushPumpEvents(any()) }
    }

    @Test
    fun `processQueue still prunes an over-cap queue when backend sync disabled`() = runTest {
        every { appSettingsStore.backendSyncEnabled } returns false
        coEvery { syncDao.countAll() } returns BackendSyncManager.MAX_QUEUE_SIZE + 42

        manager.processQueue()

        coVerify { syncDao.pruneOldest(42) }
        coVerify(exactly = 0) { syncDao.getPendingBatch(any(), any(), any()) }
        coVerify(exactly = 0) { api.pushPumpEvents(any()) }
    }

    @Test
    fun `processQueue prunes and still drains with a valid session`() = runTest {
        // Regression guard for full-stack-offline resilience: moving prune ahead of the gates
        // must not detach the drain -- a valid session with a backed-up queue both prunes to
        // the cap and pushes the next batch.
        every { authTokenStore.hasActiveSession() } returns true
        coEvery { syncDao.countAll() } returns BackendSyncManager.MAX_QUEUE_SIZE + 10
        coEvery { syncDao.getPendingBatch(any(), any(), any()) } returns listOf(sampleEntity())
        coEvery { api.pushPumpEvents(any()) } returns Response.success(
            PumpPushResponse(accepted = 1, duplicates = 0),
        )

        manager.processQueue()

        coVerify { syncDao.pruneOldest(10) }
        coVerify { syncDao.deleteSent(listOf(1L)) }
    }

    @Test
    fun `purgeUndeliverable clears both outbound tables and resets sync status`() = runTest {
        coEvery { syncDao.deleteAll() } returns 42
        coEvery { rawHistoryLogDao.deleteAllButMaxSequence() } returns 7

        manager.purgeUndeliverable()

        coVerify { syncDao.deleteAll() }
        coVerify { rawHistoryLogDao.deleteAllButMaxSequence() }
        assertEquals(0L, manager.syncStatus.value.lastSyncAtMs)
        assertNull(manager.syncStatus.value.lastError)
    }

    // -- start() lifecycle: gated on the live mode signal ------------------------------------

    @Test
    fun `start without a backend purges the queue and never drains`() = runTest {
        every { authTokenStore.backendConfiguredFlow() } returns MutableStateFlow(false)

        manager.start(backgroundScope)
        runCurrent()

        coVerify { syncDao.deleteAll() }
        coVerify { rawHistoryLogDao.deleteAllButMaxSequence() }
        coVerify(exactly = 0) { syncDao.getPendingBatch(any(), any(), any()) }
        coVerify(exactly = 0) { api.pushPumpEvents(any()) }

        // The stand-down sweep re-collects hourly (racing enqueues, ongoing raw rows) --
        // no 3s cadence.
        advanceTimeBy(BackendSyncManager.STAND_DOWN_SWEEP_INTERVAL_MS + 1)
        runCurrent()
        coVerify(exactly = 2) { syncDao.deleteAll() }
        manager.stop()
    }

    @Test
    fun `dropping the backend cancels the loop and purges the queue`() = runTest {
        // Server-drop (clearBaseUrl / continue-without-server) purges; this is the story's
        // purge-on-server-drop path.
        val configured = MutableStateFlow(true)
        every { authTokenStore.backendConfiguredFlow() } returns configured
        every { authTokenStore.hasActiveSession() } returns true
        coEvery { syncDao.getPendingBatch(any(), any(), any()) } returns emptyList()

        manager.start(backgroundScope)
        runCurrent()
        // Loop is live while configured...
        coVerify(atLeast = 1) { syncDao.getPendingBatch(any(), any(), any()) }
        coVerify(exactly = 0) { syncDao.deleteAll() }

        configured.value = false
        runCurrent()

        // ...and stands down (purge, no further drains) the moment the server is dropped.
        coVerify { syncDao.deleteAll() }
        manager.stop()
    }

    @Test
    fun `logout does not purge - queue is preserved and bounded while the url remains`() = runTest {
        // Logout keeps the base URL (mode stays configured), so the stand-down purge must NOT
        // fire: the queue is preserved (bounded by the prune) to drain on re-login.
        every { authTokenStore.backendConfiguredFlow() } returns MutableStateFlow(true)
        every { authTokenStore.hasActiveSession() } returns false
        coEvery { syncDao.countAll() } returns BackendSyncManager.MAX_QUEUE_SIZE + 5

        manager.start(backgroundScope)
        runCurrent()

        // The bounded-no-drain posture is active (prune ran)...
        coVerify(atLeast = 1) { syncDao.pruneOldest(5) }
        // ...but nothing was purged and nothing drained.
        coVerify(exactly = 0) { syncDao.deleteAll() }
        coVerify(exactly = 0) { syncDao.getPendingBatch(any(), any(), any()) }
        manager.stop()
    }

    @Test
    fun `processQueue marks transient-failure on network error - retry budget untouched`() = runTest {
        // A thrown IOException means the server never received the batch. It must NOT
        // count toward MAX_RETRIES, or an outage exhausts the queue in ~62s and the
        // hourly cleanup silently discards it.
        every { authTokenStore.hasActiveSession() } returns true
        coEvery { syncDao.getPendingBatch(any(), any(), any()) } returns listOf(sampleEntity())
        coEvery { api.pushPumpEvents(any()) } throws java.io.IOException("No connection")

        manager.processQueue()

        coVerify { syncDao.markTransientFailure(listOf(1L), "No connection", any()) }
        coVerify(exactly = 0) { syncDao.markFailed(any(), any(), any()) }
        assertEquals("No connection", manager.syncStatus.value.lastError)
    }

    @Test
    fun `processQueue survives sustained outage cycles without ever counting a retry`() = runTest {
        // Far more cycles than MAX_RETRIES: every one must be non-counting. Reverting the
        // transport branch to markFailed turns this red (the ~62s exhaustion bug).
        every { authTokenStore.hasActiveSession() } returns true
        coEvery { syncDao.getPendingBatch(any(), any(), any()) } returns listOf(sampleEntity())
        coEvery { api.pushPumpEvents(any()) } throws java.io.IOException("No connection")

        val cycles = BackendSyncManager.MAX_RETRIES * 4
        repeat(cycles) { manager.processQueue() }

        coVerify(exactly = cycles) { syncDao.markTransientFailure(listOf(1L), "No connection", any()) }
        coVerify(exactly = 0) { syncDao.markFailed(any(), any(), any()) }
    }

    @Test
    fun `processQueue does not mislabel a post-success DAO failure as a push failure`() = runTest {
        // The server accepted the batch; a Room failure in the success path must propagate
        // (rows stay 'sending' for resetStaleSending) rather than be caught and marked as a
        // failed push -- the catch is scoped to the network call only.
        every { authTokenStore.hasActiveSession() } returns true
        coEvery { syncDao.getPendingBatch(any(), any(), any()) } returns listOf(sampleEntity())
        coEvery { api.pushPumpEvents(any()) } returns Response.success(
            PumpPushResponse(accepted = 1, duplicates = 0),
        )
        coEvery { syncDao.deleteSent(any()) } throws RuntimeException("disk full")

        val result = runCatching { manager.processQueue() }

        assertTrue(result.isFailure)
        coVerify(exactly = 0) { syncDao.markTransientFailure(any(), any(), any()) }
        coVerify(exactly = 0) { syncDao.markFailed(any(), any(), any()) }
    }

    @Test
    fun `processQueue marks failed on internal server error - retry budget counts`() = runTest {
        // A 500 can be a deterministic server error on this batch's payload (poison row).
        // It must keep counting so the batch exhausts after MAX_RETRIES instead of
        // head-of-line-blocking every newer row until the retention cutoff.
        every { authTokenStore.hasActiveSession() } returns true
        coEvery { syncDao.getPendingBatch(any(), any(), any()) } returns listOf(sampleEntity())
        coEvery { api.pushPumpEvents(any()) } returns Response.error(
            500,
            "Internal Server Error".toResponseBody(),
        )

        manager.processQueue()

        coVerify { syncDao.markFailed(listOf(1L), "HTTP 500", any()) }
        coVerify(exactly = 0) { syncDao.markTransientFailure(any(), any(), any()) }
    }

    @Test
    fun `processQueue marks transient-failure on gateway unavailability`() = runTest {
        // 502/503/504 = LB/gateway during a deploy or restart -- genuinely transient; it
        // must not burn the retry budget any more than a dropped connection does.
        every { authTokenStore.hasActiveSession() } returns true
        coEvery { syncDao.getPendingBatch(any(), any(), any()) } returns listOf(sampleEntity())
        coEvery { api.pushPumpEvents(any()) } returns Response.error(
            503,
            "Service Unavailable".toResponseBody(),
        )

        manager.processQueue()

        coVerify { syncDao.markTransientFailure(listOf(1L), "HTTP 503", any()) }
        coVerify(exactly = 0) { syncDao.markFailed(any(), any(), any()) }
    }

    @Test
    fun `processQueue rethrows cancellation without marking anything failed`() = runTest {
        // A mode flip cancels the loop mid-push: that is a clean switch, not a failed
        // upload -- rows stay 'sending' for resetStaleSending. Guards the catch order.
        every { authTokenStore.hasActiveSession() } returns true
        coEvery { syncDao.getPendingBatch(any(), any(), any()) } returns listOf(sampleEntity())
        coEvery { api.pushPumpEvents(any()) } throws kotlinx.coroutines.CancellationException("mode flip")

        val result = runCatching { manager.processQueue() }

        assertTrue(result.exceptionOrNull() is kotlinx.coroutines.CancellationException)
        coVerify(exactly = 0) { syncDao.markTransientFailure(any(), any(), any()) }
        coVerify(exactly = 0) { syncDao.markFailed(any(), any(), any()) }
    }

    @Test
    fun `processQueue marks transient-failure on rate limit`() = runTest {
        every { authTokenStore.hasActiveSession() } returns true
        coEvery { syncDao.getPendingBatch(any(), any(), any()) } returns listOf(sampleEntity())
        coEvery { api.pushPumpEvents(any()) } returns Response.error(
            429,
            "Too Many Requests".toResponseBody(),
        )

        manager.processQueue()

        coVerify { syncDao.markTransientFailure(listOf(1L), "HTTP 429", any()) }
        coVerify(exactly = 0) { syncDao.markFailed(any(), any(), any()) }
    }

    @Test
    fun `processQueue marks transient-failure on request timeout`() = runTest {
        // 408 is a gateway/request timeout -- transient like 5xx/429, not a payload
        // rejection; it must not burn the retry budget.
        every { authTokenStore.hasActiveSession() } returns true
        coEvery { syncDao.getPendingBatch(any(), any(), any()) } returns listOf(sampleEntity())
        coEvery { api.pushPumpEvents(any()) } returns Response.error(
            408,
            "Request Timeout".toResponseBody(),
        )

        manager.processQueue()

        coVerify { syncDao.markTransientFailure(listOf(1L), "HTTP 408", any()) }
        coVerify(exactly = 0) { syncDao.markFailed(any(), any(), any()) }
    }

    @Test
    fun `processQueue marks failed on client rejection - retry budget counts`() = runTest {
        // 4xx = the server received and rejected the payload; it will never be accepted,
        // so it must keep counting toward MAX_RETRIES and give up rather than loop forever.
        every { authTokenStore.hasActiveSession() } returns true
        coEvery { syncDao.getPendingBatch(any(), any(), any()) } returns listOf(sampleEntity())
        coEvery { api.pushPumpEvents(any()) } returns Response.error(
            422,
            "Unprocessable Entity".toResponseBody(),
        )

        manager.processQueue()

        coVerify { syncDao.markFailed(listOf(1L), "HTTP 422", any()) }
        coVerify(exactly = 0) { syncDao.markTransientFailure(any(), any(), any()) }
    }

    @Test
    fun `processQueue marks unparseable items as failed separately`() = runTest {
        every { authTokenStore.hasActiveSession() } returns true
        val badEntity = SyncQueueEntity(
            id = 2L,
            eventType = "basal",
            eventTimestampMs = System.currentTimeMillis(),
            payload = "not valid json",
        )
        coEvery { syncDao.getPendingBatch(any(), any(), any()) } returns listOf(
            sampleEntity(1L),
            badEntity,
        )
        coEvery { api.pushPumpEvents(any()) } returns Response.success(
            PumpPushResponse(accepted = 1, duplicates = 0),
        )

        manager.processQueue()

        // Bad entity marked failed with parse error
        coVerify { syncDao.markFailed(listOf(2L), "JSON parse error", any()) }
        // Good entity deleted after successful push
        coVerify { syncDao.deleteSent(listOf(1L)) }
    }
}
