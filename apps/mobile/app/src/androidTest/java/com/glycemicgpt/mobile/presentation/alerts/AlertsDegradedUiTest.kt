package com.glycemicgpt.mobile.presentation.alerts

import androidx.compose.material3.SnackbarHostState
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.glycemicgpt.mobile.data.local.entity.AlertEntity
import com.glycemicgpt.mobile.domain.alerting.AlertFloorStatus
import com.glycemicgpt.mobile.domain.alerting.FloorNotWatchingReason
import com.glycemicgpt.mobile.domain.model.GlucoseUnit
import com.glycemicgpt.mobile.presentation.theme.GlycemicGptTheme
import com.glycemicgpt.mobile.testutil.indeterminateSpinner
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * On-device rendering of the alerts surface in the degraded (backend unreachable / SSE down)
 * state: the honest two-state banner (GLY-115) shows, cached alerts stay visible, and no
 * indeterminate spinner remains (the AC1 no-hang assertion at the composable level).
 *
 * 57.9 note: the pre-floor contract ("never imply a device floor exists") is deliberately
 * flipped — a floor now exists, so the banner must claim it EXACTLY when it can vouch
 * (watching, with the threshold-only disclaimer) and disclaim it otherwise (NOT watching).
 */
@RunWith(AndroidJUnit4::class)
class AlertsDegradedUiTest {

    @get:Rule
    val compose = createComposeRule()

    private fun cachedAlert(id: String = "alert-1") = AlertEntity(
        serverId = id,
        alertType = "high_warning",
        severity = "warning",
        message = "High glucose warning",
        currentValue = 250.0,
        timestampMs = System.currentTimeMillis(),
        acknowledged = false,
    )

    private fun setContent(
        status: AlertFloorStatus,
        alerts: List<AlertEntity>,
        isLoading: Boolean = false,
    ) {
        compose.setContent {
            GlycemicGptTheme {
                AlertsContent(
                    uiState = AlertsUiState(isLoading = isLoading),
                    alerts = alerts,
                    glucoseUnit = GlucoseUnit.MGDL,
                    alertFloorStatus = status,
                    snackbarHostState = SnackbarHostState(),
                    onRefresh = {},
                    onAcknowledge = {},
                )
            }
        }
    }

    private val notWatching =
        AlertFloorStatus.FloorNotWatching(FloorNotWatchingReason.NO_FRESH_READING)

    @Test
    fun degraded_showsBanner_andKeepsCachedAlerts_withNoSpinner() {
        setContent(status = notWatching, alerts = listOf(cachedAlert()))

        compose.onNodeWithTag(TAG_ALERTING_DEGRADED_BANNER).assertIsDisplayed()
        compose.onNodeWithText("High glucose warning").assertIsDisplayed()
        compose.onAllNodes(indeterminateSpinner).assertCountEquals(0)
    }

    @Test
    fun floorWatching_bannerClaimsCoverage_withThresholdOnlyDisclaimer() {
        setContent(status = AlertFloorStatus.FloorWatching, alerts = emptyList())

        compose.onNodeWithText("Server alerts paused", substring = true).assertIsDisplayed()
        compose.onNodeWithText("this phone is watching", substring = true).assertIsDisplayed()
        compose.onNodeWithText("Threshold-only, no prediction", substring = true)
            .assertIsDisplayed()
    }

    @Test
    fun floorNotWatching_bannerDisclaimsCoverage_neverClaimsWatching() {
        setContent(status = notWatching, alerts = emptyList())

        // The lethal trap pinned on-device: when the floor cannot vouch, the surface must say
        // NOT watching and never claim coverage.
        compose.onNodeWithText("NOT watching", substring = true).assertIsDisplayed()
        compose.onNodeWithText("is watching your", substring = true).assertDoesNotExist()
    }

    @Test
    fun goldenPath_rendersNoBanner() {
        setContent(status = AlertFloorStatus.ServerActive, alerts = listOf(cachedAlert()))

        compose.onAllNodesWithTag(TAG_ALERTING_DEGRADED_BANNER).assertCountEquals(0)
        compose.onNodeWithText("High glucose warning").assertIsDisplayed()
    }

    @Test
    fun degraded_withNoCachedAlerts_showsEmptyState_notBlank() {
        setContent(status = notWatching, alerts = emptyList())

        compose.onNodeWithTag(TAG_ALERTING_DEGRADED_BANNER).assertIsDisplayed()
        compose.onNodeWithText("No alerts").assertIsDisplayed()
        compose.onAllNodes(indeterminateSpinner).assertCountEquals(0)
    }
}
