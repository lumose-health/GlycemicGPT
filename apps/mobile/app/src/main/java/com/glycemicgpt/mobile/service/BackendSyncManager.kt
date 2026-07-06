package com.glycemicgpt.mobile.service

import kotlinx.coroutines.ExperimentalCoroutinesApi
import com.glycemicgpt.mobile.data.local.AppSettingsStore
import com.glycemicgpt.mobile.data.local.AuthTokenStore
import com.glycemicgpt.mobile.data.local.dao.RawHistoryLogDao
import com.glycemicgpt.mobile.data.local.dao.SyncDao
import com.glycemicgpt.mobile.data.remote.GlycemicGptApi
import com.glycemicgpt.mobile.data.remote.dto.PumpEventDto
import com.glycemicgpt.mobile.data.remote.dto.PumpHardwareInfoDto
import com.glycemicgpt.mobile.data.remote.dto.PumpPushRequest
import com.glycemicgpt.mobile.data.remote.dto.PumpRawEventDto
import com.glycemicgpt.mobile.domain.model.PumpHardwareInfo
import com.squareup.moshi.Moshi
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.retryWhen
import kotlinx.coroutines.launch
import kotlinx.coroutines.selects.onTimeout
import kotlinx.coroutines.selects.select
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

data class SyncStatus(
    val lastSyncAtMs: Long = 0L,
    val pendingCount: Int = 0,
    val lastError: String? = null,
)

/**
 * Coroutine-based queue processor that pushes local pump events to the backend.
 *
 * Checks for pending items every [POLL_INTERVAL_MS] and can be triggered
 * immediately via [triggerSync].
 */
