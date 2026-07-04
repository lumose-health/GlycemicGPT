package com.glycemicgpt.mobile.domain.alerting

import com.glycemicgpt.mobile.data.network.NetworkStatus
import com.glycemicgpt.mobile.domain.freshness.FreshnessThresholds
import com.glycemicgpt.mobile.domain.freshness.isFreshForAlertFloor
import com.glycemicgpt.mobile.service.AlertStreamState

/**
 * Whether server-pushed alerting is degraded: the alert SSE stream is not connected, or we can't
 * reach the backend at all. Either way no new server alerts arrive, and the UI must say so.
 *
 * Pure so the visibility rule is unit-testable. Deliberately pessimistic on disagreement between
 * the two signals — the SSE read timeout is minutes long, so [NetworkStatus] usually notices an
 * outage first; conversely a stream stuck reconnecting is degraded even while HTTP still works.
 */
fun isAlertingDegraded(networkStatus: NetworkStatus, streamState: AlertStreamState): Boolean =
    networkStatus != NetworkStatus.REACHABLE || streamState != AlertStreamState.CONNECTED

/**
 * Why the on-device alert floor cannot vouch for coverage, ordered by how actionable the cause
 * is for the user. When several preconditions fail at once the most actionable one is reported:
 * a denied notification permission is durable and user-fixable, unsynced thresholds usually
 * resolve on reconnect, a disconnected pump is a hardware state the user may be able to fix,
 * and a stale reading is the residual "nothing to act on" case.
 */
enum class FloorNotWatchingReason {
    NOTIFICATIONS_DENIED,
    THRESHOLDS_NOT_SYNCED,
    PUMP_DISCONNECTED,
    NO_FRESH_READING,
}

/**
 * Who, if anyone, is watching for glucose alerts right now (GLY-115).
 *
 * - [ServerActive] — backend reachable + SSE connected: the server owns alerting, the on-device
 *   floor stays silent, no degraded surface shows.
 * - [FloorWatching] — server alerting is degraded, but the on-device alert floor can vouch: the
 *   pump link is delivering readings, the latest reading is FRESH, the alert thresholds have
 *   synced at least once, and this device can post alarm notifications.
 * - [FloorNotWatching] — server alerting is degraded AND the floor cannot vouch. NOTHING is
 *   watching, and the surface must say so — claiming coverage here is the lethal lie GLY-115's
 *   AC2/AC7 pin against. Carries the most actionable failed precondition as [FloorNotWatching.reason]
 *   so the surface can tell the user what would actually restore coverage.
 */
sealed interface AlertFloorStatus {
    data object ServerActive : AlertFloorStatus
    data object FloorWatching : AlertFloorStatus
    data class FloorNotWatching(val reason: FloorNotWatchingReason) : AlertFloorStatus
}

/**
 * The single truth for the alerting surface: combines the [isAlertingDegraded] arm-condition with
 * the alert floor's own preconditions. Every input the floor's firing path gates on is mirrored
 * here — plus [pumpConnected], the floor's implicit fifth gate: evaluation happens only on newly
 * polled readings, so with the pump link down the floor cannot fire no matter how fresh the
 * cached reading still looks. The claim ("watching" vs "NOT watching") can never say more than
 * the floor can deliver. Pure so the selection is unit-testable.
 *
 * @param cgmAgeMs age of the latest CGM reading against its own sensor timestamp, or null when no
 *   reading is cached.
 * @param cgmThresholds the active CGM freshness policy (the compressed debug policy when the
 *   fast-staleness fault toggle is on, mirroring the floor's firing gate).
 * @param thresholdsSynced `AlertThresholdStore.isSynced()` — the floor never fires off unsynced
 *   defaults, so it must not claim to.
 * @param canNotify whether POST_NOTIFICATIONS is granted — a floor that cannot post its alarm is
 *   not watching, whatever the data looks like.
 * @param pumpConnected whether the BLE pump link is delivering readings — the floor evaluates
 *   only on each newly polled reading.
 */
fun alertFloorStatus(
    networkStatus: NetworkStatus,
    streamState: AlertStreamState,
    cgmAgeMs: Long?,
    cgmThresholds: FreshnessThresholds,
    thresholdsSynced: Boolean,
    canNotify: Boolean,
    pumpConnected: Boolean,
): AlertFloorStatus = when {
    !isAlertingDegraded(networkStatus, streamState) -> AlertFloorStatus.ServerActive
    !canNotify -> AlertFloorStatus.FloorNotWatching(FloorNotWatchingReason.NOTIFICATIONS_DENIED)
    !thresholdsSynced -> AlertFloorStatus.FloorNotWatching(FloorNotWatchingReason.THRESHOLDS_NOT_SYNCED)
    !pumpConnected -> AlertFloorStatus.FloorNotWatching(FloorNotWatchingReason.PUMP_DISCONNECTED)
    cgmAgeMs != null && isFreshForAlertFloor(cgmAgeMs, cgmThresholds) -> AlertFloorStatus.FloorWatching
    else -> AlertFloorStatus.FloorNotWatching(FloorNotWatchingReason.NO_FRESH_READING)
}
