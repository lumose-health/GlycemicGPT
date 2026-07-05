package com.glycemicgpt.mobile.service

import com.glycemicgpt.mobile.data.local.AlertThresholdStore
import com.glycemicgpt.mobile.data.local.AppSettingsStore
import com.glycemicgpt.mobile.data.local.dao.AlertDao
import com.glycemicgpt.mobile.data.network.NetworkMonitor
import com.glycemicgpt.mobile.data.network.NetworkStatus
import com.glycemicgpt.mobile.domain.alerting.AlertFloorStatus
import com.glycemicgpt.mobile.domain.alerting.alertFloorStatus
import com.glycemicgpt.mobile.domain.freshness.FreshnessPolicy
import com.glycemicgpt.mobile.domain.model.CgmReading
import com.glycemicgpt.mobile.domain.model.CgmTrend
import com.glycemicgpt.mobile.domain.model.GlucoseUnit
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.MutableStateFlow
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Instant

/**
 * GLY-145 AC3: the surface's "watching" claim and the floor's actual firing gate derive from
 * the same predicate and can never disagree. Sweeps configured x freshness with every other
 * status input pinned to the floor-favorable value (degraded server, notifications granted,
 * pump connected), asserting [AlertFloor.isReadingAlertable] == "claims FloorWatching" cell by
 * cell. A partial repoint of the arming gate (floor on one predicate, status on another) is
 * exactly the silent-floor bug GLY-115 exists to prevent, and fails here.
 */
class AlertFloorArmingConsistencyTest {

    private val nowMs = 1_750_000_000_000L

    private fun floorWith(configured: Boolean): AlertFloor {
        val store = mockk<AlertThresholdStore>(relaxed = true) {
            every { isConfigured() } returns configured
        }
        val appSettingsStore = mockk<AppSettingsStore>(relaxed = true) {
            every { debugFastStaleness } returns false
            every { glucoseUnit } returns GlucoseUnit.MGDL
        }
        return AlertFloor(
            store,
            mockk(relaxed = true),
            mockk<AlertStreamStateHolder> {
                every { state } returns MutableStateFlow(AlertStreamState.RECONNECTING)
            },
            mockk<NetworkMonitor> {
                every { status } returns MutableStateFlow(NetworkStatus.BACKEND_UNREACHABLE)
            },
            mockk<AlertDao>(relaxed = true),
            appSettingsStore,
        )
    }

    @Test
    fun `the watching claim and the firing gate agree across the configured x freshness grid`() {
        for (configured in listOf(true, false)) {
            for (backendConfigured in listOf(true, false)) {
                for (ageMs in listOf(0L, 30_000L, 7 * 60_000L, 60 * 60_000L)) {
                    val floor = floorWith(configured)
                    val reading = CgmReading(
                        glucoseMgDl = 54,
                        trendArrow = CgmTrend.FLAT,
                        timestamp = Instant.ofEpochMilli(nowMs - ageMs),
                    )
                    val fires = floor.isReadingAlertable(reading, nowMs)
                    val claimsWatching = alertFloorStatus(
                        networkStatus = NetworkStatus.BACKEND_UNREACHABLE,
                        streamState = AlertStreamState.RECONNECTING,
                        cgmAgeMs = ageMs,
                        cgmThresholds = FreshnessPolicy.CGM,
                        thresholdsConfigured = configured,
                        backendConfigured = backendConfigured,
                        canNotify = true,
                        pumpConnected = true,
                    ) == AlertFloorStatus.FloorWatching
                    assertEquals(
                        "configured=$configured backend=$backendConfigured ageMs=$ageMs: " +
                            "surface claims watching=$claimsWatching but floor fires=$fires",
                        fires,
                        claimsWatching,
                    )
                }
            }
        }
    }
}
