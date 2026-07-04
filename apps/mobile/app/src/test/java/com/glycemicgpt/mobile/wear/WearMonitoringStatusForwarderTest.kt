package com.glycemicgpt.mobile.wear

import com.glycemicgpt.mobile.data.local.AppSettingsStore
import com.glycemicgpt.mobile.domain.alerting.AlertFloorStatus
import com.glycemicgpt.mobile.domain.alerting.FloorNotWatchingReason
import com.glycemicgpt.mobile.domain.freshness.FreshnessPolicy
import com.glycemicgpt.mobile.service.AlertFloorStatusProvider
import com.glycemicgpt.mobile.wear.WearMonitoringStatusForwarder.Companion.heartbeatPeriodMs
import com.glycemicgpt.mobile.wear.WearMonitoringStatusForwarder.Companion.toWire
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The phone-side forwarding wiring for the wrist coverage mirror (GLY-116 AC-B #7): without
 * these, the watch-render tests can pass while the phone never sends — a silent I-honesty
 * failure. Verifies the provider stream reaches [WearDataSender.sendMonitoringStatus] with the
 * exact wire vocabulary, and that a steady status is re-sent as a heartbeat (the watch's local
 * timeout counts from the last push, so a single send would decay a healthy wrist to "no
 * recent data").
 */
@OptIn(ExperimentalCoroutinesApi::class)
class WearMonitoringStatusForwarderTest {

    private val statusFlow = MutableStateFlow<AlertFloorStatus>(AlertFloorStatus.ServerActive)
    private val provider = mockk<AlertFloorStatusProvider> {
        every { observe() } returns statusFlow
    }
    private val appSettingsStore = mockk<AppSettingsStore>(relaxed = true) {
        every { debugFastStalenessFlow() } returns flowOf(false)
    }
    private val wearDataSender = mockk<WearDataSender>(relaxed = true)

    private val forwarder =
        WearMonitoringStatusForwarder(provider, appSettingsStore, wearDataSender)

    /** One CGM staleness window under the production policy — the advertised watch timeout. */
    private val timeoutMs = FreshnessPolicy.CGM.staleAfterMs

    @Test
    fun `not-watching emission is forwarded with the exact reason vocabulary`() = runTest {
        statusFlow.value =
            AlertFloorStatus.FloorNotWatching(FloorNotWatchingReason.NO_FRESH_READING)
        val job = forwarder.start(this)
        advanceTimeBy(1_000L)

        coVerify(atLeast = 1) {
            wearDataSender.sendMonitoringStatus(
                WearDataContract.MONITORING_STATE_NOT_WATCHING,
                WearDataContract.MONITORING_REASON_NO_FRESH_READING,
                timeoutMs,
            )
        }
        job.cancel()
    }

    @Test
    fun `watching emissions forward server-active and floor-watching states`() = runTest {
        val job = forwarder.start(this)
        advanceTimeBy(1_000L)
        coVerify(atLeast = 1) {
            wearDataSender.sendMonitoringStatus(
                WearDataContract.MONITORING_STATE_SERVER_ACTIVE,
                null,
                timeoutMs,
            )
        }

        statusFlow.value = AlertFloorStatus.FloorWatching
        advanceTimeBy(1_000L)
        coVerify(atLeast = 1) {
            wearDataSender.sendMonitoringStatus(
                WearDataContract.MONITORING_STATE_FLOOR_WATCHING,
                null,
                timeoutMs,
            )
        }
        job.cancel()
    }

    @Test
    fun `steady status is re-sent as a heartbeat, not just on change`() = runTest {
        val job = forwarder.start(this)
        // Three heartbeat periods with NO status change: at least the initial send plus two
        // re-sends must have gone out, or a dead-phone timeout on the watch would also fire
        // for a perfectly healthy phone.
        advanceTimeBy(heartbeatPeriodMs(timeoutMs) * 3 + 1_000L)

        coVerify(atLeast = 3) {
            wearDataSender.sendMonitoringStatus(
                WearDataContract.MONITORING_STATE_SERVER_ACTIVE,
                null,
                timeoutMs,
            )
        }
        job.cancel()
    }

    @Test
    fun `wire mapping mirrors AlertFloorStatus exactly`() {
        assertEquals(
            WearDataContract.MONITORING_STATE_SERVER_ACTIVE to null,
            AlertFloorStatus.ServerActive.toWire(),
        )
        assertEquals(
            WearDataContract.MONITORING_STATE_FLOOR_WATCHING to null,
            AlertFloorStatus.FloorWatching.toWire(),
        )
        // Every reason forwards under its enum name — the contract constants pin the wire
        // strings, so a reason rename breaks this test instead of silently degrading the
        // watch's copy to the generic line.
        assertEquals(
            WearDataContract.MONITORING_STATE_NOT_WATCHING to "NOTIFICATIONS_DENIED",
            AlertFloorStatus.FloorNotWatching(FloorNotWatchingReason.NOTIFICATIONS_DENIED).toWire(),
        )
        assertEquals(
            WearDataContract.MONITORING_STATE_NOT_WATCHING to "THRESHOLDS_NOT_SYNCED",
            AlertFloorStatus.FloorNotWatching(FloorNotWatchingReason.THRESHOLDS_NOT_SYNCED).toWire(),
        )
        assertEquals(
            WearDataContract.MONITORING_STATE_NOT_WATCHING to "PUMP_DISCONNECTED",
            AlertFloorStatus.FloorNotWatching(FloorNotWatchingReason.PUMP_DISCONNECTED).toWire(),
        )
        assertEquals(
            WearDataContract.MONITORING_STATE_NOT_WATCHING to "NO_FRESH_READING",
            AlertFloorStatus.FloorNotWatching(FloorNotWatchingReason.NO_FRESH_READING).toWire(),
        )
    }

    @Test
    fun `heartbeat period is half the timeout with a floor`() {
        assertEquals(3 * 60_000L, heartbeatPeriodMs(6 * 60_000L))
        // Compressed debug window (20s) halves to 10s — above the anti-hot-loop floor.
        assertEquals(10_000L, heartbeatPeriodMs(FreshnessPolicy.CGM_DEBUG_FAST.staleAfterMs))
        // The floor kicks in below 10s windows.
        assertEquals(WearMonitoringStatusForwarder.MIN_HEARTBEAT_MS, heartbeatPeriodMs(8_000L))
    }
}
