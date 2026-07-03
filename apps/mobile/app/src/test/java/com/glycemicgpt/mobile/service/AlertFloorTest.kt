package com.glycemicgpt.mobile.service

import com.glycemicgpt.mobile.data.local.AlertThresholdStore
import com.glycemicgpt.mobile.data.local.AppSettingsStore
import com.glycemicgpt.mobile.data.local.dao.AlertDao
import com.glycemicgpt.mobile.data.local.entity.AlertEntity
import com.glycemicgpt.mobile.data.network.NetworkMonitor
import com.glycemicgpt.mobile.domain.alerting.AlertTypes
import com.glycemicgpt.mobile.data.network.NetworkStatus
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
            every { isSynced() } returns true
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

    // -- AC3: never fire off unsynced (default) thresholds -------------------------------------

    @Test
    fun `never-synced thresholds - floor never fires`() = runTest {
        every { alertThresholdStore.isSynced() } returns false

        evaluate(mgDl = 54)
        verify(exactly = 0) { alertNotificationManager.showAlertNotification(any(), any()) }
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

    // -- ack-gated dedup: an ack must never silence a NEW distinct emergency -------------------

    @Test
    fun `Got It ack clears the cooldown - a new crossing minutes later alarms again`() = runTest {
        evaluate(mgDl = 54)
        verify(exactly = 1) { alertNotificationManager.showAlertNotification(any(), any()) }

        // User acknowledges (aware, treats); glucose recovers, then crashes again 20 minutes
        // later — well inside the raw 30-min window. The server would re-alert (its dedup only
        // counts unacknowledged alerts); the floor must too.
        floor.onFloorAlertAcknowledged(AlertTypes.LOW_URGENT)
        evaluate(mgDl = 50, atMs = nowMs + 20 * 60_000L)

        verify(exactly = 2) { alertNotificationManager.showAlertNotification(any(), any()) }
    }

    @Test
    fun `ack of one type does not clear another type's cooldown`() = runTest {
        evaluate(mgDl = 54) // low_urgent fires
        floor.onFloorAlertAcknowledged(AlertTypes.HIGH_WARNING)
        evaluate(mgDl = 54, atMs = nowMs + 15_000L)

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
}
