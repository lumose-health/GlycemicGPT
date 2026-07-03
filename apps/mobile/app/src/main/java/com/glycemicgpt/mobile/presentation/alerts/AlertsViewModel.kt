package com.glycemicgpt.mobile.presentation.alerts

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.glycemicgpt.mobile.data.local.AlertThresholdStore
import com.glycemicgpt.mobile.data.local.AppSettingsStore
import com.glycemicgpt.mobile.data.local.entity.AlertEntity
import com.glycemicgpt.mobile.data.network.NetworkMonitor
import com.glycemicgpt.mobile.data.repository.AlertAckHttpException
import com.glycemicgpt.mobile.data.repository.AlertRepository
import com.glycemicgpt.mobile.data.repository.PumpDataRepository
import com.glycemicgpt.mobile.domain.freshness.FreshnessPolicy
import com.glycemicgpt.mobile.domain.model.GlucoseUnit
import com.glycemicgpt.mobile.service.AlertNotificationManager
import com.glycemicgpt.mobile.service.AlertStreamStateHolder
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import timber.log.Timber
import java.io.IOException
import javax.inject.Inject

data class AlertsUiState(
    val isLoading: Boolean = false,
    /** User-facing failure copy for a refresh/acknowledge, surfaced as a snackbar then cleared.
     *  Never a raw exception message. */
    val error: String? = null,
)

@HiltViewModel
class AlertsViewModel @Inject constructor(
    private val alertRepository: AlertRepository,
    private val alertNotificationManager: AlertNotificationManager,
    private val appSettingsStore: AppSettingsStore,
    private val alertThresholdStore: AlertThresholdStore,
    pumpDataRepository: PumpDataRepository,
    networkMonitor: NetworkMonitor,
    alertStreamStateHolder: AlertStreamStateHolder,
) : ViewModel() {

    private val _uiState = MutableStateFlow(AlertsUiState())
    val uiState: StateFlow<AlertsUiState> = _uiState.asStateFlow()

    val alerts: StateFlow<List<AlertEntity>> = alertRepository.observeRecentAlerts()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    /** The user's glucose display unit, for rendering alert values. Alert detection stays mg/dL. */
    val glucoseUnit: StateFlow<GlucoseUnit> = appSettingsStore.glucoseUnitFlow()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), appSettingsStore.glucoseUnit)

    /**
     * The alerting surface's single truth (GLY-115 AC7): server-active, or degraded with the
     * on-device floor watching, or degraded with nothing watching. Drives the two-state
     * [AlertingDegradedBanner]. Recomputes on every input change plus a ticker, because the
     * decisive input — the latest CGM reading's age — grows with no new emissions and the
     * "watching" claim must decay to "NOT watching" on its own when readings stop.
     */
    @OptIn(ExperimentalCoroutinesApi::class)
    val alertFloorStatus: StateFlow<AlertFloorStatus> =
        appSettingsStore.debugFastStalenessFlow().flatMapLatest { fast ->
            val thresholds = if (fast) FreshnessPolicy.CGM_DEBUG_FAST else FreshnessPolicy.CGM
            val tickMs = (thresholds.staleAfterMs / 4).coerceIn(MIN_STATUS_TICK_MS, MAX_STATUS_TICK_MS)
            combine(
                networkMonitor.status,
                alertStreamStateHolder.state,
                pumpDataRepository.observeLatestCgm(),
                tickerFlow(tickMs),
            ) { network, stream, cgm, _ ->
                alertFloorStatus(
                    networkStatus = network,
                    streamState = stream,
                    cgmAgeMs = cgm?.let { System.currentTimeMillis() - it.timestamp.toEpochMilli() },
                    cgmThresholds = thresholds,
                    thresholdsSynced = alertThresholdStore.isSynced(),
                    canNotify = alertNotificationManager.canPostAlertNotifications(),
                )
            }
        }.stateIn(
            viewModelScope,
            SharingStarted.WhileSubscribed(5000),
            // Seed pessimistically from the live degraded signals with no CGM age yet — a safety
            // banner may briefly under-claim ("NOT watching") while the flows spin up, but must
            // never default to a healthy or watching state it can't yet vouch for.
            alertFloorStatus(
                networkStatus = networkMonitor.status.value,
                streamState = alertStreamStateHolder.state.value,
                cgmAgeMs = null,
                cgmThresholds = FreshnessPolicy.CGM,
                thresholdsSynced = alertThresholdStore.isSynced(),
                canNotify = alertNotificationManager.canPostAlertNotifications(),
            ),
        )

    private fun tickerFlow(periodMs: Long): Flow<Unit> = flow {
        while (true) {
            emit(Unit)
            delay(periodMs)
        }
    }

    init {
        viewModelScope.launch { alertRepository.cleanupOldAlerts() }
        refreshAlerts()
    }

    fun refreshAlerts() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)
            alertRepository.fetchPendingAlerts()
                .onSuccess {
                    _uiState.value = _uiState.value.copy(isLoading = false)
                }
                .onFailure { e ->
                    Timber.w(e, "Failed to fetch alerts")
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        error = refreshErrorMessage(e),
                    )
                }
        }
    }

    fun acknowledgeAlert(serverId: String) {
        viewModelScope.launch {
            val result = alertRepository.acknowledgeAlert(serverId)
            // The repository marks the row acknowledged locally regardless of the server POST,
            // so the dedup id is cleared unconditionally too — the alert is silenced either way.
            alertNotificationManager.markAcknowledged(serverId)
            result.onFailure { e ->
                Timber.w(e, "Alert acknowledged locally; server sync failed")
                _uiState.value = _uiState.value.copy(error = acknowledgeFailureMessage(e))
            }
        }
    }

    fun clearError() {
        _uiState.value = _uiState.value.copy(error = null)
    }

    private fun refreshErrorMessage(e: Throwable): String = when (e) {
        // Neutral about cache contents — the list below may be empty.
        is IOException -> "Can't reach your server — alerts may be out of date."
        else -> "Couldn't refresh alerts. Try again."
    }

    /**
     * Honest copy for an acknowledge whose server sync didn't land, driven by the repository's
     * actual classification rather than a parallel heuristic. A transport failure or a transient
     * HTTP status means the ack is recorded locally and pending — it reconciles on the next
     * trigger, so that is a deferral, not an error. A terminal rejection stopped retrying, so it
     * is surfaced as a real sync failure (the alert stays dismissed on this device either way).
     */
    private fun acknowledgeFailureMessage(e: Throwable): String = when {
        e is IOException || (e is AlertAckHttpException && !e.terminal) ->
            "Acknowledged locally — will sync when reconnected."
        e is AlertAckHttpException -> "Couldn't sync this acknowledgment to the server."
        else -> "Couldn't acknowledge the alert. Try again."
    }

    private companion object {
        // Status ticker bounds, mirroring FreshnessUi's cadence discipline.
        const val MIN_STATUS_TICK_MS = 2_000L
        const val MAX_STATUS_TICK_MS = 30_000L
    }
}
