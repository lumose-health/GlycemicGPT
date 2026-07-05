package com.glycemicgpt.mobile.service

import com.glycemicgpt.mobile.data.local.AlertThresholdStore
import com.glycemicgpt.mobile.data.local.AppSettingsStore
import com.glycemicgpt.mobile.data.local.ThresholdSource
import com.glycemicgpt.mobile.data.local.dao.AlertDao
import com.glycemicgpt.mobile.data.local.entity.AlertEntity
import com.glycemicgpt.mobile.data.network.NetworkMonitor
import com.glycemicgpt.mobile.domain.alerting.AlertFloorStatus
import com.glycemicgpt.mobile.domain.alerting.AlertTypes
import com.glycemicgpt.mobile.domain.alerting.FloorNotWatchingReason
import com.glycemicgpt.mobile.domain.alerting.alertFloorStatus
import com.glycemicgpt.mobile.data.network.NetworkStatus
import com.glycemicgpt.mobile.domain.freshness.FreshnessPolicy
import com.glycemicgpt.mobile.domain.model.CgmReading
import com.glycemicgpt.mobile.domain.model.CgmTrend
import com.glycemicgpt.mobile.domain.model.GlucoseUnit
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import io.mockk.verify
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.time.Instant

/**
 * Behavioral tests for the on-device freshness-gated alert floor (GLY-115).
 *
 * The lethal invariant pinned here: the floor NEVER fires on a non-FRESH reading (AC2), and each
 * of the four preconditions independently blocks firing (AC1/AC3/AC4). Plus the dedup layers:
 * per-type cooldown mirroring the server's 30-minute window, the episode guard across the
 * REACHABLE→UNREACHABLE flip, and the server-vocabulary classification (AC5/AC6).
 */
class AlertFloorTest {

    private val networkStatusFlow = MutableStateFlow(NetworkStatus.BACKEND_UNREACHABLE)
    private val streamStateFlow = MutableStateFlow(AlertStreamState.RECONNECTING)

    private lateinit var alertThresholdStore: AlertThresholdStore
    private lateinit var alertNotificationManager: AlertNotificationManager
    private lateinit var alertStreamStateHolder: AlertStreamStateHolder
    private lateinit var networkMonitor: NetworkMonitor
    private lateinit var alertDao: AlertDao
    private lateinit var appSettingsStore: AppSettingsStore
    private lateinit var floor: AlertFloor

    /** Fixed "now" so freshness and cooldown math is deterministic. */
    private val nowMs = 1_750_000_000_000L

    @Before
    fun setUp() {
        alertThresholdStore = mockk(relaxed = true) {
            every { urgentLowMgDl } returns 55
            every { lowWarningMgDl } returns 70
            every { highWarningMgDl } returns 180
            every { urgentHighMgDl } returns 250
            every { isConfigured() } returns true
        }
        alertNotificationManager = mockk(relaxed = true) {
            every { canPostAlertNotifications() } returns true
            every { stableNotificationId(any()) } answers {
                (firstArg<AlertEntity>().alertType.hashCode() and 0x7FFFFFFF).coerceAtLeast(100)
            }
        }
        alertStreamStateHolder = mockk {
            every { state } returns streamStateFlow
        }
        networkMonitor = mockk {
            every { status } returns networkStatusFlow
        }
        alertDao = mockk {
            coEvery { getLatestUnacknowledgedTimestampForType(any(), any()) } returns null
        }
        appSettingsStore = mockk(relaxed = true) {
            every { debugFastStaleness } returns false
            every { glucoseUnit } returns GlucoseUnit.MGDL
        }
        floor = AlertFloor(
            alertThresholdStore,
            alertNotificationManager,
            alertStreamStateHolder,
            networkMonitor,
            alertDao,
            appSettingsStore,
        )
    }

    /** Run the floor for a reading whose sensor timestamp is [ageMs] before [atMs]. */
    private suspend fun evaluate(mgDl: Int, ageMs: Long = 0L, atMs: Long = nowMs) {
        floor.onCgmReading(
            CgmReading(
                glucoseMgDl = mgDl,
                trendArrow = CgmTrend.FLAT,
                timestamp = Instant.ofEpochMilli(atMs - ageMs),
            ),
            floor.classify(mgDl),
            nowMs = atMs,
        )
    }

