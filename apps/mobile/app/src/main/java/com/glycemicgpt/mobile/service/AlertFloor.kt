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
import com.glycemicgpt.mobile.domain.freshness.ALERT_FLOOR_MAX_FUTURE_SKEW_MS
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
 *  3. Thresholds configured — [AlertThresholdStore.isConfigured], from either a backend sync
 *     or the local Settings editor (GLY-145); never alarm off hardcoded defaults.
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
 * unacknowledged alerts, so the episode guard ignores acknowledged server alerts. A "Got It" on
 * a floor alert ([onFloorAlertAcknowledged]) means "seen", with bounded-snooze episode
 * semantics: the ongoing episode is silenced and the cooldown restarts from the ack; any
 * evaluated reading that no longer classifies as the acked type fully re-arms it (a re-cross is
 * a distinct episode and alarms immediately); and a sustained, never-recovering low re-alarms
 * [FLOOR_COOLDOWN_MS] after the ack — the floor never goes permanently silent on an ongoing
 * emergency. (Deliberate divergence from the server, which re-alerts an acked sustained low on
 * its own evaluation cadence: re-alarming every 15s poll would be alarm-spam that trains users
 * to disable notifications.)
 *
 * Wall-clock rewind guard: [isFreshForAlertFloor] can only defend forward skew statelessly. A
 * BACKWARD wall-clock jump (NTP correction, manual change) shrinks a stale reading's apparent
 * age, so this class keeps a high-water mark of every wall-clock time it has observed
 * ([noteWallClock], also fed by [AlertFloorStatusProvider]'s tick) and refuses to evaluate — and
 * the surface refuses to claim watching — while `now` runs more than the skew tolerance behind
 * it ([isWallClockRewound]). Fails closed with the honest "NOT watching" surface until the wall
 * clock catches back up. Residual: a rewind while the process is not running leaves no water
 * mark, so a stale reading can under-age by the rewind amount — a rare over-alarm edge that
 * fails toward alarming, never toward silence.
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

    /** Wall-clock ms of the floor's last fire (or last ack) per alert type. Guarded by [fireMutex]. */
    private val lastFiredAtMsByType = mutableMapOf<String, Long>()

    /** Types acknowledged mid-episode: suppressed until recovery or the cooldown elapses, then
     *  fully re-armed. Guarded by [fireMutex]. */
    private val ackedTypes = mutableSetOf<String>()
    private val fireMutex = Mutex()

    /** Highest wall-clock ms ever observed by the floor (evaluations + status ticks). Monotonic
     *  max; a plain @Volatile is enough — a lost racing update can only lower the mark slightly,
     *  never raise it wrongly. */
    @Volatile
    private var wallClockHighWaterMs = 0L

    /** Record an observed wall-clock time. Called on every evaluation and every status tick so
     *  the rewind guard has a recent reference even when no CGM is flowing. */
    fun noteWallClock(nowMs: Long) {
        if (nowMs > wallClockHighWaterMs) {
            wallClockHighWaterMs = nowMs
        }
    }

    /**
     * True when [nowMs] runs more than the skew tolerance behind the highest wall-clock time
     * ever observed — i.e. the wall clock jumped backward. While true, sensor ages computed
     * from the wall clock are understated and must not be trusted: the floor suppresses and
     * the surface says NOT watching until the clock catches back up.
     */
    fun isWallClockRewound(nowMs: Long): Boolean =
        nowMs + ALERT_FLOOR_MAX_FUTURE_SKEW_MS < wallClockHighWaterMs

    /**
     * Classify a CGM value against the configured alert thresholds, in the server's AlertType
     * vocabulary. Urgent bands win over warning bands, mirroring both the server's evaluation
     * order and the previous display-range classifier. Returns null in range.
     *
     * Uses the store's defaults while unconfigured — acceptable for the watch relay that also
     * consumes this classification, but [onCgmReading]'s configured gate keeps the floor itself
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
     * The single data-trust bound shared by every consumer that may alert a human off a local
     * pump CGM reading (GLY-116 D2): true only when [reading] is safe to alarm on — FRESH by the
     * active CGM policy against the reading's own sensor timestamp, thresholds configured from
     * either source, and the wall clock not running behind previously observed time. The floor's firing
     * path ([onCgmReading]) and the watch relay (`PumpPollingOrchestrator.processCgmReading`)
     * both call THIS function; a second staleness definition on either path is the silent-floor
     * bug GLY-115/116 exist to prevent.
     *
     * Deliberately NOT part of this bound: degraded-state, notification permission, cooldowns —
     * those are floor-firing concerns that wrap around the predicate, not data-trust concerns
     * (a stale reading must not alert the wrist whether the backend is up or down).
     *
     * NOT pure: every evaluation also feeds [noteWallClock], so each caller (floor and relay
     * alike) advances the rewind guard's high-water mark. Deliberate and safe in one direction
     * only — the mark is a monotonic max, so extra observations can only make rewind detection
     * MORE aggressive, never mask a rewind — and it means the guard keeps a recent reference
     * even when only the relay is evaluating readings.
     */
    fun isReadingAlertable(
        reading: CgmReading,
        nowMs: Long = System.currentTimeMillis(),
    ): Boolean {
        if (isWallClockRewound(nowMs)) return false
        noteWallClock(nowMs)
        if (!alertThresholdStore.isConfigured()) return false
        val thresholds = FreshnessPolicy.cgm(appSettingsStore.debugFastStaleness)
        return isFreshForAlertFloor(nowMs - reading.timestamp.toEpochMilli(), thresholds)
    }

    /**
     * The user acknowledged a floor notification of [alertType] ("Got It"). Bounded-snooze
     * episode semantics — an ack means "seen", never "snooze forever" and never "re-alarm the
     * same episode every poll":
     *  - the ongoing episode is silenced and the cooldown restarts from the ack;
     *  - any evaluated reading that no longer classifies as this type re-arms it fully (see
     *    [onCgmReading]'s recovery handling) — a re-cross is a distinct episode and alarms
     *    immediately;
     *  - a sustained low that never recovers re-alarms [FLOOR_COOLDOWN_MS] after the ack, so
     *    the floor cannot go permanently silent on an ongoing emergency.
     */
    suspend fun onFloorAlertAcknowledged(
        alertType: String,
        nowMs: Long = System.currentTimeMillis(),
    ) {
        fireMutex.withLock {
            lastFiredAtMsByType[alertType] = nowMs
            ackedTypes.add(alertType)
        }
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
        // Wall-clock rewind guard, BEFORE anything trusts a wall-clock age: while the clock runs
        // behind the high-water mark, sensor ages are understated and nothing may fire. Recovery
        // handling is also skipped — an understated age could fake a recovery reading too.
        if (isWallClockRewound(nowMs)) {
            Timber.w(
                "Alert floor suppressed: wall clock rewound (now=%d, highWater=%d) — NOT watching",
                nowMs, wallClockHighWaterMs,
            )
            return
        }
        noteWallClock(nowMs)

        // Episode recovery: every evaluated reading that no longer classifies as an acked type
        // proves that episode ended — fully re-arm the type so the next crossing alarms
        // immediately as a distinct episode. Only acked types re-arm this way: unacknowledged
        // cooldowns deliberately survive boundary flapping (the notification is still up, and
        // re-alarming every crossing of a hovering glucose is the spam the window exists to stop).
        fireMutex.withLock {
            val recovered = ackedTypes.filter { it != alertType }
            recovered.forEach {
                ackedTypes.remove(it)
                lastFiredAtMsByType.remove(it)
            }
        }

        if (alertType == null) return

        // Gate 1: arm only while the server cannot alert. While the stream is healthy the server
        // is the sole alerting source and the floor must stay silent.
        if (!isAlertingDegraded(networkMonitor.status.value, alertStreamStateHolder.state.value)) {
            return
        }

        // Gates 2+3 via the shared data-trust bound (GLY-116 D2): FRESH readings only, judged on
        // the CGM's own sensor timestamp — a warmup or signal-loss poll can succeed every 15s
        // while returning the same old sensor value — and never off unconfigured defaults. The
        // watch relay gates on the SAME predicate; only the log detail is computed here. The
        // predicate re-runs the rewind check (known false here) and noteWallClock (idempotent
        // monotonic max) — the small overlap is the cost of one bound in one place.
        val ageMs = nowMs - reading.timestamp.toEpochMilli()
        if (!isReadingAlertable(reading, nowMs)) {
            if (!alertThresholdStore.isConfigured()) {
                Timber.w("Alert floor suppressed: thresholds never configured (type=%s)", alertType)
            } else {
                Timber.w(
                    "Alert floor suppressed: reading not FRESH (type=%s, ageMs=%d) — NOT watching",
                    alertType, ageMs,
                )
            }
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
            // A fresh fire is a new, unacknowledged notification: the acked flag from a
            // previous episode must not carry over.
            ackedTypes.remove(alertType)
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
