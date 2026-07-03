package com.glycemicgpt.mobile.presentation.alerts

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.glycemicgpt.mobile.data.network.NetworkStatus
import com.glycemicgpt.mobile.domain.freshness.FreshnessThresholds
import com.glycemicgpt.mobile.domain.freshness.isFreshForAlertFloor
import com.glycemicgpt.mobile.service.AlertStreamState

/** testTag for the honest "server alerts paused" banner. */
const val TAG_ALERTING_DEGRADED_BANNER = "alerting_degraded_banner"

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
 * Who, if anyone, is watching for glucose alerts right now (GLY-115).
 *
 * - [SERVER_ACTIVE] — backend reachable + SSE connected: the server owns alerting, the on-device
 *   floor stays silent, no degraded surface shows.
 * - [FLOOR_WATCHING] — server alerting is degraded, but the on-device alert floor can vouch: the
 *   latest CGM reading is FRESH, the alert thresholds have synced at least once, and this device
 *   can post alarm notifications. The phone will alarm on a threshold crossing.
 * - [FLOOR_NOT_WATCHING] — server alerting is degraded AND the floor cannot vouch (reading
 *   STALE/TOO_STALE or absent, thresholds never synced, or notifications denied). NOTHING is
 *   watching, and the surface must say so — claiming coverage here is the lethal lie GLY-115's
 *   AC2/AC7 pin against.
 */
enum class AlertFloorStatus { SERVER_ACTIVE, FLOOR_WATCHING, FLOOR_NOT_WATCHING }

/**
 * The single truth for the alerting surface: combines the [isAlertingDegraded] arm-condition with
 * the alert floor's own preconditions. Every input the floor's firing path gates on is mirrored
 * here so the claim ("watching" vs "NOT watching") can never say more than the floor can deliver.
 * Pure so the two-state selection is unit-testable.
 *
 * @param cgmAgeMs age of the latest CGM reading against its own sensor timestamp, or null when no
 *   reading is cached.
 * @param cgmThresholds the active CGM freshness policy (the compressed debug policy when the
 *   fast-staleness fault toggle is on, mirroring the floor's firing gate).
 * @param thresholdsSynced [com.glycemicgpt.mobile.data.local.AlertThresholdStore.isSynced] — the
 *   floor never fires off unsynced defaults, so it must not claim to.
 * @param canNotify whether POST_NOTIFICATIONS is granted — a floor that cannot post its alarm is
 *   not watching, whatever the data looks like.
 */
fun alertFloorStatus(
    networkStatus: NetworkStatus,
    streamState: AlertStreamState,
    cgmAgeMs: Long?,
    cgmThresholds: FreshnessThresholds,
    thresholdsSynced: Boolean,
    canNotify: Boolean,
): AlertFloorStatus = when {
    !isAlertingDegraded(networkStatus, streamState) -> AlertFloorStatus.SERVER_ACTIVE
    cgmAgeMs != null &&
        isFreshForAlertFloor(cgmAgeMs, cgmThresholds) &&
        thresholdsSynced &&
        canNotify -> AlertFloorStatus.FLOOR_WATCHING
    else -> AlertFloorStatus.FLOOR_NOT_WATCHING
}

/**
 * Banner copy for a degraded [AlertFloorStatus]. Pure and exhaustive so the two-state honest-claim
 * selection is pinned by unit test (the lethal trap is showing "watching" while the reading is
 * stale). [AlertFloorStatus.SERVER_ACTIVE] has no banner and returns null.
 */
fun alertingDegradedBannerText(status: AlertFloorStatus): String? = when (status) {
    AlertFloorStatus.SERVER_ACTIVE -> null
    AlertFloorStatus.FLOOR_WATCHING ->
        "Server alerts paused — this phone is watching your latest sensor reading and will " +
            "alarm for lows and highs. Threshold-only, no prediction. Alerts below are from " +
            "before the disconnect."
    AlertFloorStatus.FLOOR_NOT_WATCHING ->
        "Monitoring degraded — no recent glucose reading, so this phone is NOT watching for " +
            "lows or highs. No new alerts will arrive until the connection is restored."
}

/**
 * The honest alerting-degraded banner: server-pushed alerts are paused, and the copy states
 * exactly what the on-device alert floor (GLY-115) can and cannot cover right now — "watching"
 * only when the floor's own preconditions hold, "NOT watching" otherwise. Cached past alerts
 * remain visible below it. Not rendered for [AlertFloorStatus.SERVER_ACTIVE].
 */
@Composable
fun AlertingDegradedBanner(status: AlertFloorStatus, modifier: Modifier = Modifier) {
    val text = alertingDegradedBannerText(status) ?: return
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .testTag(TAG_ALERTING_DEGRADED_BANNER),
        color = MaterialTheme.colorScheme.errorContainer,
        shape = RoundedCornerShape(8.dp),
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = Icons.Default.CloudOff,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onErrorContainer,
                modifier = Modifier.size(20.dp),
            )
            Spacer(Modifier.width(12.dp))
            Text(
                text = text,
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.Medium,
                color = MaterialTheme.colorScheme.onErrorContainer,
            )
        }
    }
}