    // -- classification: server AlertType vocabulary off the synced alert thresholds -----------

    @Test
    fun `classify maps bands to the server vocabulary with urgent precedence`() {
        assertEquals(AlertTypes.LOW_URGENT, floor.classify(55))
        assertEquals(AlertTypes.LOW_URGENT, floor.classify(40))
        assertEquals(AlertTypes.LOW_WARNING, floor.classify(56))
        assertEquals(AlertTypes.LOW_WARNING, floor.classify(70))
        assertNull(floor.classify(71))
        assertNull(floor.classify(120))
        assertNull(floor.classify(179))
        assertEquals(AlertTypes.HIGH_WARNING, floor.classify(180))
        assertEquals(AlertTypes.HIGH_WARNING, floor.classify(249))
        assertEquals(AlertTypes.HIGH_URGENT, floor.classify(250))
        assertEquals(AlertTypes.HIGH_URGENT, floor.classify(400))
    }

    @Test
    fun `classify never emits the watch vocabulary`() {
        for (mgDl in intArrayOf(40, 60, 200, 300)) {
            val type = floor.classify(mgDl)
            assertTrue(
                "watch string leaked into floor classification: $type",
                type !in setOf("urgent_low", "low", "high", "urgent_high"),
            )
        }
    }

    // -- AC1: all gates pass, floor fires ------------------------------------------------------

    @Test
    fun `fresh low while degraded fires the alarm with disclaimer and stable slot`() = runTest {
        evaluate(mgDl = 54, ageMs = 30_000L)

        val entity = slot<AlertEntity>()
        verify(exactly = 1) { alertNotificationManager.showAlertNotification(capture(entity), any()) }
        with(entity.captured) {
            assertEquals(AlertTypes.LOW_URGENT, alertType)
            assertEquals("urgent", severity)
            assertEquals(54.0, currentValue, 0.0)
            assertTrue(serverId.startsWith(AlertNotificationManager.LOCAL_FLOOR_ID_PREFIX))
            assertTrue(message.contains("computed on your phone"))
            assertTrue(message.contains("Threshold-only, no prediction"))
            assertTrue(message.contains("Not a replacement for your CGM app"))
        }
    }

    @Test
    fun `fresh high fires with warning severity`() = runTest {
        evaluate(mgDl = 200)

        val entity = slot<AlertEntity>()
        verify(exactly = 1) { alertNotificationManager.showAlertNotification(capture(entity), any()) }
        assertEquals(AlertTypes.HIGH_WARNING, entity.captured.alertType)
        assertEquals("warning", entity.captured.severity)
    }

    @Test
    fun `in-range reading is a no-op`() = runTest {
        evaluate(mgDl = 120)
        verify(exactly = 0) { alertNotificationManager.showAlertNotification(any(), any()) }
    }

    // -- AC2: THE safety invariant — never fire on a non-FRESH reading -------------------------

    @Test
    fun `STALE reading never fires`() = runTest {
        // 6 min is the FRESH/STALE boundary (half-open: exactly 6 min is STALE)
        evaluate(mgDl = 54, ageMs = 6 * 60_000L)
        verify(exactly = 0) { alertNotificationManager.showAlertNotification(any(), any()) }
    }

    @Test
    fun `TOO_STALE reading never fires`() = runTest {
        evaluate(mgDl = 54, ageMs = 20 * 60_000L)
        verify(exactly = 0) { alertNotificationManager.showAlertNotification(any(), any()) }
    }

    @Test
    fun `reading just inside the FRESH bound fires`() = runTest {
        evaluate(mgDl = 54, ageMs = 6 * 60_000L - 1)
        verify(exactly = 1) { alertNotificationManager.showAlertNotification(any(), any()) }
    }

    @Test
    fun `clock skew - small future-dated reading still fires`() = runTest {
        // Pump clocks routinely run seconds ahead; a hard age>=0 gate would silently disable
        // the floor — the inverted version of the same lethal failure.
        evaluate(mgDl = 54, ageMs = -30_000L)
        verify(exactly = 1) { alertNotificationManager.showAlertNotification(any(), any()) }
    }

    @Test
    fun `clock skew - reading future-dated beyond tolerance never fires`() = runTest {
        // A backwards phone-clock jump makes a genuinely old reading look future-dated; the
        // display classifier calls any negative age FRESH, the floor must not.
        evaluate(mgDl = 54, ageMs = -10 * 60_000L)
        verify(exactly = 0) { alertNotificationManager.showAlertNotification(any(), any()) }
    }

