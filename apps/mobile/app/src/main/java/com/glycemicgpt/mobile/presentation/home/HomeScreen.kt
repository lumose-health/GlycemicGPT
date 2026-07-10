package com.glycemicgpt.mobile.presentation.home

import androidx.compose.foundation.Image
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bluetooth
import androidx.compose.material.icons.filled.BluetoothConnected
import androidx.compose.material.icons.filled.BluetoothDisabled
import androidx.compose.material.icons.filled.CloudDone
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.CloudSync
import androidx.compose.material.icons.filled.SwapVert
import androidx.compose.material.icons.automirrored.filled.BluetoothSearching
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.key
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import com.glycemicgpt.mobile.R
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import com.glycemicgpt.mobile.presentation.meal.DraggableMealFab
import com.glycemicgpt.mobile.presentation.meal.RecentMealCard
import com.glycemicgpt.mobile.data.network.NetworkStatus
import com.glycemicgpt.mobile.domain.model.ConnectionState
import com.glycemicgpt.mobile.presentation.plugin.PluginDashboardCardRenderer
import com.glycemicgpt.mobile.service.SyncStatus

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    viewModel: HomeViewModel = hiltViewModel(),
    mealViewModel: HomeMealViewModel = hiltViewModel(),
    onPluginCardTap: (pluginId: String, cardId: String) -> Unit = { _, _ -> },
    onNavigateToChartDetail: (() -> Unit)? = null,
    onNavigateToTirDetail: () -> Unit = {},
    onNavigateToInsulinDetail: () -> Unit = {},
    onNavigateToAlertHistory: () -> Unit = {},
    onNavigateToBolusHistory: (() -> Unit)? = null,
    onNavigateToMealLog: () -> Unit = {},
    onNavigateToMealHistory: () -> Unit = {},
) {
    val mealState by mealViewModel.uiState.collectAsState()
    // Refresh the Recent-meal glance when returning to Home (e.g. after logging a meal). Skip the
    // first resume since the ViewModel already fetched in init, avoiding a redundant call.
    var firstResume by remember { mutableStateOf(true) }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) {
        if (firstResume) firstResume = false else mealViewModel.refresh()
    }
    // Draggable meal FAB: the container size feeds the on-screen clamp; the saved placement is read
    // once here (a per-device UI preference, not a reactive flow) and tracked in state so a drag is
    // reflected if the FAB is hidden then shown again within this Home session.
    var containerSizePx by remember { mutableStateOf(IntSize.Zero) }
    var savedFabOffset by remember { mutableStateOf(mealViewModel.savedFabOffset()) }
    val connectionState by viewModel.connectionState.collectAsState()
    val cgm by viewModel.cgm.collectAsState()
    val iob by viewModel.iob.collectAsState()
    val basalRate by viewModel.basalRate.collectAsState()
    val battery by viewModel.battery.collectAsState()
    val reservoir by viewModel.reservoir.collectAsState()
    val syncStatus by viewModel.syncStatus.collectAsState()
    val networkStatus by viewModel.networkStatus.collectAsState()
    val backendConfigured by viewModel.backendConfigured.collectAsState()
    val cgmFreshnessThresholds by viewModel.cgmFreshnessThresholds.collectAsState()
    val isRefreshing by viewModel.isRefreshing.collectAsState()
    val selectedPeriod by viewModel.selectedPeriod.collectAsState()
    val cgmHistory by viewModel.cgmHistory.collectAsState()
    val iobHistory by viewModel.iobHistory.collectAsState()
    val basalHistory by viewModel.basalHistory.collectAsState()
    val bolusHistory by viewModel.bolusHistory.collectAsState()
    val selectedTirPeriod by viewModel.selectedTirPeriod.collectAsState()
    val timeInRange by viewModel.timeInRange.collectAsState()
    val thresholds by viewModel.glucoseThresholds.collectAsState()
    val pluginCards by viewModel.pluginCards.collectAsState()
    val selectedCgmStatsPeriod by viewModel.selectedCgmStatsPeriod.collectAsState()
    val cgmStats by viewModel.cgmStats.collectAsState()
    val selectedInsulinPeriod by viewModel.selectedInsulinPeriod.collectAsState()
    val insulinSummary by viewModel.insulinSummary.collectAsState()
    val selectedBolusPeriod by viewModel.selectedBolusPeriod.collectAsState()
    val enrichedBoluses by viewModel.enrichedBoluses.collectAsState()
    val categoryLabels by viewModel.categoryLabels.collectAsState()
    val pumpLabelMap by viewModel.pumpLabelMap.collectAsState()
    val showPumpLabels by viewModel.showPumpLabels.collectAsState()
    val retentionDays by viewModel.dataRetentionDays.collectAsState()
    val glucoseUnit by viewModel.glucoseUnit.collectAsState()
    val activePluginIds by viewModel.activePluginIds.collectAsState()

    PullToRefreshBox(
        isRefreshing = isRefreshing,
        onRefresh = {
            viewModel.refreshData()
            mealViewModel.refresh()
        },
        modifier = Modifier
            .fillMaxSize()
            .onSizeChanged { containerSizePx = it },
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                // Extra bottom space so the camera FAB never overlaps the last item.
                .padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 88.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            // Compact connection + sync status row (BLE pump + outbound sync + backend
            // reachability + active plugin brands)
            ConnectionSyncRow(connectionState, syncStatus, networkStatus, backendConfigured, activePluginIds)

            Spacer(modifier = Modifier.height(12.dp))

            // Glucose hero: large current BG + trend + IoB + Basal + Battery + Reservoir
            GlucoseHero(
                cgm = cgm,
                iob = iob,
                basalRate = basalRate,
                battery = battery,
                reservoir = reservoir,
                thresholds = thresholds,
                glucoseUnit = glucoseUnit,
                cgmThresholds = cgmFreshnessThresholds,
            )

            Spacer(modifier = Modifier.height(12.dp))

            // Recent-meal glance (Epic 50): only once the user has logged at least one meal.
            mealState.recentMeal?.let { recent ->
                RecentMealCard(record = recent, onViewAll = onNavigateToMealHistory)
                Spacer(modifier = Modifier.height(12.dp))
            }

            // Glucose trend chart with IoB, basal, and bolus overlays
            GlucoseTrendChart(
                readings = cgmHistory,
                iobReadings = iobHistory,
                basalReadings = basalHistory,
                bolusEvents = bolusHistory,
                selectedPeriod = selectedPeriod,
                onPeriodSelected = { viewModel.onPeriodSelected(it) },
                thresholds = thresholds,
                categoryLabels = categoryLabels,
                glucoseUnit = glucoseUnit,
                onClick = onNavigateToChartDetail,
            )

            Spacer(modifier = Modifier.height(12.dp))

            // Time in Range bar
            TimeInRangeBar(
                data = timeInRange,
                selectedPeriod = selectedTirPeriod,
                onPeriodSelected = { viewModel.onTirPeriodSelected(it) },
                thresholds = thresholds,
                glucoseUnit = glucoseUnit,
                maxRetentionDays = retentionDays,
            )

            Spacer(modifier = Modifier.height(12.dp))

            // CGM Stats card
            CgmStatsCard(
                stats = cgmStats,
                selectedPeriod = selectedCgmStatsPeriod,
                onPeriodSelected = { viewModel.onCgmStatsPeriodSelected(it) },
                glucoseUnit = glucoseUnit,
                maxRetentionDays = retentionDays,
            )

            Spacer(modifier = Modifier.height(12.dp))

            // Insulin Summary card
            InsulinSummaryCard(
                summary = insulinSummary,
                selectedPeriod = selectedInsulinPeriod,
                onPeriodSelected = { viewModel.onInsulinPeriodSelected(it) },
                categoryLabels = categoryLabels,
                pumpLabelMap = if (showPumpLabels) pumpLabelMap else null,
                maxRetentionDays = retentionDays,
            )

            Spacer(modifier = Modifier.height(12.dp))

            // Recent Boluses card
            RecentBolusesCard(
                boluses = enrichedBoluses,
                selectedPeriod = selectedBolusPeriod,
                onPeriodSelected = { viewModel.onBolusPeriodSelected(it) },
                categoryLabels = categoryLabels,
                onExpand = onNavigateToBolusHistory,
                maxRetentionDays = retentionDays,
            )

            // Plugin-contributed cards (sorted by priority, memoized)
            val sortedCards = remember(pluginCards) { pluginCards.sortedBy { it.card.priority } }
            if (sortedCards.isNotEmpty()) {
                sortedCards.forEach { pluginCard ->
                    Spacer(modifier = Modifier.height(12.dp))
                    PluginDashboardCardRenderer(
                        card = pluginCard.card,
                        onClick = if (pluginCard.card.hasDetail) {
                            { onPluginCardTap(pluginCard.pluginId, pluginCard.card.id) }
                        } else {
                            null
                        },
                    )
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            if (connectionState == ConnectionState.DISCONNECTED) {
                Text(
                    text = "Pair your pump in Settings to start",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else if (connectionState == ConnectionState.CONNECTED && cgm == null) {
                Text(
                    text = "Loading pump data...",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.tertiary,
                )
            }
        }

        // Camera FAB overlaid in the pull-to-refresh BoxScope, hidden when the user's per-account
        // meal-intelligence setting is off (instant on toggle) or the server reports it disabled.
        // Draggable so the user can move it off the data underneath; its position persists per device.
        // Meal analysis is backend-only (server vision, no local meal store), so the whole surface
        // is additionally absent in BLE-only mode -- gated here at composition, above
        // HomeMealViewModel, whose within-configured availability logic is a separate concern.
        if (backendConfigured && mealState.mealLoggingAvailable) {
            DraggableMealFab(
                containerSizePx = containerSizePx,
                savedOffset = savedFabOffset,
                onClick = onNavigateToMealLog,
                onOffsetSettled = {
                    mealViewModel.persistFabOffset(it)
                    savedFabOffset = it
                },
                onReset = {
                    mealViewModel.resetFabOffset()
                    savedFabOffset = null
                },
            )
        }
    }
}

@Composable
private fun ConnectionSyncRow(
    state: ConnectionState,
    syncStatus: SyncStatus,
    networkStatus: NetworkStatus,
    backendConfigured: Boolean,
    activePluginIds: List<String>,
) {
    val (bleIcon, bleA11y, bleColor, bleText) = when (state) {
        ConnectionState.CONNECTED -> Quad(
            Icons.Default.BluetoothConnected,
            "Pump connected",
            MaterialTheme.colorScheme.primary,
            null,
        )
        ConnectionState.CONNECTING, ConnectionState.AUTHENTICATING -> Quad(
            Icons.AutoMirrored.Filled.BluetoothSearching,
            "Connecting to pump",
            MaterialTheme.colorScheme.tertiary,
            "Connecting...",
        )
        ConnectionState.RECONNECTING -> Quad(
            Icons.Default.Bluetooth,
            "Reconnecting to pump",
            MaterialTheme.colorScheme.tertiary,
            "Reconnecting...",
        )
        ConnectionState.SCANNING -> Quad(
            Icons.AutoMirrored.Filled.BluetoothSearching,
            "Scanning for pump",
            MaterialTheme.colorScheme.tertiary,
            "Scanning...",
        )
        ConnectionState.AUTH_FAILED -> Quad(
            Icons.Default.BluetoothDisabled,
            "Pump pairing failed",
            MaterialTheme.colorScheme.error,
            "Pairing failed",
        )
        ConnectionState.DISCONNECTED -> Quad(
            Icons.Default.BluetoothDisabled,
            "No pump connected",
            MaterialTheme.colorScheme.error,
            null,
        )
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .testTag("connection_status"),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = bleIcon,
            contentDescription = bleA11y,
            tint = bleColor,
            modifier = Modifier.size(16.dp),
        )
        if (bleText != null) {
            Spacer(modifier = Modifier.width(4.dp))
            Text(
                text = bleText,
                style = MaterialTheme.typography.labelSmall,
                color = bleColor,
            )
        }
        // The cloud indicators only exist when a backend is configured: for a BLE-only user
        // "pending sync" / "Backend reachable" would describe a server that doesn't exist.
        // A full-stack user keeps them even while offline -- the climbing pending count and
        // "Backend unreachable" are the honest outage story.
        if (backendConfigured) {
            val (syncIcon, syncA11y, syncColor) = when {
                syncStatus.lastError != null -> Triple(
                    Icons.Default.CloudOff,
                    "Sync error",
                    MaterialTheme.colorScheme.error,
                )
                syncStatus.pendingCount > 0 -> Triple(
                    Icons.Default.CloudSync,
                    "${syncStatus.pendingCount} readings pending sync",
                    MaterialTheme.colorScheme.tertiary,
                )
                syncStatus.lastSyncAtMs > 0 -> Triple(
                    // Up/down arrows, not a cloud: the healthy sync state must stay visually
                    // distinct from BackendStatusIndicator's healthy cloud-check (GLY-166).
                    Icons.Default.SwapVert,
                    "Synced to cloud",
                    MaterialTheme.colorScheme.primary,
                )
                else -> Triple(
                    Icons.Default.CloudOff,
                    "Not synced",
                    MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(modifier = Modifier.width(12.dp))
            Icon(
                imageVector = syncIcon,
                contentDescription = syncA11y,
                tint = syncColor,
                modifier = Modifier.size(16.dp),
            )
            Spacer(modifier = Modifier.width(12.dp))
            BackendStatusIndicator(networkStatus)
        }
        // Brand indicators for active plugins -- shown in every mode (a BLE-only user still
        // has a pump plugin active). Rendered untinted so the marks keep their brand colors.
        // Scrolls horizontally so a wide badge set (e.g. Medtronic's wordmark + Nightscout)
        // can never push the status icons off a narrow screen.
        val brands = activePluginIds.mapNotNull { pluginBrandFor(it) }
        if (brands.isNotEmpty()) {
            Row(
                modifier = Modifier
                    .weight(1f, fill = false)
                    .horizontalScroll(rememberScrollState()),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                for (brand in brands) {
                    key(brand.name) {
                        Spacer(modifier = Modifier.width(12.dp))
                        Image(
                            painter = painterResource(brand.logoRes),
                            contentDescription = "${brand.name} plugin active",
                            modifier = Modifier
                                .height(brand.height)
                                .testTag("plugin_indicator_${brand.name.lowercase()}"),
                        )
                    }
                }
            }
        }
    }
}

/**
 * Logo asset for an active plugin's dashboard brand indicator (GLY-166), keyed by the stable
 * reverse-domain plugin ID. Kept app-side (not on [com.glycemicgpt.mobile.domain.plugin.PluginMetadata])
 * so the plugin API carries no Android resource types; plugins without an entry show no badge.
 * Trademark note: shipping the manufacturer marks was an explicit project-lead decision
 * (nominative use -- the badge states which vendor integration is active).
 */
// height is per-brand: the marks have different aspect ratios, so a single height would make
// the longer wordmarks (Medtronic) tower over the compact ones -- these values normalize their
// optical weight in the ~16dp status row.
private data class PluginBrand(val logoRes: Int, val name: String, val height: Dp)

private fun pluginBrandFor(pluginId: String): PluginBrand? = when (pluginId) {
    "com.glycemicgpt.tandem" -> PluginBrand(R.drawable.ic_plugin_tandem, "Tandem", 16.dp)
    "com.glycemicgpt.medtronic" -> PluginBrand(R.drawable.ic_plugin_medtronic, "Medtronic", 12.dp)
    "com.glycemicgpt.nightscout-source" -> PluginBrand(R.drawable.ic_plugin_nightscout, "Nightscout", 16.dp)
    else -> null
}

/**
 * Backend/device reachability chip, distinct from the BLE and sync indicators. Present whenever
 * a backend is configured (locatable in E2E runs via the `backend_status` tag; absent for
 * BLE-only); only shows text when there's something to warn about, keeping the reachable golden
 * path visually quiet.
 */
@Composable
private fun BackendStatusIndicator(networkStatus: NetworkStatus) {
    val (icon, a11y, color, text) = when (networkStatus) {
        NetworkStatus.REACHABLE -> Quad(
            Icons.Default.CloudDone,
            "Backend reachable",
            MaterialTheme.colorScheme.primary,
            null,
        )
        NetworkStatus.BACKEND_UNREACHABLE -> Quad(
            Icons.Default.CloudOff,
            "Backend unreachable",
            MaterialTheme.colorScheme.error,
            "Backend unreachable",
        )
        NetworkStatus.OFFLINE -> Quad(
            Icons.Default.CloudOff,
            "Device offline",
            MaterialTheme.colorScheme.error,
            "Offline",
        )
    }
    Row(
        modifier = Modifier.testTag("backend_status"),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = a11y,
            tint = color,
            modifier = Modifier.size(16.dp),
        )
        if (text != null) {
            Spacer(modifier = Modifier.width(4.dp))
            Text(
                text = text,
                style = MaterialTheme.typography.labelSmall,
                color = color,
            )
        }
    }
}

private data class Quad<A, B, C, D>(val first: A, val second: B, val third: C, val fourth: D)
