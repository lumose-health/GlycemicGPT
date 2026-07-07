package com.glycemicgpt.mobile.service

import app.cash.turbine.test
import com.glycemicgpt.mobile.data.local.AlertThresholdStore
import com.glycemicgpt.mobile.data.local.AppSettingsStore
import com.glycemicgpt.mobile.data.local.AuthTokenStore
import com.glycemicgpt.mobile.data.network.NetworkMonitor
import com.glycemicgpt.mobile.data.network.NetworkStatus
import com.glycemicgpt.mobile.data.repository.PumpDataRepository
import com.glycemicgpt.mobile.domain.alerting.AlertFloorStatus
import com.glycemicgpt.mobile.domain.alerting.FloorNotWatchingReason
import com.glycemicgpt.mobile.domain.model.ConnectionState
import com.glycemicgpt.mobile.domain.pump.PumpConnectionManager
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Pins the store→provider→claim WIRING (GLY-151): [AlertFloorStatusProvider.current] and
 * [AlertFloorStatusProvider.observe] must actually read `AlertThresholdStore.isConfigured()` /
 * `isConfiguredFlow()` when deciding the coverage claim. [AlertFloorArmingConsistencyTest] only
 * exercises the pure [com.glycemicgpt.mobile.domain.alerting.alertFloorStatus] selector with
 * hand-passed booleans — a provider that stopped consulting the store (or hardcoded the input)
 * would keep that test green while silently mis-claiming; it fails here.
 *
 * Pure JVM: every Android-touching dependency is mocked; only `System.currentTimeMillis()`
 * runs for real.
 */
class AlertFloorStatusProviderTest {

    /**
     * Provider with every input pinned floor-favorable EXCEPT thresholds: server alerting
     * degraded (so the floor's claim is decisive), pump connected, notifications allowed,
     * no backend, wall clock sane. With [thresholdsConfigured] false the ONLY reason the
     * floor can report is the missing thresholds.
     */
    private fun provider(thresholdsConfigured: Boolean): AlertFloorStatusProvider {
        val networkMonitor = mockk<NetworkMonitor> {
            every { status } returns MutableStateFlow(NetworkStatus.BACKEND_UNREACHABLE)
        }
        val streamStateHolder = mockk<AlertStreamStateHolder> {
            every { state } returns MutableStateFlow(AlertStreamState.RECONNECTING)
        }
        val pumpDataRepository = mockk<PumpDataRepository> {
            every { observeLatestCgm() } returns flowOf(null)
        }
        val pumpConnectionManager = mockk<PumpConnectionManager> {
            every { connectionState } returns MutableStateFlow(ConnectionState.CONNECTED)
        }
        val alertThresholdStore = mockk<AlertThresholdStore> {
            every { isConfigured() } returns thresholdsConfigured
            every { isConfiguredFlow() } returns flowOf(thresholdsConfigured)
        }
        val authTokenStore = mockk<AuthTokenStore> {
            every { backendConfiguredFlow() } returns flowOf(false)
        }
        val appSettingsStore = mockk<AppSettingsStore> {
            every { debugFastStaleness } returns false
            every { debugFastStalenessFlow() } returns flowOf(false)
        }
        val alertNotificationManager = mockk<AlertNotificationManager> {
            every { canPostAlertNotifications() } returns true
        }
        val alertFloor = mockk<AlertFloor>(relaxed = true) {
            every { isWallClockRewound(any()) } returns false
        }
        return AlertFloorStatusProvider(
            networkMonitor,
            streamStateHolder,
            pumpDataRepository,
            pumpConnectionManager,
            alertThresholdStore,
            authTokenStore,
            appSettingsStore,
            alertNotificationManager,
            alertFloor,
        )
    }

    @Test
    fun `current reads the store - unconfigured thresholds report THRESHOLDS_NOT_CONFIGURED`() {
        assertEquals(
            AlertFloorStatus.FloorNotWatching(FloorNotWatchingReason.THRESHOLDS_NOT_CONFIGURED),
            provider(thresholdsConfigured = false).current(),
        )
    }

    @Test
    fun `observe first emission reads the store flow - unconfigured reports THRESHOLDS_NOT_CONFIGURED`() =
        runTest {
            provider(thresholdsConfigured = false).observe().test {
                assertEquals(
                    AlertFloorStatus.FloorNotWatching(
                        FloorNotWatchingReason.THRESHOLDS_NOT_CONFIGURED,
                    ),
                    awaitItem(),
                )
                // observe() runs an endless ticker; the claim is stable so nothing else arrives.
                cancelAndIgnoreRemainingEvents()
            }
        }

    @Test
    fun `observe consumes the store value - configured thresholds move past the thresholds gate`() =
        runTest {
            // The counter-direction to the test above: together they pin that observe() actually
            // reads isConfiguredFlow()'s VALUE — hardcoding the input either way fails one of
            // the pair. With no cached CGM the status falls to the residual reason.
            provider(thresholdsConfigured = true).observe().test {
                assertEquals(
                    AlertFloorStatus.FloorNotWatching(FloorNotWatchingReason.NO_FRESH_READING),
                    awaitItem(),
                )
                cancelAndIgnoreRemainingEvents()
            }
        }

    @Test
    fun `current seed is pessimistic - never claims watching before the CGM flow spins up`() {
        // current() deliberately passes no CGM age (the Room read is async): even with
        // thresholds configured and every other precondition green it must under-claim
        // ("NOT watching — no fresh reading"), never seed a watching state it can't vouch for.
        assertEquals(
            AlertFloorStatus.FloorNotWatching(FloorNotWatchingReason.NO_FRESH_READING),
            provider(thresholdsConfigured = true).current(),
        )
    }
}