    @Test
    fun `debug fast staleness policy governs the gate when enabled`() = runTest {
        every { appSettingsStore.debugFastStaleness } returns true
        // 30s old: FRESH under the real 6-min policy, STALE under CGM_DEBUG_FAST (20s) — the
        // floor must read the swapped policy or the E2E harness would test nothing.
        evaluate(mgDl = 54, ageMs = 30_000L)
        verify(exactly = 0) { alertNotificationManager.showAlertNotification(any(), any()) }

        evaluate(mgDl = 54, ageMs = 10_000L)
        verify(exactly = 1) { alertNotificationManager.showAlertNotification(any(), any()) }
    }

    // -- AC4: armed only when the server can't alert -------------------------------------------

    @Test
    fun `reachable and connected - floor stays silent on a fresh low`() = runTest {
        networkStatusFlow.value = NetworkStatus.REACHABLE
        streamStateFlow.value = AlertStreamState.CONNECTED

        evaluate(mgDl = 54)
        verify(exactly = 0) { alertNotificationManager.showAlertNotification(any(), any()) }
    }

    @Test
    fun `stream down alone arms the floor even while HTTP works`() = runTest {
        networkStatusFlow.value = NetworkStatus.REACHABLE
        streamStateFlow.value = AlertStreamState.DISCONNECTED

        evaluate(mgDl = 54)
        verify(exactly = 1) { alertNotificationManager.showAlertNotification(any(), any()) }
    }

    @Test
    fun `device offline arms the floor`() = runTest {
        networkStatusFlow.value = NetworkStatus.OFFLINE
        streamStateFlow.value = AlertStreamState.CONNECTED

        evaluate(mgDl = 54)
        verify(exactly = 1) { alertNotificationManager.showAlertNotification(any(), any()) }
    }

    // -- AC3: never fire off unconfigured (default) thresholds ---------------------------------

    @Test
    fun `never-configured thresholds - floor never fires`() = runTest {
        every { alertThresholdStore.isConfigured() } returns false

        evaluate(mgDl = 54)
        verify(exactly = 0) { alertNotificationManager.showAlertNotification(any(), any()) }
    }

    @Test
    fun `locally set thresholds arm the floor with no backend sync ever`() = runTest {
        // A BLE-only store (GLY-145): user-set LOCAL source, no backend fetch timestamp. Pins
        // the arming gate to isConfigured() — a regression to any sync-derived gate (the
        // pre-GLY-145 isSynced) reads the zero fetch timestamp and goes red here.
        every { alertThresholdStore.source } returns ThresholdSource.LOCAL
        every { alertThresholdStore.lastFetchedMs } returns 0L
        every { alertThresholdStore.isConfigured() } returns true

        evaluate(mgDl = 54)
        verify(exactly = 1) { alertNotificationManager.showAlertNotification(any(), any()) }
    }

    // -- gate 4: notifications permission ------------------------------------------------------

    @Test
    fun `notifications denied - floor does not fire and does not spend the cooldown`() = runTest {
        every { alertNotificationManager.canPostAlertNotifications() } returns false
        evaluate(mgDl = 54)
        verify(exactly = 0) { alertNotificationManager.showAlertNotification(any(), any()) }

        // Permission granted moments later: the alarm must not have been "spent" silently.
        every { alertNotificationManager.canPostAlertNotifications() } returns true
        evaluate(mgDl = 54, atMs = nowMs + 15_000L)
        verify(exactly = 1) { alertNotificationManager.showAlertNotification(any(), any()) }
    }

    // -- AC6: cooldown + type transitions ------------------------------------------------------

    @Test
    fun `sustained low does not re-alarm within the 30-minute window`() = runTest {
        evaluate(mgDl = 54)
        evaluate(mgDl = 53, atMs = nowMs + 15_000L)
        evaluate(mgDl = 52, atMs = nowMs + 29 * 60_000L)

        verify(exactly = 1) { alertNotificationManager.showAlertNotification(any(), any()) }
    }

    @Test
    fun `still low after the window elapses re-alarms`() = runTest {
        evaluate(mgDl = 54)
        evaluate(mgDl = 54, atMs = nowMs + AlertFloor.FLOOR_COOLDOWN_MS)

        verify(exactly = 2) { alertNotificationManager.showAlertNotification(any(), any()) }
    }

