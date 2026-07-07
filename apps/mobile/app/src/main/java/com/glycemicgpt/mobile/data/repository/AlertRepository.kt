package com.glycemicgpt.mobile.data.repository

import com.glycemicgpt.mobile.data.local.dao.AlertDao
import com.glycemicgpt.mobile.data.local.entity.AlertEntity
import com.glycemicgpt.mobile.data.remote.GlycemicGptApi
import com.glycemicgpt.mobile.data.remote.dto.AcknowledgeResponse
import com.glycemicgpt.mobile.data.remote.dto.AlertResponse
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import retrofit2.Response
import timber.log.Timber
import java.io.IOException
import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The server answered an acknowledge POST with a non-2xx. [terminal] mirrors the
 * terminal-code classification: `true` means retrying can never succeed (the row was stamped
 * synced to stop the reconcile); `false` means the ack stays pending and will auto-retry.
 * Callers use it to pick honest copy without re-deriving the classification.
 */
class AlertAckHttpException(val code: Int, val terminal: Boolean) :
    RuntimeException("Acknowledge failed: HTTP $code")

@Singleton
class AlertRepository @Inject constructor(
    private val alertDao: AlertDao,
    private val api: GlycemicGptApi,
) {

    companion object {
        /**
         * Server-ack responses that will never succeed on retry: 404 (alert expired/unknown),
         * 403 (not the owner), 422 (malformed id). The local acknowledgement already silenced
         * the alarm, so these stop the reconcile from retrying forever; everything else
         * (transport failures, 5xx, 401 before a token refresh) is transient and stays pending.
         */
        private val TERMINAL_ACK_CODES = setOf(403, 404, 422)
    }

    /** Outcome of one server-ack attempt; the single classification both ack paths share. */
    private enum class AckOutcome { SYNCED, TERMINAL, TRANSIENT }

    private fun ackOutcomeOf(response: Response<AcknowledgeResponse>): AckOutcome = when {
        response.isSuccessful -> AckOutcome.SYNCED
        response.code() in TERMINAL_ACK_CODES -> AckOutcome.TERMINAL
        else -> AckOutcome.TRANSIENT
    }

    /** Serializes reconcile passes so the REACHABLE-transition trigger, the SSE-open trigger,
     *  and the refresh path don't all POST the same pending acks (harmless — the endpoint is
     *  idempotent — but noisy). */
    private val reconcileMutex = Mutex()

    fun observeRecentAlerts(): Flow<List<AlertEntity>> = alertDao.observeRecentAlerts()

    /**
     * Persist a server-delivered alert and return the row actually stored. A locally-acknowledged
     * row is never downgraded by a stale server echo (see [AlertDao.insertPreservingLocalAck]);
     * callers must branch on the returned entity's `acknowledged`, not on the raw response.
     */
    suspend fun saveAlert(response: AlertResponse): AlertEntity {
        val timestampMs = try {
            Instant.parse(response.timestamp).toEpochMilli()
        } catch (e: Exception) {
            System.currentTimeMillis()
        }

        return alertDao.insertPreservingLocalAck(
            AlertEntity(
                serverId = response.id,
                alertType = response.alertType,
                severity = response.severity,
                message = response.message,
                currentValue = response.currentValue,
                predictedValue = response.predictedValue,
                iobValue = response.iobValue,
                trendRate = response.trendRate,
                patientName = response.patientName,
                acknowledged = response.acknowledged,
                // A server-acked alert has nothing left to sync.
                ackSynced = response.acknowledged,
                timestampMs = timestampMs,
            ),
        )
    }

    /**
     * The local-only half of [acknowledgeAlert]: mark the row acknowledged with the server sync
     * pending, and never throw. `AlertActionReceiver` calls this before its notification-side
     * silencing so the ack sticks in Room before any time is spent on other work — an SSE
     * re-delivery landing mid-silence then can't pass the acknowledged-row guard and re-alarm.
     */
    suspend fun markAcknowledgedLocally(serverId: String) {
        runCatching { alertDao.markAcknowledgedPending(serverId) }
            .onFailure { e ->
                if (e is CancellationException) throw e
                Timber.e(e, "Failed to mark alert %s acknowledged locally", serverId)
            }
    }

    /**
     * Acknowledge an alert: mark the local row first — unconditionally — then attempt the server
     * POST. The local mark is the safety-critical half (it is what keeps the alarm silenceable
     * offline) and must never depend on the network; the server ack is deferred to
     * [reconcilePendingAcks] when the POST can't land now.
     *
     * Never throws. The returned [Result] reflects only the server sync — a failure carries
     * [AlertAckHttpException] (typed terminal-vs-transient) or the transport exception, so
     * callers can pick honest copy without gating local silencing on it.
     */
    suspend fun acknowledgeAlert(serverId: String): Result<Unit> = runCatching {
        alertDao.markAcknowledgedPending(serverId)
        val response = api.acknowledgeAlert(serverId)
        when (ackOutcomeOf(response)) {
            AckOutcome.SYNCED -> alertDao.markAckSynced(serverId)
            AckOutcome.TERMINAL -> {
                // Retrying can't fix these; stop the reconcile from re-POSTing but still
                // surface the failure so the caller can show a real error.
                alertDao.markAckSynced(serverId)
                throw AlertAckHttpException(response.code(), terminal = true)
            }
            AckOutcome.TRANSIENT ->
                throw AlertAckHttpException(response.code(), terminal = false)
        }
    }.onFailure { e ->
        // runCatching captures CancellationException too; rethrow so cancellation of the
        // calling scope stays cooperative (the local mark has already landed by then).
        if (e is CancellationException) throw e
    }

    /**
     * Push every locally-acknowledged-but-unsynced alert to the server. Never throws and is safe
     * to call opportunistically (the endpoint is idempotent): on each pending row, 2xx or a
     * terminal 4xx stamps `ack_synced=1`; transport failures, 5xx, and unexpected errors leave
     * it pending for the next trigger. Triggers: NetworkMonitor's transition to REACHABLE, a
     * fresh SSE stream connection, and the pull in [fetchPendingAlerts].
     */
    suspend fun reconcilePendingAcks() {
        reconcileMutex.withLock {
            val pending = try {
                alertDao.getPendingAckServerIds()
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                Timber.e(e, "Could not read pending alert acks; skipping reconcile")
                return
            }
            if (pending.isEmpty()) return
            Timber.d("Reconciling %d pending alert acknowledgement(s)", pending.size)
            for (serverId in pending) {
                try {
                    val response = api.acknowledgeAlert(serverId)
                    when (ackOutcomeOf(response)) {
                        AckOutcome.SYNCED -> {
                            alertDao.markAckSynced(serverId)
                            Timber.d("Reconciled deferred ack for alert %s", serverId)
                        }
                        AckOutcome.TERMINAL -> {
                            alertDao.markAckSynced(serverId)
                            Timber.w(
                                "Server rejected deferred ack for alert %s terminally (HTTP %d); not retrying",
                                serverId, response.code(),
                            )
                        }
                        AckOutcome.TRANSIENT -> Timber.w(
                            "Deferred ack for alert %s failed transiently (HTTP %d); will retry",
                            serverId, response.code(),
                        )
                    }
                } catch (e: IOException) {
                    // Transport failure: the backend is (still) unreachable, so the remaining
                    // POSTs would fail the same way — bail and wait for the next trigger.
                    Timber.w(e, "Ack reconcile interrupted; %s stays pending", serverId)
                    return
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    // Unexpected (malformed 2xx body, DB error): leave the row pending and move
                    // on. The reconcile runs on app-lifetime scopes and must never take down
                    // its caller.
                    Timber.e(e, "Deferred ack for alert %s failed unexpectedly; will retry", serverId)
                }
            }
        }
    }

    suspend fun getLatestUnacknowledgedServerId(): String? =
        alertDao.getLatestUnacknowledgedServerId()

    suspend fun fetchPendingAlerts(): Result<List<AlertResponse>> = runCatching {
        // Push deferred acks before pulling so the pull can't briefly resurrect an alert the
        // user already acknowledged offline.
        reconcilePendingAcks()
        val response = api.getPendingAlerts()
        if (response.isSuccessful) {
            val alerts = response.body() ?: emptyList()
            for (alert in alerts) {
                saveAlert(alert)
            }
            alerts
        } else {
            throw RuntimeException("Fetch alerts failed: HTTP ${response.code()}")
        }
    }

    suspend fun cleanupOldAlerts(maxAgeDays: Int = 7) {
        val cutoffMs = System.currentTimeMillis() - (maxAgeDays * 24 * 60 * 60 * 1000L)
        alertDao.deleteOlderThan(cutoffMs)
    }
}
