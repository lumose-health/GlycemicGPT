package com.glycemicgpt.mobile.presentation.alerts

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.glycemicgpt.mobile.data.local.AppSettingsStore
import com.glycemicgpt.mobile.data.local.AuthTokenStore
import com.glycemicgpt.mobile.data.local.entity.AlertEntity
import com.glycemicgpt.mobile.data.repository.AlertAckHttpException
import com.glycemicgpt.mobile.data.repository.AlertRepository
import com.glycemicgpt.mobile.domain.alerting.AlertFloorStatus
import com.glycemicgpt.mobile.domain.model.GlucoseUnit
import com.glycemicgpt.mobile.service.AlertFloorStatusProvider
import com.glycemicgpt.mobile.service.AlertNotificationManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
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
    alertFloorStatusProvider: AlertFloorStatusProvider,
    private val authTokenStore: AuthTokenStore,
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
     * on-device floor watching, or degraded with nothing watching (plus why). Drives the
     * two-state [AlertingDegradedBanner]. The observation pipeline is shared with the
     * backgrounded foreground-notification surface via [AlertFloorStatusProvider] so the two
     * claims can never disagree; the seed is the provider's pessimistic synchronous snapshot.
     */
    val alertFloorStatus: StateFlow<AlertFloorStatus> = alertFloorStatusProvider.observe()
        .stateIn(
            viewModelScope,
            SharingStarted.WhileSubscribed(5000),
            alertFloorStatusProvider.current(),
        )

    /** Whether a backend is configured, for the banner's two copy modes (GLY-145): server
     *  phrasing is only honest when a server actually exists. Seeded pessimistically false
     *  (see [AuthTokenStore.backendConfiguredFlow]) -- false only softens the copy toward
     *  BLE-only phrasing for the first frame. */
    val backendConfigured: StateFlow<Boolean> = authTokenStore.backendConfiguredFlow()
        .stateIn(
            viewModelScope,
            SharingStarted.WhileSubscribed(5000),
            false,
        )

    init {
        viewModelScope.launch { alertRepository.cleanupOldAlerts() }
        refreshAlerts()
    }

    fun refreshAlerts() {
        viewModelScope.launch {
            // BLE-only gate (GLY-146): with no backend there is nothing to fetch from, and the
            // failed request would nag "Can't reach your server" for a server that was never
            // configured. Local alerts keep flowing via observeRecentAlerts(). Checked here --
            // not just in init -- so a pull-to-refresh stays honest too. Read from the flow
            // (first emission is on IO) rather than [backendConfigured], whose pessimistic
            // false seed would drop a full-stack user's fetch at cold start.
            if (!authTokenStore.backendConfiguredFlow().first()) return@launch
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
                // BLE-only gate: with no backend the local ack IS the whole operation, so the
                // phantom POST failure must not surface a "will sync" snackbar for a server that
                // was never configured. Read from the flow off-main, as in refreshAlerts().
                if (!authTokenStore.backendConfiguredFlow().first()) return@onFailure
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
}
