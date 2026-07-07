package com.glycemicgpt.weardevice.presentation

import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.glycemicgpt.weardevice.data.WatchDataRepository
import com.glycemicgpt.weardevice.data.WearDataContract
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * GLY-116 wrist honesty rendering (instrumented on a Wear OS emulator/device):
 * the green "All clear" is reserved for a current "watching" claim; a not-watching payload,
 * an aged-out status (dead phone), and a stale shown alert each render their honest state.
 * State is driven through [WatchDataRepository]'s StateFlows — the same seam the Data Layer
 * listener writes — so these cover the render half of the mirror; the wire half is covered by
 * the phone-side forwarder tests + the contract mirror pins.
 */
@RunWith(AndroidJUnit4::class)
class AlertsHonestyUiTest {

    @get:Rule
    val composeRule = createAndroidComposeRule<AlertsActivity>()

    private val timeoutMs = 6 * 60_000L

    @Before
    fun resetState() {
        // WatchDataRepository is process-global and the instrumentation runs every test in one
        // process: without both resets, one test's alert/status leaks into the next's render.
        WatchDataRepository.clearAlert()
        WatchDataRepository.clearMonitoringStatus()
    }

    private fun pushStatus(state: String, reason: String? = null, ageMs: Long = 0L) {
        WatchDataRepository.updateMonitoringStatus(
            state = state,
            reason = reason,
            timeoutMs = timeoutMs,
            receivedAtMs = System.currentTimeMillis() - ageMs,
        )
    }

    @Test
    fun watchingStatusRendersAllClear() {
        pushStatus(WearDataContract.MONITORING_STATE_SERVER_ACTIVE)
        composeRule.waitForIdle()
        composeRule.onNodeWithTag("all_clear").assertExists()
        composeRule.onNodeWithText("No Active Alert").assertExists()
    }

    @Test
    fun notWatchingStatusRendersDegradedBannerNotAllClear() {
        pushStatus(
            WearDataContract.MONITORING_STATE_NOT_WATCHING,
            reason = WearDataContract.MONITORING_REASON_PUMP_DISCONNECTED,
        )
        composeRule.waitForIdle()
        composeRule.onNodeWithTag("not_watching").assertExists()
        composeRule.onNodeWithText("Monitoring degraded — pump is disconnected.").assertExists()
        composeRule
            .onNodeWithText("Caregiver & AI alerts are paused — they need the backend.")
            .assertExists()
        composeRule.onNodeWithTag("all_clear").assertDoesNotExist()
    }

    @Test
    fun agedOutWatchingStatusDecaysToNoRecentData() {
        // The last push said "watching", but it is older than its own advertised timeout —
        // the dead-phone case. A pure mirror would freeze "All clear"; the local decay must
        // refuse to claim coverage.
        pushStatus(WearDataContract.MONITORING_STATE_SERVER_ACTIVE, ageMs = timeoutMs + 1_000L)
        composeRule.waitForIdle()
        composeRule.onNodeWithTag("no_recent_status").assertExists()
        composeRule.onNodeWithTag("all_clear").assertDoesNotExist()
    }

    @Test
    fun neverReceivedStatusFailsClosed() {
        composeRule.waitForIdle()
        composeRule.onNodeWithTag("no_recent_status").assertExists()
        composeRule.onNodeWithTag("all_clear").assertDoesNotExist()
    }

    @Test
    fun staleAlertRendersAsOfAgeAndNeverAllClear() {
        pushStatus(WearDataContract.MONITORING_STATE_SERVER_ACTIVE)
        WatchDataRepository.updateAlert(
            type = "low",
            bgValue = 62,
            timestampMs = System.currentTimeMillis() - 16 * 60_000L,
            message = "LOW 62 mg/dL",
        )
        composeRule.waitForIdle()
        // Substring match: the exact minute count depends on when the screen sampled its
        // clock relative to the push; the honesty claim is the "data stale" qualifier.
        composeRule.onNodeWithTag("alert_age")
            .assertTextContains("data stale", substring = true)
        composeRule.onNodeWithTag("all_clear").assertDoesNotExist()
        // Covered: no coverage warning under the stale body.
        composeRule.onNodeWithTag("stale_alert_not_watching").assertDoesNotExist()
    }

    @Test
    fun staleAlertWithDeadPhoneShowsNotWatchingLine() {
        // A lingering stale alert occupies the screen the coverage banner would use — the
        // compact line is the only "not watching" cue left on this surface.
        WatchDataRepository.updateAlert(
            type = "low",
            bgValue = 62,
            timestampMs = System.currentTimeMillis() - 16 * 60_000L,
            message = "LOW 62 mg/dL",
        )
        composeRule.waitForIdle()
        composeRule.onNodeWithTag("stale_alert_not_watching").assertExists()
        composeRule.onNodeWithTag("all_clear").assertDoesNotExist()
    }

    @Test
    fun freshAlertRendersActiveWithAge() {
        WatchDataRepository.updateAlert(
            type = "urgent_low",
            bgValue = 50,
            timestampMs = System.currentTimeMillis(),
            message = "URGENT LOW 50 mg/dL",
        )
        composeRule.waitForIdle()
        composeRule.onNodeWithText("Urgent Low").assertExists()
        composeRule.onNodeWithTag("alert_age").assertExists()
        composeRule.onNodeWithText("Dismiss").assertExists()
    }
}