@OptIn(ExperimentalCoroutinesApi::class)
@Singleton
class BackendSyncManager @Inject constructor(
    private val syncDao: SyncDao,
    private val rawHistoryLogDao: RawHistoryLogDao,
    private val api: GlycemicGptApi,
    private val authTokenStore: AuthTokenStore,
    private val appSettingsStore: AppSettingsStore,
    private val moshi: Moshi,
) {

    companion object {
        const val POLL_INTERVAL_MS = 3_000L
        const val BATCH_SIZE = 50
        const val RAW_BATCH_SIZE = 100
        const val MAX_RETRIES = 5
        const val MAX_QUEUE_SIZE = 5000
        private const val STALE_SENDING_TIMEOUT_MS = 60_000L // 1 minute
        private const val CLEANUP_INTERVAL_MS = 3_600_000L // 1 hour

        /**
         * Hygiene cadence while the queue cannot drain (no session / sync disabled). The
         * enqueue rate is a few rows a minute, so the size bound doesn't need the 3s drain
         * cadence -- prune scans that often, in a posture that can persist for weeks, would
         * be pointless flash/WAL churn inside a foreground service.
         */
        const val IDLE_HYGIENE_INTERVAL_MS = 60_000L

        /** Cadence of the stand-down sweep while no backend is configured. */
        const val STAND_DOWN_SWEEP_INTERVAL_MS = 3_600_000L // 1 hour

        /** Backoff before resubscribing the mode signal after it fails. */
        private const val MODE_SIGNAL_RETRY_DELAY_MS = 60_000L
    }

    /** Cached pump hardware info, set by PumpPollingOrchestrator on first connect. */
    @Volatile
    var cachedHardwareInfo: PumpHardwareInfo? = null

    private val _syncStatus = MutableStateFlow(SyncStatus())
    val syncStatus: StateFlow<SyncStatus> = _syncStatus.asStateFlow()

    private var syncLoopJob: Job? = null
    private var pendingCountJob: Job? = null

    private val triggerChannel = Channel<Unit>(Channel.CONFLATED)
    @Volatile
    private var lastCleanupMs = 0L
    @Volatile
    private var lastIdleHygieneMs = 0L

    fun start(scope: CoroutineScope) {
        stop()
        // The sync loop only runs while a backend is configured. Keying on the live mode
        // signal (rather than a one-shot check) makes the whole lifecycle reactive: dropping
        // the server cancels the loop and purges the now-undeliverable queue, adding one
        // starts syncing without a service restart.
        syncLoopJob = scope.launch {
            authTokenStore.backendConfiguredFlow()
                // An encrypted-store read failure (keystore flake) must not kill this
                // collector for the rest of the service's life -- resubscribe after a
                // backoff, same posture as the alert-floor status pipeline.
                .retryWhen { cause, attempt ->
                    Timber.e(cause, "Sync mode signal failed (attempt %d); retrying", attempt + 1)
                    delay(MODE_SIGNAL_RETRY_DELAY_MS)
                    true
                }
                .distinctUntilChanged()
                .collectLatest { configured ->
                    if (configured) syncLoop() else standDown()
                }
        }
        pendingCountJob = scope.launch {
            syncDao.observePendingCount().collect { count ->
                _syncStatus.value = _syncStatus.value.copy(pendingCount = count)
            }
        }
    }

    fun stop() {
        syncLoopJob?.cancel()
        syncLoopJob = null
        pendingCountJob?.cancel()
        pendingCountJob = null
    }

    fun triggerSync() {
        triggerChannel.trySend(Unit)
    }

    private suspend fun syncLoop() {
        while (true) {
            try {
                processQueue()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // A transient DB failure in the hygiene or drain path must not kill this
                // collector -- it also carries the stand-down lifecycle. Recover on the
                // next poll, same posture as standDown().
                Timber.w(e, "Sync pass failed")
            }
            // Wait for either a trigger or the poll interval, whichever comes first
            select {
                triggerChannel.onReceive {}
                onTimeout(POLL_INTERVAL_MS) {}
            }
        }
    }

    /**
     * No backend is configured: the outbound copies have no destination, so purge them and
     * idle (no 3s wake) until a base URL appears. Sweeps hourly rather than once because a
     * BLE-only device keeps producing raw history rows, and an enqueue racing the mode flip
     * can slip a row in just after a one-shot purge -- the sweep re-collects both. Covers the
     * full-stack -> BLE-only transition and a device that accumulated rows before enqueueing
     * was mode-gated. Logout is NOT this path -- it preserves the base URL, so the queue
     * survives (bounded by [processQueue]'s prune) to drain on re-login.
     */
    internal suspend fun standDown() {
        while (true) {
            try {
                purgeUndeliverable()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // A failed purge must not kill this collector -- it is also what restarts
                // syncing when a backend is configured later. Retry on the next sweep.
                Timber.w(e, "Stand-down purge failed")
            }
            delay(STAND_DOWN_SWEEP_INTERVAL_MS)
        }
    }

    internal suspend fun purgeUndeliverable() {
        val purged = syncDao.deleteAll()
        // The raw upload copies are undeliverable too; only the max-sequence row survives as
        // the poller's resume anchor. Without this a BLE-only device would grow the raw table
        // forever -- nothing ever marks its rows sent, and cleanup() only deletes sent rows.
        val rawPurged = rawHistoryLogDao.deleteAllButMaxSequence()
        if (purged > 0 || rawPurged > 0) {
            Timber.i(
                "Stand-down purge: %d sync item(s), %d raw history row(s) (no backend configured)",
                purged, rawPurged,
            )
        }
        _syncStatus.value = _syncStatus.value.copy(lastSyncAtMs = 0L, lastError = null)
    }

    internal suspend fun pruneQueueIfNeeded() {
        val count = syncDao.countAll()
        if (count > MAX_QUEUE_SIZE) {
            val excess = count - MAX_QUEUE_SIZE
            syncDao.pruneOldest(excess)
            Timber.w("Sync queue pruned: removed %d oldest items (was %d, max %d)", excess, count, MAX_QUEUE_SIZE)
        }
    }

    private suspend fun cleanupIfNeeded() {
        val now = System.currentTimeMillis()
        if (now - lastCleanupMs < CLEANUP_INTERVAL_MS) return
        lastCleanupMs = now
        val cutoffMs = now - (appSettingsStore.dataRetentionDays * 24L * 60 * 60 * 1000)
        syncDao.cleanup(maxRetries = MAX_RETRIES, cutoffMs = cutoffMs)
    }

    internal suspend fun processQueue() {
        // Local queue hygiene runs BEFORE the drain gates: with sync disabled or no active
        // session (signed out, refresh token expired) the enqueuer keeps writing, so the size
        // bound must not depend on being able to drain. Only the network drain below requires
        // a session. When gated, hygiene drops to the idle cadence -- the bound doesn't need
        // 3s granularity in a posture that can persist for weeks.
        val canDrain = appSettingsStore.backendSyncEnabled && authTokenStore.hasActiveSession()
        val now = System.currentTimeMillis()
        if (canDrain || now - lastIdleHygieneMs >= IDLE_HYGIENE_INTERVAL_MS) {
            lastIdleHygieneMs = now
            // Reset orphaned 'sending' items that got stuck after a crash or cancellation
            syncDao.resetStaleSending(now - STALE_SENDING_TIMEOUT_MS)
            pruneQueueIfNeeded()
            cleanupIfNeeded()
        }
        if (!canDrain) return

        val batch = syncDao.getPendingBatch(limit = BATCH_SIZE, maxRetries = MAX_RETRIES)
        if (batch.isEmpty()) return

        val ids = batch.map { it.id }
        val failedParseIds = mutableListOf<Long>()
        syncDao.markSending(ids)

        val adapter = moshi.adapter(PumpEventDto::class.java)
        val events = batch.mapNotNull { entity ->
            try {
                adapter.fromJson(entity.payload)
            } catch (e: Exception) {
                Timber.w(e, "Failed to parse sync queue item %d", entity.id)
                failedParseIds.add(entity.id)
                null
            }
        }

        // Mark unparseable items as permanently failed
        if (failedParseIds.isNotEmpty()) {
            syncDao.markFailed(failedParseIds, "JSON parse error")
        }

        val validIds = ids - failedParseIds.toSet()
        if (events.isEmpty()) return

        // Collect unsent raw history logs to include in the push
        val rawLogs = rawHistoryLogDao.getUnsent(limit = RAW_BATCH_SIZE)
        val rawEventDtos = rawLogs.map { log ->
            PumpRawEventDto(
                sequenceNumber = log.sequenceNumber,
                rawBytesB64 = log.rawBytesB64,
                eventTypeId = log.eventTypeId,
                pumpTimeSeconds = log.pumpTimeSeconds,
            )
        }

        // Map cached hardware info to DTO
        val hardwareDto = cachedHardwareInfo?.let { info ->
            PumpHardwareInfoDto(
                serialNumber = info.serialNumber,
                modelNumber = info.modelNumber,
                partNumber = info.partNumber,
                pumpRev = info.pumpRev,
                armSwVer = info.armSwVer,
                mspSwVer = info.mspSwVer,
                configABits = info.configABits,
                configBBits = info.configBBits,
                pcbaSn = info.pcbaSn,
                pcbaRev = info.pcbaRev,
                pumpFeatures = info.pumpFeatures,
            )
        }

        val request = PumpPushRequest(
            events = events,
            rawEvents = rawEventDtos.ifEmpty { null },
            pumpInfo = hardwareDto,
        )
        // Only the network call is inside the catch: a DAO failure after the server already
        // accepted the batch must not be mislabeled as a push failure (rows stay 'sending'
        // and resetStaleSending reclaims them; the backend dedupes the resend).
        val response = try {
            api.pushPumpEvents(request)
        } catch (e: CancellationException) {
            // A mode flip cancels this loop via collectLatest mid-push; that is a clean
            // switch, not a failed upload -- items stay 'sending' and resetStaleSending
            // reclaims them if the push never completed.
            throw e
        } catch (e: Exception) {
            // Thrown = transport failure (Response<> returns all HTTP statuses): the server
            // never received the batch. Counting these against MAX_RETRIES would exhaust the
            // queue ~62s into an outage and the hourly cleanup would delete it -- discarding
            // everything older than a minute instead of draining on reconnect.
            val error = e.message ?: "Unknown network error"
            syncDao.markTransientFailure(validIds.toList(), error)
            _syncStatus.value = _syncStatus.value.copy(lastError = error)
            Timber.w(e, "Sync push network error")
            return
        }
        if (response.isSuccessful) {
            syncDao.deleteSent(validIds.toList())
            // Mark raw logs as sent on success
            if (rawLogs.isNotEmpty()) {
                rawHistoryLogDao.markSent(rawLogs.map { it.id })
            }
            _syncStatus.value = _syncStatus.value.copy(
                lastSyncAtMs = System.currentTimeMillis(),
                lastError = null,
            )
            Timber.d(
                "Sync push: accepted=%d, duplicates=%d, raw_accepted=%d, raw_duplicates=%d",
                response.body()?.accepted ?: 0,
                response.body()?.duplicates ?: 0,
                response.body()?.rawAccepted ?: 0,
                response.body()?.rawDuplicates ?: 0,
            )
        } else {
            val code = response.code()
            val error = "HTTP $code"
            // 5xx/429/408 mean the server is reachable but transiently erroring (deploy,
            // restart, rate limit, gateway timeout) -- like transport failures, they must
            // not burn the retry budget. The remaining 4xx are treated as client rejections
            // that will never be accepted, so they keep counting and give up after
            // MAX_RETRIES.
            if (code >= 500 || code == 429 || code == 408) {
                syncDao.markTransientFailure(validIds.toList(), error)
            } else {
                syncDao.markFailed(validIds.toList(), error)
            }
            _syncStatus.value = _syncStatus.value.copy(lastError = error)
            Timber.w("Sync push failed: %s", error)
        }
    }
}
