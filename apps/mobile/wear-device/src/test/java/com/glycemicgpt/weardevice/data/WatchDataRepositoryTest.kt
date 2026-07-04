package com.glycemicgpt.weardevice.data

import com.glycemicgpt.weardevice.util.GlucoseUnit
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class WatchDataRepositoryTest {

    @Before
    fun resetState() {
        WatchDataRepository.updateIoB(iob = 0f, timestampMs = 0L)
        WatchDataRepository.updateCgm(
            mgDl = 0, trend = "UNKNOWN", timestampMs = 0L,
            low = 70, high = 180, urgentLow = 55, urgentHigh = 250,
        )
        WatchDataRepository.updateAlert(type = "none", bgValue = 0, timestampMs = 0L, message = "")
        WatchDataRepository.updateWatchFaceConfig(
            showIoB = true, showGraph = true, showAlert = true,
            showSeconds = false, graphRangeHours = 3, theme = "dark",
        )
        WatchDataRepository.updateGlucoseUnit(GlucoseUnit.MGDL)
        WatchDataRepository.clearChat()
        WatchDataRepository.clearMonitoringStatus()
    }

    @Test
    fun `updateIoB sets correct values`() {
        WatchDataRepository.updateIoB(iob = 2.45f, timestampMs = 1000L)

        val state = WatchDataRepository.iob.value
        assertEquals(2.45f, state!!.iob, 0.001f)
        assertEquals(1000L, state.timestampMs)
    }

    @Test
    fun `updateIoB overwrites previous values`() {
        WatchDataRepository.updateIoB(iob = 1.0f, timestampMs = 100L)
        WatchDataRepository.updateIoB(iob = 3.5f, timestampMs = 200L)

        val state = WatchDataRepository.iob.value
        assertEquals(3.5f, state!!.iob, 0.001f)
        assertEquals(200L, state.timestampMs)
    }

    @Test
    fun `updateCgm sets correct values`() {
        WatchDataRepository.updateCgm(
            mgDl = 120,
            trend = "FLAT",
            timestampMs = 5000L,
            low = 70,
            high = 180,
            urgentLow = 55,
            urgentHigh = 250,
        )

        val state = WatchDataRepository.cgm.value
        assertEquals(120, state!!.mgDl)
        assertEquals("FLAT", state.trend)
        assertEquals(5000L, state.timestampMs)
        assertEquals(70, state.low)
        assertEquals(180, state.high)
        assertEquals(55, state.urgentLow)
        assertEquals(250, state.urgentHigh)
    }

    @Test
    fun `updateCgm overwrites previous values`() {
        WatchDataRepository.updateCgm(
            mgDl = 80, trend = "SINGLE_DOWN", timestampMs = 100L,
            low = 70, high = 180, urgentLow = 55, urgentHigh = 250,
        )
        WatchDataRepository.updateCgm(
            mgDl = 200, trend = "SINGLE_UP", timestampMs = 200L,
            low = 70, high = 180, urgentLow = 55, urgentHigh = 250,
        )

        val state = WatchDataRepository.cgm.value
        assertEquals(200, state!!.mgDl)
        assertEquals("SINGLE_UP", state.trend)
        assertEquals(200L, state.timestampMs)
    }

    @Test
    fun `alert initial state is null`() {
        WatchDataRepository.updateAlert(type = "none", bgValue = 0, timestampMs = 0L, message = "")
        assertNull(WatchDataRepository.alert.value)
    }

    @Test
    fun `updateAlert sets correct values`() {
        WatchDataRepository.updateAlert(
            type = "urgent_low",
            bgValue = 45,
            timestampMs = 3000L,
            message = "URGENT LOW 45 mg/dL",
        )

        val state = WatchDataRepository.alert.value
        assertEquals("urgent_low", state!!.type)
        assertEquals(45, state.bgValue)
        assertEquals(3000L, state.timestampMs)
        assertEquals("URGENT LOW 45 mg/dL", state.message)
    }

    @Test
    fun `updateAlert with none type clears alert`() {
        WatchDataRepository.updateAlert(
            type = "high",
            bgValue = 200,
            timestampMs = 1000L,
            message = "HIGH 200 mg/dL",
        )
        assertNotNull(WatchDataRepository.alert.value)

        WatchDataRepository.updateAlert(type = "none", bgValue = 0, timestampMs = 2000L, message = "")
        assertNull(WatchDataRepository.alert.value)
    }

    @Test
    fun `updateAlert overwrites previous alert`() {
        WatchDataRepository.updateAlert(
            type = "low", bgValue = 65, timestampMs = 100L, message = "LOW 65 mg/dL",
        )
        WatchDataRepository.updateAlert(
            type = "urgent_low", bgValue = 50, timestampMs = 200L, message = "URGENT LOW 50 mg/dL",
        )

        val state = WatchDataRepository.alert.value
        assertEquals("urgent_low", state!!.type)
        assertEquals(50, state.bgValue)
    }

    @Test
    fun `resetState sets expected watchFaceConfig`() {
        val config = WatchDataRepository.watchFaceConfig.value
        assertTrue(config.showIoB)
        assertTrue(config.showGraph)
        assertTrue(config.showAlert)
        assertFalse(config.showSeconds)
        assertEquals(3, config.graphRangeHours)
        assertEquals("dark", config.theme)
    }

    @Test
    fun `updateWatchFaceConfig sets correct values`() {
        WatchDataRepository.updateWatchFaceConfig(
            showIoB = false,
            showGraph = false,
            showAlert = false,
            showSeconds = true,
            graphRangeHours = 6,
            theme = "clinical_blue",
        )

        val config = WatchDataRepository.watchFaceConfig.value
        assertFalse(config.showIoB)
        assertFalse(config.showGraph)
        assertFalse(config.showAlert)
        assertTrue(config.showSeconds)
        assertEquals(6, config.graphRangeHours)
        assertEquals("clinical_blue", config.theme)
    }

    @Test
    fun `updateWatchFaceConfig overwrites previous config`() {
        WatchDataRepository.updateWatchFaceConfig(
            showIoB = false, showGraph = false, showAlert = false,
            showSeconds = true, graphRangeHours = 1, theme = "high_contrast",
        )
        WatchDataRepository.updateWatchFaceConfig(
            showIoB = true, showGraph = true, showAlert = true,
            showSeconds = false, graphRangeHours = 6, theme = "dark",
        )

        val config = WatchDataRepository.watchFaceConfig.value
        assertTrue(config.showIoB)
        assertTrue(config.showGraph)
        assertEquals(6, config.graphRangeHours)
        assertEquals("dark", config.theme)
    }

    @Test
    fun `updateWatchFaceConfig clamps invalid graphRangeHours to default`() {
        WatchDataRepository.updateWatchFaceConfig(
            showIoB = true, showGraph = true, showAlert = true,
            showSeconds = false, graphRangeHours = 99, theme = "dark",
        )
        assertEquals(3, WatchDataRepository.watchFaceConfig.value.graphRangeHours)
    }

    // --- clearAlert tests ---

    // --- Glucose unit tests ---

    @Test
    fun `glucoseUnit is MGDL after reset`() {
        assertEquals(GlucoseUnit.MGDL, WatchDataRepository.glucoseUnit.value)
    }

    @Test
    fun `updateGlucoseUnit updates the glucose unit flow`() {
        WatchDataRepository.updateGlucoseUnit(GlucoseUnit.MMOL)
        assertEquals(GlucoseUnit.MMOL, WatchDataRepository.glucoseUnit.value)

        WatchDataRepository.updateGlucoseUnit(GlucoseUnit.MGDL)
        assertEquals(GlucoseUnit.MGDL, WatchDataRepository.glucoseUnit.value)
    }

    @Test
    fun `clearAlert clears active alert`() {
        WatchDataRepository.updateAlert(
            type = "high", bgValue = 200, timestampMs = 1000L, message = "HIGH",
        )
        assertNotNull(WatchDataRepository.alert.value)

        WatchDataRepository.clearAlert()
        assertNull(WatchDataRepository.alert.value)
    }

    // --- Chat state tests ---

    @Test
    fun `setChatResponse transitions to Success state`() {
        WatchDataRepository.setChatLoading()
        WatchDataRepository.setChatResponse("Your BG is stable", "Not medical advice")

        val state = WatchDataRepository.chatState.value
        assertTrue(state is WatchDataRepository.ChatState.Success)
        val success = state as WatchDataRepository.ChatState.Success
        assertEquals("Your BG is stable", success.response)
        assertEquals("Not medical advice", success.disclaimer)
    }

    @Test
    fun `setChatLoading transitions to Loading state`() {
        WatchDataRepository.setChatResponse("old response", "disclaimer")

        WatchDataRepository.setChatLoading()
        val state = WatchDataRepository.chatState.value
        assertTrue(state is WatchDataRepository.ChatState.Loading)
    }

    @Test
    fun `setChatError transitions to Error state`() {
        WatchDataRepository.setChatLoading()

        WatchDataRepository.setChatError("Phone not connected")
        val state = WatchDataRepository.chatState.value
        assertTrue(state is WatchDataRepository.ChatState.Error)
        assertEquals("Phone not connected", (state as WatchDataRepository.ChatState.Error).message)
    }

    @Test
    fun `clearChat resets to Idle state`() {
        WatchDataRepository.setChatResponse("response", "disc")
        WatchDataRepository.clearChat()

        val state = WatchDataRepository.chatState.value
        assertTrue(state is WatchDataRepository.ChatState.Idle)
    }

    @Test
    fun `updateWatchFaceConfig falls back to dark for unknown theme`() {
        WatchDataRepository.updateWatchFaceConfig(
            showIoB = true, showGraph = true, showAlert = true,
            showSeconds = false, graphRangeHours = 3, theme = "neon_green",
        )
        assertEquals("dark", WatchDataRepository.watchFaceConfig.value.theme)
    }

    // -- GLY-116 axis (a): mirrored monitoring status + watch-local decay ---------------------

    private val nowMs = 1_750_000_000_000L
    private val timeoutMs = 6 * 60_000L

    private fun status(
        state: String = WearDataContract.MONITORING_STATE_SERVER_ACTIVE,
        reason: String? = null,
        receivedAtMs: Long = nowMs,
    ) = WatchDataRepository.MonitoringStatusState(state, reason, timeoutMs, receivedAtMs)

    @Test
    fun `updateMonitoringStatus publishes the mirrored state`() {
        WatchDataRepository.updateMonitoringStatus(
            state = WearDataContract.MONITORING_STATE_NOT_WATCHING,
            reason = WearDataContract.MONITORING_REASON_PUMP_DISCONNECTED,
            timeoutMs = timeoutMs,
            receivedAtMs = nowMs,
        )
        val state = WatchDataRepository.monitoringStatus.value
        assertEquals(WearDataContract.MONITORING_STATE_NOT_WATCHING, state!!.state)
        assertEquals(WearDataContract.MONITORING_REASON_PUMP_DISCONNECTED, state.reason)
    }

    @Test
    fun `coverage is fail-closed with no status ever received`() {
        assertEquals(
            WatchDataRepository.WristCoverage.NoRecentStatus,
            WatchDataRepository.coverageFrom(null, nowMs),
        )
    }

    @Test
    fun `current watching states claim coverage`() {
        assertEquals(
            WatchDataRepository.WristCoverage.Watching,
            WatchDataRepository.coverageFrom(status(), nowMs),
        )
        assertEquals(
            WatchDataRepository.WristCoverage.Watching,
            WatchDataRepository.coverageFrom(
                status(state = WearDataContract.MONITORING_STATE_FLOOR_WATCHING),
                nowMs,
            ),
        )
    }

    @Test
    fun `not-watching state carries its reason through`() {
        assertEquals(
            WatchDataRepository.WristCoverage.NotWatching(
                WearDataContract.MONITORING_REASON_NO_FRESH_READING,
            ),
            WatchDataRepository.coverageFrom(
                status(
                    state = WearDataContract.MONITORING_STATE_NOT_WATCHING,
                    reason = WearDataContract.MONITORING_REASON_NO_FRESH_READING,
                ),
                nowMs,
            ),
        )
    }

    @Test
    fun `stale watching claim decays at the timeout boundary - dead phone cannot look covered`() {
        // Boundary pair: one ms inside the window still claims, at the window it decays.
        assertEquals(
            WatchDataRepository.WristCoverage.Watching,
            WatchDataRepository.coverageFrom(
                status(receivedAtMs = nowMs - (timeoutMs - 1)),
                nowMs,
            ),
        )
        assertEquals(
            WatchDataRepository.WristCoverage.NoRecentStatus,
            WatchDataRepository.coverageFrom(
                status(receivedAtMs = nowMs - timeoutMs),
                nowMs,
            ),
        )
    }

    @Test
    fun `small future-dating is tolerated - heartbeats between surface ticks must not flap`() {
        // Surfaces sample "now" on their own cadence, so a status received between ticks reads
        // slightly future-dated. That is routine, not a clock jump.
        assertEquals(
            WatchDataRepository.WristCoverage.Watching,
            WatchDataRepository.coverageFrom(status(receivedAtMs = nowMs + 15_000L), nowMs),
        )
    }

    @Test
    fun `a status from beyond the skew tolerance is not trusted - boundary pair`() {
        // Backward watch-clock jump makes the last status look future-dated / younger; beyond
        // the tolerance the decay clock is no longer meaningful, so the claim fails closed.
        assertEquals(
            WatchDataRepository.WristCoverage.Watching,
            WatchDataRepository.coverageFrom(status(receivedAtMs = nowMs + 60_000L), nowMs),
        )
        assertEquals(
            WatchDataRepository.WristCoverage.NoRecentStatus,
            WatchDataRepository.coverageFrom(status(receivedAtMs = nowMs + 60_001L), nowMs),
        )
    }

    @Test
    fun `clearMonitoringStatus fails closed`() {
        WatchDataRepository.updateMonitoringStatus(
            state = WearDataContract.MONITORING_STATE_SERVER_ACTIVE,
            reason = null,
            timeoutMs = timeoutMs,
            receivedAtMs = nowMs,
        )
        WatchDataRepository.clearMonitoringStatus()
        assertNull(WatchDataRepository.monitoringStatus.value)
    }

    @Test
    fun `unknown state strings fail closed`() {
        assertEquals(
            WatchDataRepository.WristCoverage.NoRecentStatus,
            WatchDataRepository.coverageFrom(status(state = "totally_new_state"), nowMs),
        )
    }
}