    @Test
    fun `escalation to a different type fires immediately`() = runTest {
        evaluate(mgDl = 65) // low_warning
        evaluate(mgDl = 54, atMs = nowMs + 15_000L) // low_urgent — different type, no cooldown

        verify(exactly = 2) { alertNotificationManager.showAlertNotification(any(), any()) }
    }

    // -- AC5 episode guard: no double-alarm across the degraded flip ---------------------------

    @Test
    fun `server alerted the same type just before the outage - floor suppresses and seeds cooldown`() = runTest {
        coEvery {
            alertDao.getLatestUnacknowledgedTimestampForType(AlertTypes.LOW_URGENT, any())
        } returns nowMs - 5 * 60_000L

        evaluate(mgDl = 54)
        verify(exactly = 0) { alertNotificationManager.showAlertNotification(any(), any()) }

        // Still inside the window measured from the SERVER alert: stays suppressed.
        evaluate(mgDl = 54, atMs = nowMs + 10 * 60_000L)
        verify(exactly = 0) { alertNotificationManager.showAlertNotification(any(), any()) }
    }

    @Test
    fun `old server alert outside the window does not suppress`() = runTest {
        coEvery { alertDao.getLatestUnacknowledgedTimestampForType(any(), any()) } returns null

        evaluate(mgDl = 54)
        verify(exactly = 1) { alertNotificationManager.showAlertNotification(any(), any()) }
    }

    @Test
    fun `episode lookup failure fails toward alerting`() = runTest {
        coEvery { alertDao.getLatestUnacknowledgedTimestampForType(any(), any()) } throws RuntimeException("db closed")

        evaluate(mgDl = 54)
        // A broken lookup may cost a duplicate alarm, never a missed one.
        verify(exactly = 1) { alertNotificationManager.showAlertNotification(any(), any()) }
    }

    // -- ack semantics: bounded snooze, distinct-episode re-arm, never permanent silence -------

    @Test
    fun `acked then recovered then re-crossed - alarms again immediately as a distinct episode`() = runTest {
        evaluate(mgDl = 54)
        verify(exactly = 1) { alertNotificationManager.showAlertNotification(any(), any()) }

        // User acknowledges (aware, treats); glucose recovers into range, then crashes again
        // 20 minutes after the first fire — a NEW distinct low well inside the raw 30-min
        // window. Recovery re-armed the type, so it must alarm immediately.
        floor.onFloorAlertAcknowledged(AlertTypes.LOW_URGENT, nowMs = nowMs + 60_000L)
        evaluate(mgDl = 120, atMs = nowMs + 10 * 60_000L) // recovery reading
        evaluate(mgDl = 50, atMs = nowMs + 20 * 60_000L)

        verify(exactly = 2) { alertNotificationManager.showAlertNotification(any(), any()) }
    }

    @Test
    fun `acked sustained low does not re-alarm on the next polls - ack is not a 15s snooze loop`() = runTest {
        evaluate(mgDl = 54)
        floor.onFloorAlertAcknowledged(AlertTypes.LOW_URGENT, nowMs = nowMs + 60_000L)

        // Same un-recovered low on subsequent polls: silenced (the user just said "seen").
        evaluate(mgDl = 54, atMs = nowMs + 75_000L)
        evaluate(mgDl = 53, atMs = nowMs + 10 * 60_000L)

        verify(exactly = 1) { alertNotificationManager.showAlertNotification(any(), any()) }
    }

    @Test
    fun `acked sustained low re-alarms one cooldown after the ack - never permanently silent`() = runTest {
        evaluate(mgDl = 54)
        floor.onFloorAlertAcknowledged(AlertTypes.LOW_URGENT, nowMs = nowMs + 60_000L)

        // Still low, never recovered, 30 minutes after the ack: the safety backstop fires.
        evaluate(mgDl = 52, atMs = nowMs + 60_000L + AlertFloor.FLOOR_COOLDOWN_MS)

        verify(exactly = 2) { alertNotificationManager.showAlertNotification(any(), any()) }
    }

