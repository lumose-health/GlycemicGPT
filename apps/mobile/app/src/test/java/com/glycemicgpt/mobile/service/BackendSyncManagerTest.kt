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
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import retrofit2.Response

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
    fun `standDown purges the queue and resets sync status`() = runTest {
        coEvery { syncDao.deleteAll() } returns 42

        manager.standDown()

        coVerify { syncDao.deleteAll() }
        assertEquals(0L, manager.syncStatus.value.lastSyncAtMs)
        assertNull(manager.syncStatus.value.lastError)
    }

    // -- start() lifecycle: gated on the live base URL ---------------------------------------
    // These use a real dispatcher scope (not virtual time) because the mode flow hops through
    // Dispatchers.IO; mockk's timeout verification bridges the threads.

    @Test
    fun `start without a backend purges the queue and never drains`() {
        val baseUrl = MutableStateFlow<String?>(null)
        every { authTokenStore.baseUrlFlow() } returns baseUrl
        coEvery { syncDao.deleteAll() } returns 7
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        try {
            manager.start(scope)

            coVerify(timeout = 5_000) { syncDao.deleteAll() }
            coVerify(exactly = 0) { syncDao.getPendingBatch(any(), any(), any()) }
            coVerify(exactly = 0) { api.pushPumpEvents(any()) }
        } finally {
            manager.stop()
            scope.cancel()
        }
    }

    @Test
    fun `dropping the base url cancels the loop and purges the queue`() {
        // Server-drop (clearBaseUrl / continue-without-server) purges; this is the AC5 path.
        val baseUrl = MutableStateFlow<String?>("https://api.example.com")
        every { authTokenStore.baseUrlFlow() } returns baseUrl
        every { authTokenStore.hasActiveSession() } returns true
        coEvery { syncDao.getPendingBatch(any(), any(), any()) } returns emptyList()
        coEvery { syncDao.deleteAll() } returns 3
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        try {
            manager.start(scope)
            // Loop is live while configured...
            coVerify(timeout = 5_000, atLeast = 1) { syncDao.getPendingBatch(any(), any(), any()) }
            coVerify(exactly = 0) { syncDao.deleteAll() }

            baseUrl.value = null

            // ...and stands down (purge, no further drains) the moment the server is dropped.
            coVerify(timeout = 5_000) { syncDao.deleteAll() }
        } finally {
            manager.stop()
            scope.cancel()
        }
    }

    @Test
    fun `logout does not purge - queue is preserved and bounded while the url remains`() {
        // Logout keeps the base URL, so the stand-down purge must NOT fire: the queue is
        // preserved (bounded by the prune) to drain on re-login.
        val baseUrl = MutableStateFlow<String?>("https://api.example.com")
        every { authTokenStore.baseUrlFlow() } returns baseUrl
        every { authTokenStore.hasActiveSession() } returns false
        coEvery { syncDao.countAll() } returns BackendSyncManager.MAX_QUEUE_SIZE + 5
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        try {
            manager.start(scope)

            // The bounded-no-drain posture is active (prune ran)...
            coVerify(timeout = 5_000, atLeast = 1) { syncDao.pruneOldest(5) }
            // ...but nothing was purged and nothing drained.
            coVerify(exactly = 0) { syncDao.deleteAll() }
            coVerify(exactly = 0) { syncDao.getPendingBatch(any(), any(), any()) }
        } finally {
            manager.stop()
            scope.cancel()
        }
    }

    @Test
    fun `processQueue marks failed on network error`() = runTest {
        every { authTokenStore.hasActiveSession() } returns true
        coEvery { syncDao.getPendingBatch(any(), any(), any()) } returns listOf(sampleEntity())
        coEvery { api.pushPumpEvents(any()) } throws java.io.IOException("No connection")

        manager.processQueue()

        coVerify { syncDao.markFailed(listOf(1L), "No connection", any()) }
        assertEquals("No connection", manager.syncStatus.value.lastError)
    }

    @Test
    fun `processQueue marks failed on HTTP error`() = runTest {
        every { authTokenStore.hasActiveSession() } returns true
        coEvery { syncDao.getPendingBatch(any(), any(), any()) } returns listOf(sampleEntity())
        coEvery { api.pushPumpEvents(any()) } returns Response.error(
            500,
            "Internal Server Error".toResponseBody(),
        )

        manager.processQueue()

        coVerify { syncDao.markFailed(listOf(1L), "HTTP 500", any()) }
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
