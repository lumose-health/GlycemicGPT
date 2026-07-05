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
import com.glycemicgpt.mobile.domain.alerting.AlertFloorStatus
import com.glycemicgpt.mobile.domain.alerting.FloorNotWatchingReason

/** testTag for the honest "server alerts paused" banner. */
const val TAG_ALERTING_DEGRADED_BANNER = "alerting_degraded_banner"

/**
 * Banner copy for a degraded [AlertFloorStatus]. Pure and exhaustive so the two-state honest-claim
 * selection is pinned by unit test (the lethal trap is showing "watching" while the floor cannot
 * fire). Every NOT-watching variant leads with the non-coverage claim; the tail names the failed
 * precondition so the one user-fixable cause (notification permission) is not hidden behind a
 * false "no recent glucose" diagnosis. [AlertFloorStatus.ServerActive] has no banner, returns null.
 *
 * [backendConfigured] selects between the two copy modes (GLY-145): with a backend the copy may
 * reference the server and its restored connection; in BLE-only mode no string may imply a
 * server ever existed — the phone's floor is the only alerting there is.
 */
fun alertingDegradedBannerText(status: AlertFloorStatus, backendConfigured: Boolean): String? =
    when (status) {
        AlertFloorStatus.ServerActive -> null
        AlertFloorStatus.FloorWatching -> if (backendConfigured) {
            "Server alerts paused — this phone is watching your latest sensor reading and will " +
                "alarm for lows and highs. Threshold-only, no prediction. Alerts below are from " +
                "before the disconnect."
        } else {
            "This phone is watching your latest sensor reading and will alarm for lows and " +
                "highs. Threshold-only, no prediction."
        }
        is AlertFloorStatus.FloorNotWatching -> "Monitoring degraded — this phone is NOT " +
            "watching for lows or highs: " + when (status.reason) {
            FloorNotWatchingReason.NOTIFICATIONS_DENIED ->
                "notifications are disabled for GlycemicGPT. Enable notifications to restore " +
                    "on-phone alarms."
            FloorNotWatchingReason.THRESHOLDS_NOT_SYNCED ->
                "alert thresholds haven't synced from your server yet."
            FloorNotWatchingReason.THRESHOLDS_NOT_CONFIGURED ->
                "set your alert thresholds in Settings to turn on alarms."
            FloorNotWatchingReason.PUMP_DISCONNECTED ->
                "no pump connection, so no new readings are arriving."
            FloorNotWatchingReason.NO_FRESH_READING ->
                "no recent glucose reading."
        } + if (backendConfigured) {
            " No new alerts will arrive until the connection is restored."
        } else {
            ""
        }
    }

/**
 * The honest alerting-degraded banner: server-pushed alerts are paused, and the copy states
 * exactly what the on-device alert floor (GLY-115) can and cannot cover right now — "watching"
 * only when the floor's own preconditions hold, "NOT watching" (with the failed precondition)
 * otherwise. Cached past alerts remain visible below it. Renders nothing for
 * [AlertFloorStatus.ServerActive]; this early-return is the single owner of the visibility rule.
 */
@Composable
fun AlertingDegradedBanner(
    status: AlertFloorStatus,
    backendConfigured: Boolean,
    modifier: Modifier = Modifier,
) {
    val text = alertingDegradedBannerText(status, backendConfigured) ?: return
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
