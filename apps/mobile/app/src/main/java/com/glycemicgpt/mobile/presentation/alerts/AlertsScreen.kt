package com.glycemicgpt.mobile.presentation.alerts

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.glycemicgpt.mobile.data.local.entity.AlertEntity
import com.glycemicgpt.mobile.domain.alerting.AlertFloorStatus
import com.glycemicgpt.mobile.domain.format.GlucoseFormat
import com.glycemicgpt.mobile.domain.model.GlucoseUnit
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** testTag for the pull-to-refresh wrapper — full-stack only, absent in BLE-only mode. */
const val TAG_ALERTS_PULL_TO_REFRESH = "alerts_pull_to_refresh"

@Composable
fun AlertsScreen(
    viewModel: AlertsViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()
    val alerts by viewModel.alerts.collectAsState()
    val glucoseUnit by viewModel.glucoseUnit.collectAsState()
    val alertFloorStatus by viewModel.alertFloorStatus.collectAsState()
    val backendConfigured by viewModel.backendConfigured.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(uiState.error) {
        uiState.error?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.clearError()
        }
    }

    AlertsContent(
        uiState = uiState,
        alerts = alerts,
        glucoseUnit = glucoseUnit,
        alertFloorStatus = alertFloorStatus,
        backendConfigured = backendConfigured,
        snackbarHostState = snackbarHostState,
        onRefresh = viewModel::refreshAlerts,
        onAcknowledge = viewModel::acknowledgeAlert,
    )
}

/** Stateless alerts surface, split from [AlertsScreen] so UI tests can drive degraded states. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun AlertsContent(
    uiState: AlertsUiState,
    alerts: List<AlertEntity>,
    glucoseUnit: GlucoseUnit,
    alertFloorStatus: AlertFloorStatus,
    backendConfigured: Boolean,
    snackbarHostState: SnackbarHostState,
    onRefresh: () -> Unit,
    onAcknowledge: (serverId: String) -> Unit,
) {
    Box(modifier = Modifier.fillMaxSize()) {
        Column(modifier = Modifier.fillMaxSize()) {
            // Visibility is owned by the banner itself (renders nothing for ServerActive).
            AlertingDegradedBanner(
                status = alertFloorStatus,
                backendConfigured = backendConfigured,
                modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 8.dp),
            )
            if (backendConfigured) {
                PullToRefreshBox(
                    isRefreshing = uiState.isLoading,
                    onRefresh = onRefresh,
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f)
                        .testTag(TAG_ALERTS_PULL_TO_REFRESH),
                ) {
                    AlertHistory(
                        isLoading = uiState.isLoading,
                        alerts = alerts,
                        glucoseUnit = glucoseUnit,
                        backendConfigured = backendConfigured,
                        onAcknowledge = onAcknowledge,
                    )
                }
            } else {
                // BLE-only: refreshAlerts() stands down, so a pull would be a dead gesture --
                // the indicator would track the drag and retract without ever refreshing.
                // Offer no pull affordance at all.
                AlertHistory(
                    isLoading = uiState.isLoading,
                    alerts = alerts,
                    glucoseUnit = glucoseUnit,
                    backendConfigured = backendConfigured,
                    onAcknowledge = onAcknowledge,
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                )
            }
        }
        SnackbarHost(
            hostState = snackbarHostState,
            modifier = Modifier.align(Alignment.BottomCenter),
        )
    }
}

/**
 * The alerts list, or the mode-aware empty state when there is no history to show.
 *
 * In BLE-only mode [isLoading] is ignored: the refresh gate stands down without a backend, so a
 * stale in-flight flag (a fetch orphaned by signing out mid-refresh) must not blank the screen.
 */
@Composable
private fun AlertHistory(
    isLoading: Boolean,
    alerts: List<AlertEntity>,
    glucoseUnit: GlucoseUnit,
    backendConfigured: Boolean,
    onAcknowledge: (serverId: String) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (alerts.isEmpty() && (!isLoading || !backendConfigured)) {
        EmptyAlertsState(backendConfigured = backendConfigured, modifier = modifier)
    } else {
        LazyColumn(
            modifier = modifier
                .fillMaxSize()
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item { Spacer(Modifier.height(8.dp)) }
            items(alerts, key = { it.serverId }) { alert ->
                AlertCard(
                    alert = alert,
                    glucoseUnit = glucoseUnit,
                    onAcknowledge = { onAcknowledge(alert.serverId) },
                )
            }
            item { Spacer(Modifier.height(8.dp)) }
        }
    }
}

@Composable
private fun EmptyAlertsState(backendConfigured: Boolean, modifier: Modifier = Modifier) {
    // Selected as a pair so the title and subtitle can never drift into a mismatched combination.
    val (title, subtitle) = if (backendConfigured) {
        "No alerts" to "Pull down to refresh"
    } else {
        "No alert history" to "On-device alarms appear as notifications, not in this list."
    }
    Box(
        modifier = modifier.fillMaxSize(),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Icon(
                imageVector = Icons.Default.Notifications,
                contentDescription = null,
                modifier = Modifier.size(64.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f),
            )
            Spacer(Modifier.height(16.dp))
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                text = subtitle,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                textAlign = TextAlign.Center,
            )
        }
    }
}

@Composable
private fun AlertCard(
    alert: AlertEntity,
    glucoseUnit: GlucoseUnit,
    onAcknowledge: () -> Unit,
) {
    val severityColor = when (alert.severity) {
        "emergency" -> Color(0xFFD32F2F) // Red
        "urgent" -> Color(0xFFF57C00) // Orange
        "warning" -> Color(0xFFFBC02D) // Yellow
        else -> Color(0xFF1976D2) // Blue
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
        ),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.Top,
        ) {
            // Severity indicator
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(CircleShape)
                    .background(severityColor.copy(alpha = 0.15f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.Default.Warning,
                    contentDescription = alert.severity,
                    tint = severityColor,
                    modifier = Modifier.size(20.dp),
                )
            }

            Spacer(Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                // Severity + glucose value
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = alert.severity.replaceFirstChar { it.uppercase() },
                        style = MaterialTheme.typography.labelMedium,
                        color = severityColor,
                        fontWeight = FontWeight.Bold,
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text = GlucoseFormat.formatWithLabel(alert.currentValue.toInt(), glucoseUnit),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                    )
                }

                Spacer(Modifier.height(4.dp))

                // Message
                Text(
                    text = alert.message,
                    style = MaterialTheme.typography.bodyMedium,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis,
                )

                Spacer(Modifier.height(4.dp))

                // Patient name (for caregivers) + timestamp
                Row {
                    alert.patientName?.let { name ->
                        Text(
                            text = name,
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.primary,
                        )
                        Spacer(Modifier.width(8.dp))
                    }
                    Text(
                        text = formatTimestamp(alert.timestampMs),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            // Acknowledge button
            if (!alert.acknowledged) {
                IconButton(onClick = onAcknowledge) {
                    Icon(
                        imageVector = Icons.Default.Check,
                        contentDescription = "Acknowledge",
                        tint = MaterialTheme.colorScheme.primary,
                    )
                }
            }
        }
    }
}

private fun formatTimestamp(timestampMs: Long): String {
    val now = System.currentTimeMillis()
    val diffMinutes = (now - timestampMs) / 60_000

    return when {
        diffMinutes < 1 -> "Just now"
        diffMinutes < 60 -> "${diffMinutes}m ago"
        diffMinutes < 1440 -> "${diffMinutes / 60}h ago"
        else -> SimpleDateFormat("MMM d, HH:mm", Locale.getDefault()).format(Date(timestampMs))
    }
}