    @Test
    fun `unacked boundary flapping stays inside the cooldown - recovery only re-arms acked types`() = runTest {
        evaluate(mgDl = 65) // low_warning fires, NOT acknowledged
        evaluate(mgDl = 75, atMs = nowMs + 15_000L) // hovers back in range
        evaluate(mgDl = 68, atMs = nowMs + 30_000L) // crosses again

        // The unacked notification is still up; re-alarming every boundary crossing of a
        // hovering glucose is the spam the dedup window exists to stop.
        verify(exactly = 1) { alertNotificationManager.showAlertNotification(any(), any()) }
    }

    @Test
    fun `ack of one type does not clear another type's cooldown`() = runTest {
        evaluate(mgDl = 54) // low_urgent fires
        floor.onFloorAlertAcknowledged(AlertTypes.HIGH_WARNING, nowMs = nowMs)
        evaluate(mgDl = 54, atMs = nowMs + 15_000L)

        verify(exactly = 1) { alertNotificationManager.showAlertNotification(any(), any()) }
    }

    // -- wall-clock rewind guard: a backward jump must never resurrect a stale reading ---------

    @Test
    fun `backward clock jump cannot resurrect a stale reading - the false-guarantee fix`() = runTest {
        // A sensor stuck in warmup keeps returning a 12-min-old value: correctly suppressed.
        val staleReading = CgmReading(
            glucoseMgDl = 54,
            trendArrow = CgmTrend.FLAT,
            timestamp = Instant.ofEpochMilli(nowMs - 12 * 60_000L),
        )
        floor.onCgmReading(staleReading, floor.classify(54), nowMs = nowMs)
        verify(exactly = 0) { alertNotificationManager.showAlertNotification(any(), any()) }

        // The wall clock jumps back ~7 minutes: the same reading now LOOKS 5 minutes old
        // (inside the FRESH window). The high-water mark from the first evaluation must
        // suppress it — firing here would be alerting on stale data.
        floor.onCgmReading(staleReading, floor.classify(54), nowMs = nowMs - 7 * 60_000L + 15_000L)
        verify(exactly = 0) { alertNotificationManager.showAlertNotification(any(), any()) }

        // Once the wall clock catches back up past the high-water mark, the reading honestly
        // classifies TOO_STALE again: still suppressed, by the ordinary freshness gate.
        floor.onCgmReading(staleReading, floor.classify(54), nowMs = nowMs + 15_000L)
        verify(exactly = 0) { alertNotificationManager.showAlertNotification(any(), any()) }
    }

    @Test
    fun `while rewound even an apparently fresh reading is suppressed - fail closed`() = runTest {
        // Establish the high-water mark with an in-range evaluation.
        evaluate(mgDl = 120, atMs = nowMs)

        // Clock rewinds 5 minutes; a reading timestamped just before the rewound "now" looks
        // 10s fresh, but no wall-clock-derived age is trustworthy until the clock catches up.
        val rewoundNow = nowMs - 5 * 60_000L
        val reading = CgmReading(
            glucoseMgDl = 54,
            trendArrow = CgmTrend.FLAT,
            timestamp = Instant.ofEpochMilli(rewoundNow - 10_000L),
        )
        floor.onCgmReading(reading, floor.classify(54), nowMs = rewoundNow)
        verify(exactly = 0) { alertNotificationManager.showAlertNotification(any(), any()) }
    }

    @Test
    fun `rewind within the skew tolerance is not treated as a jump`() = runTest {
        evaluate(mgDl = 120, atMs = nowMs)
        // 30s backward (NTP nudge, within ALERT_FLOOR_MAX_FUTURE_SKEW_MS): a genuinely fresh
        // low must still fire — over-suppressing on routine drift would silently disable the
        // floor, the same lethal failure inverted.
        evaluate(mgDl = 54, ageMs = 10_000L, atMs = nowMs - 30_000L)
        verify(exactly = 1) { alertNotificationManager.showAlertNotification(any(), any()) }
    }

    @Test
    fun `future-dated server alert seed is clamped - skew cannot stretch the silence window`() = runTest {
        // Phone clock behind the server: the persisted server alert timestamp is "in the future".
        // Unclamped, the suppression window would be 30 min + skew.
        coEvery {
            alertDao.getLatestUnacknowledgedTimestampForType(AlertTypes.LOW_URGENT, any())
        } returns nowMs + 10 * 60_000L

        evaluate(mgDl = 54)
        verify(exactly = 0) { alertNotificationManager.showAlertNotification(any(), any()) }

        // Exactly one full window after "now" (the clamped seed) the floor may fire again.
        coEvery { alertDao.getLatestUnacknowledgedTimestampForType(any(), any()) } returns null
        evaluate(mgDl = 54, atMs = nowMs + AlertFloor.FLOOR_COOLDOWN_MS)
        verify(exactly = 1) { alertNotificationManager.showAlertNotification(any(), any()) }
    }

