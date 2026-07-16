package com.glycemicgpt.mobile.wear

import com.glycemicgpt.mobile.data.local.AppSettingsStore
import com.glycemicgpt.mobile.domain.alerting.AlertFloorStatus
import com.glycemicgpt.mobile.domain.freshness.FreshnessPolicy
import com.glycemicgpt.mobile.service.AlertFloorStatusProvider
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.retryWhen
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Forwards the phone's alerting-coverage decision to the watch (GLY-116 AC-B, axis a).
 *
 * The source is the SAME [AlertFloorStatusProvider] stream that drives the in-app banner and the
 * foreground-notification text — the wrist claim can never disagree with the phone's. The watch
 * performs no coverage decision of its own; it renders this status and locally decays it after
 * the advertised timeout.
 *
 * Re-sends on a heartbeat as well as on change: the provider stream deduplicates, so a healthy
 * steady state would otherwise emit exactly once — and a watch that then loses the phone (process
 * death, Bluetooth drop) would hold a frozen "watching" forever. Each heartbeat re-send restarts
 * the watch's local status timeout; silence longer than the advertised window is the watch's
 * signal that the phone is gone, closing the phone-death honesty hole with the same mechanism
 * for every cause.
 */
@Singleton
class WearMonitoringStatusForwarder @Inject constructor(
    private val alertFloorStatusProvider: AlertFloorStatusProvider,
    private val appSettingsStore: AppSettingsStore,
    private val wearDataSender: WearDataSender,
) {

    /** Start forwarding on [scope] (the pump service's lifecycle). */
    @OptIn(ExperimentalCoroutinesApi::class)
    fun start(scope: CoroutineScope): Job = scope.launch {
        appSettingsStore.debugFastStalenessFlow().flatMapLatest { fast ->
            // One CGM staleness window under the ACTIVE policy: the same clock the phone's own
            // "watching" claim decays by, compressed when the debug fast-staleness toggle is on.
            val timeoutMs = FreshnessPolicy.cgm(fast).staleAfterMs
            combine(
                alertFloorStatusProvider.observe(),
                tickerFlow(heartbeatPeriodMs(timeoutMs)),
            ) { status, _ -> status to timeoutMs }
        }.retryWhen { cause, attempt ->
            // A coverage-status stream must never die silently: the watch would decay to "no
            // recent data" (honest), but a live phone should keep the wrist current. Resubscribe.
            Timber.e(cause, "Wear monitoring-status forwarder failed (attempt %d); retrying", attempt)
            delay(RETRY_DELAY_MS)
            true
        }.collect { (status, timeoutMs) ->
            val (state, reason) = status.toWire()
            wearDataSender.sendMonitoringStatus(state, reason, timeoutMs)
        }
    }

    private fun tickerFlow(periodMs: Long): Flow<Unit> = flow {
        while (true) {
            emit(Unit)
            delay(periodMs)
        }
    }

    companion object {
        /** Pause before resubscribing a failed pipeline, mirroring [AlertFloorStatusProvider]. */
        const val RETRY_DELAY_MS = 5_000L

        /** Floor for the heartbeat period so the compressed debug policy can't hot-loop sends. */
        const val MIN_HEARTBEAT_MS = 5_000L

        /**
         * Re-send cadence: half the advertised timeout, so a single dropped DataItem does not
         * decay the wrist to "no recent data" while the phone is actually alive and watching.
         */
        fun heartbeatPeriodMs(timeoutMs: Long): Long =
            (timeoutMs / 2).coerceAtLeast(MIN_HEARTBEAT_MS)

        /**
         * The wire encoding of the phone's coverage decision. Enum-name reasons on purpose:
         * the contract constants pin the phone's [com.glycemicgpt.mobile.domain.alerting.FloorNotWatchingReason]
         * names as the wire vocabulary, so a renamed reason breaks the contract test instead of
         * silently sending a string the watch renders as generic copy.
         */
        fun AlertFloorStatus.toWire(): Pair<String, String?> = when (this) {
            AlertFloorStatus.ServerActive ->
                WearDataContract.MONITORING_STATE_SERVER_ACTIVE to null
            AlertFloorStatus.FloorWatching ->
                WearDataContract.MONITORING_STATE_FLOOR_WATCHING to null
            is AlertFloorStatus.FloorNotWatching ->
                WearDataContract.MONITORING_STATE_NOT_WATCHING to reason.name
        }
    }
}
