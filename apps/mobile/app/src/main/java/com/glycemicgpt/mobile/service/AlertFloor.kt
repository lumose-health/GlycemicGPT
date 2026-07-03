package com.glycemicgpt.mobile.service

import com.glycemicgpt.mobile.data.local.AlertThresholdStore
import com.glycemicgpt.mobile.data.local.AppSettingsStore
import com.glycemicgpt.mobile.data.local.dao.AlertDao
import com.glycemicgpt.mobile.data.local.entity.AlertEntity
import com.glycemicgpt.mobile.data.network.NetworkMonitor
import com.glycemicgpt.mobile.domain.alerting.AlertSeverities
import com.glycemicgpt.mobile.domain.alerting.AlertTypes
import com.glycemicgpt.mobile.domain.alerting.isAlertingDegraded
import com.glycemicgpt.mobile.domain.format.GlucoseFormat
import com.glycemicgpt.mobile.domain.freshness.FreshnessPolicy
import com.glycemicgpt.mobile.domain.freshness.isFreshForAlertFloor
import com.glycemicgpt.mobile.domain.model.CgmReading
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The on-device, freshness-gated alert floor (GLY-115): when the backend cannot deliver alerts,
 * the phone itself fires a low/high OS alarm off the just-polled CGM reading — but ONLY on a
 * genuinely FRESH reading. Threshold-only by design: no trajectory projection, no prediction
 * horizons, no IoB escalation — those stay server-side.
 *
 * THE SAFETY INVARIANT: never fire on a non-FRESH reading. Alerting on stale cached CGM would be
 * a silent floor — the user hears an alarm engine that is actually reasoning about old data, or
 * worse, hears nothing and believes they are covered. When this class cannot vouch for the data,
 * it stays silent and the degraded surface says "NOT watching"
 * ([com.glycemicgpt.mobile.presentation.alerts.alertFloorStatus] mirrors these gates exactly).
 *
 * Four preconditions, ALL required before firing:
 *  1. Server alerting degraded — [isAlertingDegraded]; while REACHABLE+CONNECTED the server owns
 *     alerting and the floor is silent (primary dedup layer).
 *  2. Reading FRESH — [isFreshForAlertFloor] against the CGM's own sensor timestamp (never poll
 *     wall-clock), with the clock-skew guard, using the debug-swapped policy when the
 *     fast-staleness fault toggle is on.
 *  3. Thresholds synced at least once — [AlertThresholdStore.isSynced]; never alarm off
 *     hardcoded defaults.
 *  4. POST_NOTIFICATIONS granted — checked here (and again inside
 *     [AlertNotificationManager.showAlertNotification]).
 *
 * Dedup against the server (no shared UUIDs — the phone cannot predict server alert IDs):
 * gate 1 kills the double-fire at the source; the shared
 * [AlertNotificationManager.stableNotificationId] slot (`alertType|patientName`) makes a server
 * re-delivery on reconnect REPLACE the floor notification instead of stacking; a per-type
 * cooldown mirroring the server's 30-minute dedup window stops a sustained low from re-alarming
 * every poll; and the episode guard seeds that cooldown from Room's server-alert history so the
 * floor does not re-alarm a low the server already announced just before the connection dropped.
 *
 * Like the server's dedup, the suppression window is ACK-GATED: the backend only dedups against
 * unacknowledged alerts (an acked alert means the user saw it — a recurrence is a new emergency
 * and re-alerts immediately). The floor mirrors that: the episode guard ignores acknowledged
 * server alerts, and [onFloorAlertAcknowledged] clears the type's cooldown, so an ack can never
 * silence a NEW distinct low that develops minutes later — exactly the window where the floor is
 * the only guard.
 *
 * Fires in the server's AlertType vocabulary ([AlertTypes], matching the backend's
 * `models/alert.py`), NOT the watch relay's strings — the notification slot and channel routing
 * key off the server vocabulary, and mixing them would break both.
 */
