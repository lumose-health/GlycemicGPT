package com.glycemicgpt.mobile.service

import com.glycemicgpt.mobile.data.local.AlertThresholdStore
import com.glycemicgpt.mobile.data.local.AppSettingsStore
import com.glycemicgpt.mobile.data.local.AuthTokenStore
import com.glycemicgpt.mobile.data.network.NetworkMonitor
import com.glycemicgpt.mobile.data.repository.PumpDataRepository
import com.glycemicgpt.mobile.domain.alerting.AlertFloorStatus
import com.glycemicgpt.mobile.domain.alerting.alertFloorStatus
import com.glycemicgpt.mobile.domain.freshness.FreshnessPolicy
import com.glycemicgpt.mobile.domain.model.ConnectionState
import com.glycemicgpt.mobile.domain.pump.PumpConnectionManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.retryWhen
import timber.log.Timber
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
    private val authTokenStore: AuthTokenStore,
    private val appSettingsStore: AppSettingsStore,
    private val alertNotificationManager: AlertNotificationManager,
    private val alertFloor: AlertFloor,
) {

    /** Live status stream. Cold; each collector gets its own ticker, deduplicated via
     *  [distinctUntilChanged]. */
    @OptIn(ExperimentalCoroutinesApi::class)
    fun observe(): Flow<AlertFloorStatus> =
        combine(
            appSettingsStore.debugFastStalenessFlow(),
            backendConfiguredFlow(),
        ) { fast, backendConfigured -> fast to backendConfigured }.flatMapLatest { (fast, backendConfigured) ->
            val thresholds = FreshnessPolicy.cgm(fast)
            val tickMs = (thresholds.staleAfterMs / 4).coerceIn(MIN_TICK_MS, MAX_TICK_MS)
            combine(
                networkMonitor.status,
                alertStreamStateHolder.state,
                pumpDataRepository.observeLatestCgm(),
                pumpConnectionManager.connectionState,
                tickerFlow(tickMs),
            ) { network, stream, cgm, pumpState, _ ->
                // Feed the floor's wall-clock rewind guard on every tick (so it has a recent
                // reference even with no CGM flowing) and mirror it: while the clock runs
                // behind the high-water mark, sensor ages are understated, so the reading is
                // treated as absent — the claim degrades to NOT watching, exactly like the
                // floor's own suppression.
                val nowMs = System.currentTimeMillis()
                alertFloor.noteWallClock(nowMs)
                val cgmAgeMs = if (alertFloor.isWallClockRewound(nowMs)) {
                    null
                } else {
                    cgm?.let { nowMs - it.timestamp.toEpochMilli() }
                }
                alertFloorStatus(
                    networkStatus = network,
                    streamState = stream,
                    cgmAgeMs = cgmAgeMs,
                    cgmThresholds = thresholds,
                    thresholdsConfigured = alertThresholdStore.isConfigured(),
                    backendConfigured = backendConfigured,
                    canNotify = alertNotificationManager.canPostAlertNotifications(),
                    pumpConnected = pumpState == ConnectionState.CONNECTED,
                )
            }
        }.retryWhen { cause, attempt ->
            // A safety-status stream must never die silently: a frozen StateFlow downstream
            // would keep claiming whatever was last emitted. Fail closed (pessimistic
            // snapshot) and resubscribe — the claim degrades, it never lies or stops.
            Timber.e(cause, "Alert floor status pipeline failed (attempt %d); retrying", attempt)
            emit(current())
            delay(RETRY_DELAY_MS)
            true
        }.distinctUntilChanged()

    /**
     * The live backend-configured mode signal, with the EncryptedSharedPreferences reads kept
     * off the caller's dispatcher: [observe] is collected (and its seed computed) on the main
     * thread, and an encrypted-store read there can block on the keyset's first load.
     */
    private fun backendConfiguredFlow(): Flow<Boolean> =
        authTokenStore.baseUrlFlow()
            .map { AuthTokenStore.isBackendConfigured(it) }
            .flowOn(Dispatchers.IO)

    /**
     * Synchronous snapshot from the current values, for seeding a StateFlow before [observe]'s
     * first emission. Uses no CGM age (the Room read is async) — deliberately pessimistic: a
     * safety surface may briefly under-claim ("NOT watching") while the flows spin up, but must
     * never default to a healthy or watching state it can't yet vouch for. The backend mode is
     * seeded pessimistically too, rather than read from the encrypted store (a synchronous
     * main-thread decrypt): it only selects the missing-thresholds reason copy until the first
     * emission, never the coverage claim.
     */
    fun current(): AlertFloorStatus = alertFloorStatus(
        networkStatus = networkMonitor.status.value,
        streamState = alertStreamStateHolder.state.value,
        cgmAgeMs = null,
        cgmThresholds = FreshnessPolicy.cgm(appSettingsStore.debugFastStaleness),
        thresholdsConfigured = alertThresholdStore.isConfigured(),
        backendConfigured = false,
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

        /** Pause before resubscribing a failed pipeline — long enough not to hot-loop on a
         *  persistent fault, short next to the freshness bounds the status is judged by. */
        const val RETRY_DELAY_MS = 5_000L
    }
}