    // -- isReadingAlertable: the shared data-trust bound the watch relay gates on (GLY-116) ----
    // Predicate-correctness only: a relay-gate revert does not fail these (the pure function
    // stays green with no call site) — the behavioral gate lives in PumpPollingOrchestratorTest
    // and the relay⟺floor agreement in AlertRelayFloorDivergenceTest.

    private fun reading(ageMs: Long, atMs: Long = nowMs) = CgmReading(
        glucoseMgDl = 54,
        trendArrow = CgmTrend.FLAT,
        timestamp = Instant.ofEpochMilli(atMs - ageMs),
    )

    @Test
    fun `isReadingAlertable boundary pair at the FRESH-STALE edge`() {
        // CGM policy: FRESH strictly below 6 min. Edge−1 alertable, edge not.
        assertTrue(floor.isReadingAlertable(reading(6 * 60_000L - 1), nowMs))
        assertFalse(floor.isReadingAlertable(reading(6 * 60_000L), nowMs))
    }

    @Test
    fun `isReadingAlertable rejects TOO_STALE outright`() {
        assertFalse(floor.isReadingAlertable(reading(15 * 60_000L), nowMs))
        assertFalse(floor.isReadingAlertable(reading(8 * 60 * 60_000L), nowMs))
    }

    @Test
    fun `isReadingAlertable boundary pair at the future-skew bound`() {
        // Small forward skew tolerated (pump clocks drift); beyond the bound is not trustable.
        assertTrue(floor.isReadingAlertable(reading(-60_000L), nowMs))
        assertFalse(floor.isReadingAlertable(reading(-60_001L), nowMs))
    }

    @Test
    fun `isReadingAlertable is false when thresholds never configured even for a fresh reading`() {
        every { alertThresholdStore.isConfigured() } returns false
        assertFalse(floor.isReadingAlertable(reading(0L), nowMs))
    }

    @Test
    fun `isReadingAlertable is false while the wall clock is rewound`() {
        floor.noteWallClock(nowMs)
        // Clock jumps back beyond the tolerance: even a reading that looks fresh against the
        // rewound "now" is untrustworthy (its apparent age is understated).
        val rewoundNow = nowMs - 5 * 60_000L
        assertFalse(floor.isReadingAlertable(reading(10_000L, atMs = rewoundNow), rewoundNow))
        // Clock catches back up: trust resumes.
        assertTrue(floor.isReadingAlertable(reading(10_000L), nowMs))
    }

    @Test
    fun `isReadingAlertable uses the compressed policy under the debug fast-staleness toggle`() {
        every { appSettingsStore.debugFastStaleness } returns true
        assertTrue(floor.isReadingAlertable(reading(19_999L), nowMs))
        assertFalse(floor.isReadingAlertable(reading(20_000L), nowMs))
    }

    @Test
    fun `pump clock drift degrades honestly - predicate suppresses and the surface says not watching`() {
        // AC-F: a pump clock running 20 min slow makes genuinely-new readings look TOO_STALE.
        // The relay/floor must suppress (indistinguishable from warmup-stale) AND the shared
        // status decision must land on NO_FRESH_READING — honest-degraded, never silent.
        val driftedAgeMs = 20 * 60_000L
        assertFalse(floor.isReadingAlertable(reading(driftedAgeMs), nowMs))
        val status = alertFloorStatus(
            networkStatus = NetworkStatus.BACKEND_UNREACHABLE,
            streamState = AlertStreamState.RECONNECTING,
            cgmAgeMs = driftedAgeMs,
            cgmThresholds = FreshnessPolicy.CGM,
            thresholdsConfigured = true,
            backendConfigured = false,
            canNotify = true,
            pumpConnected = true,
        )
        assertEquals(
            AlertFloorStatus.FloorNotWatching(FloorNotWatchingReason.NO_FRESH_READING),
            status,
        )
    }
}