@Singleton
class AlertFloor @Inject constructor(
    private val alertThresholdStore: AlertThresholdStore,
    private val alertNotificationManager: AlertNotificationManager,
    private val alertStreamStateHolder: AlertStreamStateHolder,
    private val networkMonitor: NetworkMonitor,
    private val alertDao: AlertDao,
    private val appSettingsStore: AppSettingsStore,
) {

    /** Wall-clock ms of the floor's last fire per alert type. Guarded by [fireMutex]. */
    private val lastFiredAtMsByType = mutableMapOf<String, Long>()
    private val fireMutex = Mutex()

    /**
     * Classify a CGM value against the synced server alert thresholds, in the server's AlertType
     * vocabulary. Urgent bands win over warning bands, mirroring both the server's evaluation
     * order and the previous display-range classifier. Returns null in range.
     *
     * Uses the store's defaults before the first sync — acceptable for the watch relay that also
     * consumes this classification, but [onCgmReading]'s synced-once gate keeps the floor itself
     * from ever alarming off those defaults.
     */
    fun classify(mgDl: Int): String? = when {
        mgDl <= alertThresholdStore.urgentLowMgDl -> AlertTypes.LOW_URGENT
        mgDl >= alertThresholdStore.urgentHighMgDl -> AlertTypes.HIGH_URGENT
        mgDl <= alertThresholdStore.lowWarningMgDl -> AlertTypes.LOW_WARNING
        mgDl >= alertThresholdStore.highWarningMgDl -> AlertTypes.HIGH_WARNING
        else -> null
    }

    /**
     * The user acknowledged a floor notification of [alertType] ("Got It"). Clears the type's
     * cooldown so a NEW crossing minutes later alarms again — mirroring the server, whose dedup
     * only counts unacknowledged alerts. An ack means "seen", never "snooze for the rest of the
     * window": suppressing a fresh distinct low after an ack is exactly the silent-floor failure
     * this class exists to prevent. A sustained, un-recovered low re-firing right after an ack is
     * the accepted cost, and matches what the server does online.
     */
    suspend fun onFloorAlertAcknowledged(alertType: String) {
        fireMutex.withLock { lastFiredAtMsByType.remove(alertType) }
    }

    /**
     * Evaluate the floor for a just-polled (or debug-injected) CGM reading. [alertType] is the
     * [classify] result for the reading, in server vocabulary; null means in range and is a no-op.
     * [nowMs] is injectable for tests only.
     */
    suspend fun onCgmReading(
        reading: CgmReading,
        alertType: String?,
        nowMs: Long = System.currentTimeMillis(),
    ) {
        if (alertType == null) return

        // Gate 1: arm only while the server cannot alert. While the stream is healthy the server
        // is the sole alerting source and the floor must stay silent.
        if (!isAlertingDegraded(networkMonitor.status.value, alertStreamStateHolder.state.value)) {
            return
        }

        // Gate 3: never alarm off hardcoded defaults. A never-synced device shows "monitoring
        // degraded" instead of guessing thresholds.
        if (!alertThresholdStore.isSynced()) {
            Timber.w("Alert floor suppressed: thresholds never synced (type=%s)", alertType)
            return
        }

        // Gate 2: FRESH readings only, judged on the CGM's own sensor timestamp — a warmup or
        // signal-loss poll can succeed every 15s while returning the same old sensor value.
        val freshnessThresholds = FreshnessPolicy.cgm(appSettingsStore.debugFastStaleness)
        val ageMs = nowMs - reading.timestamp.toEpochMilli()
        if (!isFreshForAlertFloor(ageMs, freshnessThresholds)) {
            Timber.w(
                "Alert floor suppressed: reading not FRESH (type=%s, ageMs=%d) — NOT watching",
                alertType, ageMs,
            )
            return
        }

        // Gate 4: a floor that cannot post is not a floor. Checked before the cooldown is
        // stamped so a permission granted a minute later doesn't find the alarm already "spent".
        if (!alertNotificationManager.canPostAlertNotifications()) {
            Timber.w("Alert floor suppressed: POST_NOTIFICATIONS not granted (type=%s)", alertType)
            return
        }

        fireMutex.withLock {
            val lastFiredAtMs = lastFiredAtMsByType[alertType]
            if (lastFiredAtMs != null && nowMs - lastFiredAtMs < FLOOR_COOLDOWN_MS) {
                return
            }

            // Episode guard: if the server announced this same alert type within the window and
            // the user has NOT acknowledged it (Room keeps the server alert history), the low
            // predates the outage and is still actively alarmed — seed the cooldown from it
            // instead of re-alarming across the REACHABLE→UNREACHABLE flip. Acked alerts are
            // excluded in the query, mirroring the server's ack-gated dedup.
            val recentServerAlertMs = try {
                alertDao.getLatestUnacknowledgedTimestampForType(alertType, nowMs - FLOOR_COOLDOWN_MS)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // Fail toward alerting: a broken episode lookup may cost one duplicate alarm,
                // never a missed one.
                Timber.w(e, "Alert floor episode lookup failed; proceeding to fire")
                null
            }
            if (recentServerAlertMs != null) {
                // Clamp the seed: a server timestamp ahead of this phone's clock would otherwise
                // stretch the suppression window past 30 minutes by the skew amount.
                lastFiredAtMsByType[alertType] = minOf(recentServerAlertMs, nowMs)
                Timber.d(
                    "Alert floor suppressed: server already alerted %s at %d (episode guard)",
                    alertType, recentServerAlertMs,
                )
                return
            }

            val entity = buildFloorAlertEntity(alertType, reading)
            alertNotificationManager.showAlertNotification(
                entity,
                alertNotificationManager.stableNotificationId(entity),
            )
            lastFiredAtMsByType[alertType] = nowMs
            Timber.i(
                "Alert floor fired: %s at %d mg/dL (reading ageMs=%d)",
                alertType, reading.glucoseMgDl, ageMs,
            )
        }
    }

    /**
     * A floor alert as an [AlertEntity] — the shape [AlertNotificationManager] renders. Never
     * persisted to Room (the alerts table is server history); the `local-floor:` serverId prefix
     * tells [AlertActionReceiver] there is no server record to acknowledge. The message carries
     * the device-computed provenance and its limits; the title stays the glanceable
     * severity + value line the manager already builds.
     */
    private fun buildFloorAlertEntity(alertType: String, reading: CgmReading): AlertEntity {
        val glucoseLabel =
            GlucoseFormat.formatWithLabel(reading.glucoseMgDl, appSettingsStore.glucoseUnit)
        return AlertEntity(
            serverId = AlertNotificationManager.LOCAL_FLOOR_ID_PREFIX +
                "$alertType:${reading.timestamp.toEpochMilli()}",
            alertType = alertType,
            severity = if (alertType == AlertTypes.LOW_URGENT || alertType == AlertTypes.HIGH_URGENT) {
                AlertSeverities.URGENT
            } else {
                AlertSeverities.WARNING
            },
            message = "${floorHeadline(alertType)} $glucoseLabel — computed on your phone from " +
                "your last sensor reading. Threshold-only, no prediction. Not a replacement " +
                "for your CGM app.",
            currentValue = reading.glucoseMgDl.toDouble(),
            timestampMs = reading.timestamp.toEpochMilli(),
        )
    }

    companion object {
        /** Re-alarm suppression window per unacknowledged alert type, mirroring the server's
         *  `DEDUP_WINDOW_MINUTES = 30` so floor and server agree on what "the same episode" is.
         *  Ack-gated like the server's — see the class KDoc and [onFloorAlertAcknowledged]. */
        const val FLOOR_COOLDOWN_MS = 30 * 60_000L

        private fun floorHeadline(alertType: String): String = when (alertType) {
            AlertTypes.LOW_URGENT -> "Urgent low glucose"
            AlertTypes.LOW_WARNING -> "Low glucose"
            AlertTypes.HIGH_WARNING -> "High glucose"
            AlertTypes.HIGH_URGENT -> "Urgent high glucose"
            else -> "Glucose alert"
        }
    }
}
