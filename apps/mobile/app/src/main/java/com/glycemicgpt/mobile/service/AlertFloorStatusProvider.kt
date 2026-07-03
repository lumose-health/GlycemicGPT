package com.glycemicgpt.mobile.service

import com.glycemicgpt.mobile.data.local.AlertThresholdStore
import com.glycemicgpt.mobile.data.local.AppSettingsStore
import com.glycemicgpt.mobile.data.network.NetworkMonitor
import com.glycemicgpt.mobile.data.repository.PumpDataRepository
import com.glycemicgpt.mobile.domain.alerting.AlertFloorStatus
import com.glycemicgpt.mobile.domain.alerting.alertFloorStatus
import com.glycemicgpt.mobile.domain.freshness.FreshnessPolicy
import com.glycemicgpt.mobile.domain.model.ConnectionState
import com.glycemicgpt.mobile.domain.pump.PumpConnectionManager
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The one observation pipeline behind the honest alerting surface (GLY-115 AC7). The pure
 * decision lives in [alertFloorStatus]; this class owns WHICH inputs feed it and on WHAT
 * cadence — exactly the parts the in-app banner ([com.glycemicgpt.mobile.presentation.alerts.AlertsViewModel])
 * and the backgrounded foreground-notification text ([PumpConnectionService]) must never
 * disagree on, which is why there is a single shared provider instead of two pipelines.
 *
 * Recomputes on every input change plus a ticker, because the decisive input — the latest CGM
 * reading's age — grows with no new emissions: the "watching" claim must decay to "NOT watching"
 * on its own when readings stop. Tick cadence derives from the active freshness policy the same
 * way FreshnessUi's does, so the compressed debug policy flips within seconds during E2E.
 */
@Singleton
class AlertFloorStatusProvider @Inject constructor(
    private val networkMonitor: NetworkMonitor,
    private val alertStreamStateHolder: AlertStreamStateHolder,
    private val pumpDataRepository: PumpDataRepository,
    private val pumpConnectionManager: PumpConnectionManager,
    private val alertThresholdStore: AlertThresholdStore,
    private val appSettingsStore: AppSettingsStore,
    private val alertNotificationManager: AlertNotificationManager,
) {

    /** Live status stream. Cold; each collector gets its own ticker, deduplicated via
     *  [distinctUntilChanged]. */
    @OptIn(ExperimentalCoroutinesApi::class)
    fun observe(): Flow<AlertFloorStatus> =
        appSettingsStore.debugFastStalenessFlow().flatMapLatest { fast ->
            val thresholds = FreshnessPolicy.cgm(fast)
            val tickMs = (thresholds.staleAfterMs / 4).coerceIn(MIN_TICK_MS, MAX_TICK_MS)
            combine(
                networkMonitor.status,
                alertStreamStateHolder.state,
                pumpDataRepository.observeLatestCgm(),
                pumpConnectionManager.connectionState,
                tickerFlow(tickMs),
            ) { network, stream, cgm, pumpState, _ ->
                alertFloorStatus(
                    networkStatus = network,
                    streamState = stream,
                    cgmAgeMs = cgm?.let { System.currentTimeMillis() - it.timestamp.toEpochMilli() },
                    cgmThresholds = thresholds,
                    thresholdsSynced = alertThresholdStore.isSynced(),
                    canNotify = alertNotificationManager.canPostAlertNotifications(),
                    pumpConnected = pumpState == ConnectionState.CONNECTED,
                )
            }
        }.distinctUntilChanged()

    /**
     * Synchronous snapshot from the current values, for seeding a StateFlow before [observe]'s
     * first emission. Uses no CGM age (the Room read is async) — deliberately pessimistic: a
     * safety surface may briefly under-claim ("NOT watching") while the flows spin up, but must
     * never default to a healthy or watching state it can't yet vouch for.
     */
    fun current(): AlertFloorStatus = alertFloorStatus(
        networkStatus = networkMonitor.status.value,
        streamState = alertStreamStateHolder.state.value,
        cgmAgeMs = null,
        cgmThresholds = FreshnessPolicy.cgm(appSettingsStore.debugFastStaleness),
        thresholdsSynced = alertThresholdStore.isSynced(),
        canNotify = alertNotificationManager.canPostAlertNotifications(),
        pumpConnected = pumpConnectionManager.connectionState.value == ConnectionState.CONNECTED,
    )

    private fun tickerFlow(periodMs: Long): Flow<Unit> = flow {
        while (true) {
            emit(Unit)
            delay(periodMs)
        }
    }

    private companion object {
        // Ticker bounds, mirroring FreshnessUi's cadence discipline: fast enough that the
        // compressed debug policy decays near its marks, never hot-looping.
        const val MIN_TICK_MS = 2_000L
        const val MAX_TICK_MS = 30_000L
    }
}
