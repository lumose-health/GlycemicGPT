package com.glycemicgpt.mobile.data.local.dao

import android.app.Application
import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.glycemicgpt.mobile.data.local.AppDatabase
import com.glycemicgpt.mobile.data.local.entity.SyncQueueEntity
import com.glycemicgpt.mobile.service.BackendSyncManager
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Real-SQL proof of the sync retry policy against an in-memory Room database.
 *
 * The mock-based [com.glycemicgpt.mobile.service.BackendSyncManagerTest] only asserts
 * which DAO verb the manager calls; these tests prove the SQL itself retains and
 * re-offers rows. The core invariant: transport failures ([SyncDao.markTransientFailure])
 * never exhaust a row out of [SyncDao.getPendingBatch] no matter how long the outage,
 * while counted failures ([SyncDao.markFailed]) give up after MAX_RETRIES and are
 * deleted by [SyncDao.cleanup].
 */
// Plain Application: the manifest's @HiltAndroidApp class would pull keystore-backed
// injection into a JVM test that only needs a Context for an in-memory database.
@RunWith(RobolectricTestRunner::class)
@Config(application = Application::class)
class SyncDaoTest {

    private companion object {
        const val MAX_RETRIES = BackendSyncManager.MAX_RETRIES

        /** Mirrors the literal `2000` baked into [SyncDao.getPendingBatch]'s backoff SQL --
         *  Room can't parameterize it, so keep the two in lockstep. */
        const val BASE_BACKOFF_MS = 2_000L
        const val T0 = 1_000_000L
    }

    private lateinit var db: AppDatabase
    private lateinit var dao: SyncDao

    @Before
    fun setUp() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        db = Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java)
            .allowMainThreadQueries()
            .build()
        dao = db.syncDao()
    }

    @After
    fun tearDown() {
        db.close()
    }

    private fun entity(createdAtMs: Long = T0): SyncQueueEntity =
        SyncQueueEntity(
            eventType = "basal",
            eventTimestampMs = createdAtMs,
            payload = """{"event_type":"basal"}""",
            createdAtMs = createdAtMs,
        )

    @Test
    fun `markTransientFailure never exhausts - row stays selectable across many outage cycles`() = runTest {
        dao.enqueue(entity())
        var now = T0

        // Far more cycles than MAX_RETRIES: with markFailed this row would be
        // excluded after 5 and deleted by cleanup; with markTransientFailure it
        // must be re-offered every cycle for the whole outage.
        repeat(MAX_RETRIES * 4) {
            val batch = dao.getPendingBatch(limit = 50, maxRetries = MAX_RETRIES, nowMs = now)
            assertEquals("row must be re-offered on every outage cycle", 1, batch.size)
            val id = batch.single().id
            dao.markSending(listOf(id), nowMs = now)
            dao.markTransientFailure(listOf(id), "timeout", nowMs = now)
            now += BASE_BACKOFF_MS + 1
        }

        val survivor = dao.getPendingBatch(limit = 50, maxRetries = MAX_RETRIES, nowMs = now).single()
        assertEquals("transport failures must not count toward the retry budget", 0, survivor.retryCount)
        assertEquals(SyncQueueEntity.STATUS_FAILED, survivor.status)

        // The exhaustion cleanup must not touch it either (retention cutoff in the past).
        dao.cleanup(maxRetries = MAX_RETRIES, cutoffMs = T0 - 1)
        assertEquals(1, dao.countAll())
    }

    @Test
    fun `markFailed exhausts after MAX_RETRIES and cleanup deletes the row`() = runTest {
        dao.enqueue(entity())
        var now = T0

        repeat(MAX_RETRIES) {
            val batch = dao.getPendingBatch(limit = 50, maxRetries = MAX_RETRIES, nowMs = now)
            assertEquals(1, batch.size)
            val id = batch.single().id
            dao.markSending(listOf(id), nowMs = now)
            dao.markFailed(listOf(id), "HTTP 422", nowMs = now)
            // Jump past the exponential backoff so eligibility is decided purely
            // by the retryCount < maxRetries exclusion.
            now += BASE_BACKOFF_MS * (1L shl MAX_RETRIES)
        }

        assertTrue(
            "row must be excluded once retryCount reaches MAX_RETRIES",
            dao.getPendingBatch(limit = 50, maxRetries = MAX_RETRIES, nowMs = now).isEmpty(),
        )
        dao.cleanup(maxRetries = MAX_RETRIES, cutoffMs = T0 - 1)
        assertEquals(0, dao.countAll())
    }

    @Test
    fun `markTransientFailure moves rows out of sending and the base backoff re-offers them`() = runTest {
        dao.enqueue(entity())
        val id = dao.getPendingBatch(limit = 50, maxRetries = MAX_RETRIES, nowMs = T0).single().id
        dao.markSending(listOf(id), nowMs = T0)
        dao.markTransientFailure(listOf(id), "connect refused", nowMs = T0)

        // Backoff respected: not re-offered before 2000 * (1 << 0) has elapsed...
        assertTrue(dao.getPendingBatch(limit = 50, maxRetries = MAX_RETRIES, nowMs = T0 + BASE_BACKOFF_MS).isEmpty())
        // ...and re-offered right after -- no 60s resetStaleSending stall.
        val reoffered = dao.getPendingBatch(limit = 50, maxRetries = MAX_RETRIES, nowMs = T0 + BASE_BACKOFF_MS + 1)
        assertEquals(1, reoffered.size)
        assertEquals("connect refused", reoffered.single().errorMessage)
    }

    @Test
    fun `pruneOldest drops transport-failed backlog but preserves in-flight rows`() = runTest {
        // During an outage the whole backlog sits in 'failed' below MAX_RETRIES. The prune
        // must still be able to enforce MAX_QUEUE_SIZE against those rows (oldest first),
        // or a multi-day outage grows the queue unbounded; only 'sending' is off-limits.
        repeat(4) { i -> dao.enqueue(entity(createdAtMs = T0 + i)) }
        val ids = dao.getPendingBatch(limit = 50, maxRetries = MAX_RETRIES, nowMs = T0 + 100).map { it.id }
        dao.markTransientFailure(ids, "timeout", nowMs = T0 + 100)
        dao.markSending(listOf(ids.first()), nowMs = T0 + 200)

        dao.pruneOldest(excess = 3)

        assertEquals("only the in-flight 'sending' row survives", 1, dao.countAll())
        dao.resetStaleSending(staleCutoffMs = T0 + 300)
        val survivor = dao.getPendingBatch(limit = 50, maxRetries = MAX_RETRIES, nowMs = T0 + 400).single()
        assertEquals(ids.first(), survivor.id)
    }

    @Test
    fun `cleanup retention cutoff still trims transport-failed rows older than retention`() = runTest {
        dao.enqueue(entity(createdAtMs = T0))
        dao.enqueue(entity(createdAtMs = T0 + 100_000))
        val ids = dao.getPendingBatch(limit = 50, maxRetries = MAX_RETRIES, nowMs = T0 + 200_000).map { it.id }
        dao.markTransientFailure(ids, "timeout", nowMs = T0 + 200_000)

        // Never-exhaust must not mean never-discard: the retention cutoff still applies.
        dao.cleanup(maxRetries = MAX_RETRIES, cutoffMs = T0 + 50_000)
        assertEquals(1, dao.countAll())
    }
}
