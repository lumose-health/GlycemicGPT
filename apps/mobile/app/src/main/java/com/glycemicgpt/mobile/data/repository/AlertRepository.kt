package com.glycemicgpt.mobile.data.repository

import com.glycemicgpt.mobile.data.local.dao.AlertDao
import com.glycemicgpt.mobile.data.local.entity.AlertEntity
import com.glycemicgpt.mobile.data.remote.GlycemicGptApi
import com.glycemicgpt.mobile.data.remote.dto.AlertResponse
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import timber.log.Timber
import java.io.IOException
import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton

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

    /** Serializes reconcile passes so the REACHABLE-transition trigger and the refresh path
     *  don't both POST the same pending acks (harmless — the endpoint is idempotent — but noisy). */
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
     * Acknowledge an alert: mark the local row first — unconditionally — then attempt the server
     * POST. The local mark is the safety-critical half (it is what keeps the alarm silenceable
     * offline) and must never depend on the network; the server ack is deferred to
     * [reconcilePendingAcks] when the POST can't land now.
     *
     * The returned [Result] reflects only the server sync: callers use it to pick honest copy,
     * never to gate local silencing.
     */
    suspend fun acknowledgeAlert(serverId: String): Result<Unit> {
        alertDao.markAcknowledgedPending(serverId)
        return runCatching {
            val response = api.acknowledgeAlert(serverId)
            when {
                response.isSuccessful -> alertDao.markAckSynced(serverId)
                response.code() in TERMINAL_ACK_CODES -> {
                    // Retrying can't fix these; stop the reconcile from re-POSTing but still
                    // surface the failure so the caller can show a real error.
                    alertDao.markAckSynced(serverId)
                    throw RuntimeException("Acknowledge failed: HTTP ${response.code()}")
                }
                else -> throw RuntimeException("Acknowledge failed: HTTP ${response.code()}")
            }
        }
    }

    /**
     * Push every locally-acknowledged-but-unsynced alert to the server. Safe to call
     * opportunistically (the endpoint is idempotent): on each pending row, 2xx or a terminal 4xx
     * stamps `ack_synced=1`; transport failures and 5xx leave it pending for the next trigger.
     */
    suspend fun reconcilePendingAcks() {
        reconcileMutex.withLock {
            val pending = alertDao.getPendingAckServerIds()
            if (pending.isEmpty()) return
            Timber.d("Reconciling %d pending alert acknowledgement(s)", pending.size)
            for (serverId in pending) {
                try {
                    val response = api.acknowledgeAlert(serverId)
                    when {
                        response.isSuccessful -> {
                            alertDao.markAckSynced(serverId)
                            Timber.d("Reconciled deferred ack for alert %s", serverId)
                        }
                        response.code() in TERMINAL_ACK_CODES -> {
                            alertDao.markAckSynced(serverId)
                            Timber.w(
                                "Server rejected deferred ack for alert %s terminally (HTTP %d); not retrying",
                                serverId, response.code(),
                            )
                        }
                        else -> Timber.w(
                            "Deferred ack for alert %s failed transiently (HTTP %d); will retry",
                            serverId, response.code(),
                        )
                    }
                } catch (e: IOException) {
                    // Transport failure: the backend is (still) unreachable, so the remaining
                    // POSTs would fail the same way — bail and wait for the next trigger.
                    Timber.w(e, "Ack reconcile interrupted; %s stays pending", serverId)
                    return
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
