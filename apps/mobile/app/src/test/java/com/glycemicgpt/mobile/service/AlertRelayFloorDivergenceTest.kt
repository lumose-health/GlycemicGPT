package com.glycemicgpt.mobile.service

import com.glycemicgpt.mobile.data.local.AlertThresholdStore
import com.glycemicgpt.mobile.data.local.AppSettingsStore
import com.glycemicgpt.mobile.data.local.GlucoseRangeStore
import com.glycemicgpt.mobile.data.local.SafetyLimitsStore
import com.glycemicgpt.mobile.data.local.dao.AlertDao
import com.glycemicgpt.mobile.data.local.dao.RawHistoryLogDao
import com.glycemicgpt.mobile.data.local.entity.AlertEntity
import com.glycemicgpt.mobile.data.network.NetworkMonitor
import com.glycemicgpt.mobile.data.network.NetworkStatus
import com.glycemicgpt.mobile.data.repository.PumpDataRepository
import com.glycemicgpt.mobile.data.repository.SyncQueueEnqueuer
import com.glycemicgpt.mobile.domain.model.CgmReading
import com.glycemicgpt.mobile.domain.model.CgmTrend
import com.glycemicgpt.mobile.domain.model.GlucoseUnit
import com.glycemicgpt.mobile.domain.pump.HistoryLogParser
import com.glycemicgpt.mobile.domain.pump.PumpDriver
import com.glycemicgpt.mobile.wear.WearDataSender
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import org.junit.Test
import java.time.Instant

/**
 * GLY-116 divergence guard: with every confounder pinned to "the floor would fire" —
 * server alerting degraded, POST_NOTIFICATIONS granted, no prior fire/ack, no server-episode
 * row — the watch relay pushes an alert ⟺ the floor fires its notification, across the
 * freshness+sync grid. Both sides run the REAL code path (real [AlertFloor], real
 * [PumpPollingOrchestrator.processCgmReading]), so the two consumers cannot drift apart on the
 * data-trust bound without failing here.
 *
 * Explicitly out of scope: the healthy-online case, where the relay pushes but the floor
 * defers to the server (gate 1) — the paths are MEANT to diverge on the degraded axis, so no
 * bare `relayPushes ⟺ floorFires` is asserted there.
 */
class AlertRelayFloorDivergenceTest {

    private class Fixture(configured: Boolean) {
        val wearDataSender = mockk<WearDataSender>(relaxed = true)
        val alertNotificationManager = mockk<AlertNotificationManager>(relaxed = true) {
            every { canPostAlertNotifications() } returns true
            every { stableNotificationId(any()) } answers {
                (firstArg<AlertEntity>().alertType.hashCode() and 0x7FFFFFFF).coerceAtLeast(100)
            }
        }
        private val alertThresholdStore = mockk<AlertThresholdStore>(relaxed = true) {
            every { urgentLowMgDl } returns 55
            every { lowWarningMgDl } returns 70
            every { highWarningMgDl } returns 180
            every { urgentHighMgDl } returns 250
            every { isConfigured() } returns configured
        }
        private val appSettingsStore = mockk<AppSettingsStore>(relaxed = true) {
            every { debugFastStaleness } returns false
            every { glucoseUnit } returns GlucoseUnit.MGDL
        }
        val floor = AlertFloor(
            alertThresholdStore,
            alertNotificationManager,
            mockk<AlertStreamStateHolder> {
                every { state } returns MutableStateFlow(AlertStreamState.RECONNECTING)
            },
            mockk<NetworkMonitor> {
                every { status } returns MutableStateFlow(NetworkStatus.BACKEND_UNREACHABLE)
            },
            mockk<AlertDao> {
                coEvery { getLatestUnacknowledgedTimestampForType(any(), any()) } returns null
            },
            appSettingsStore,
        )
        val orchestrator = PumpPollingOrchestrator(
            mockk<PumpDriver>(relaxed = true),
            mockk<PumpDataRepository>(relaxed = true),
            mockk<SyncQueueEnqueuer>(relaxed = true),
            mockk<RawHistoryLogDao>(relaxed = true),
            wearDataSender,
            mockk<GlucoseRangeStore>(relaxed = true),
            mockk<SafetyLimitsStore>(relaxed = true),
            mockk<HistoryLogParser>(relaxed = true),
            appSettingsStore,
            floor,
        )
    }

    /** Ages chosen well clear of the 6-min FRESH edge: boundary precision belongs to the
     *  predicate unit tests with an injectable clock; this sweep runs on the real clock. */
    private fun sweep(ageMs: Long, configured: Boolean, expectBothFire: Boolean) = runTest {
        val fixture = Fixture(configured)
        val reading = CgmReading(
            glucoseMgDl = 54,
            trendArrow = CgmTrend.FLAT,
            timestamp = Instant.now().minusMillis(ageMs),
        )
        fixture.orchestrator.processCgmReading(reading)

        val expected = if (expectBothFire) 1 else 0
        coVerify(exactly = expected) {
            fixture.wearDataSender.sendAlert(any(), any(), any(), any())
        }
        verify(exactly = expected) {
            fixture.alertNotificationManager.showAlertNotification(any(), any())
        }
    }

    @Test
    fun `fresh configured low - relay and floor both fire`() =
        sweep(ageMs = 0L, configured = true, expectBothFire = true)

    @Test
    fun `fresh configured low near the FRESH edge - relay and floor both fire`() =
        sweep(ageMs = 5 * 60_000L, configured = true, expectBothFire = true)

    @Test
    fun `stale configured low - relay and floor both silent`() =
        sweep(ageMs = 7 * 60_000L, configured = true, expectBothFire = false)

    @Test
    fun `too-stale configured low - relay and floor both silent`() =
        sweep(ageMs = 60 * 60_000L, configured = true, expectBothFire = false)

    @Test
    fun `fresh never-configured low - relay and floor both silent`() =
        sweep(ageMs = 0L, configured = false, expectBothFire = false)

    @Test
    fun `stale never-configured low - relay and floor both silent`() =
        sweep(ageMs = 7 * 60_000L, configured = false, expectBothFire = false)
}
