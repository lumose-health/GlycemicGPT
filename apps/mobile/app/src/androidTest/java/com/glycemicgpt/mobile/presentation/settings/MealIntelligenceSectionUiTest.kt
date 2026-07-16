package com.glycemicgpt.mobile.presentation.settings

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.glycemicgpt.mobile.presentation.theme.GlycemicGptTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Meal intelligence is backend-only, so the Settings section gates itself on the mode signal
 * (`backendConfigured`), not the session (GLY-110): hidden in BLE-only mode even while a stale
 * session flag is set, shown whenever a backend is configured even across a session lapse.
 */
@RunWith(AndroidJUnit4::class)
class MealIntelligenceSectionUiTest {

    @get:Rule
    val compose = createComposeRule()

    private fun setContent(state: SettingsUiState) {
        compose.setContent {
            GlycemicGptTheme {
                MealIntelligenceSection(
                    state = state,
                    onToggle = {},
                    onNavigateToMealLog = {},
                )
            }
        }
    }

    @Test
    fun bleOnly_sectionHidden_evenWhenSessionFlagIsSet() {
        // isLoggedIn = true pins the predicate itself: a regression back to the session flag
        // would render the section here and fail this test.
        setContent(SettingsUiState(backendConfigured = false, isLoggedIn = true))

        compose.onNodeWithTag("meal_intelligence_toggle").assertDoesNotExist()
    }

    @Test
    fun backendConfigured_sectionShown_evenAcrossSessionLapse() {
        setContent(SettingsUiState(backendConfigured = true, isLoggedIn = false))

        compose.onNodeWithTag("meal_intelligence_toggle").assertIsDisplayed()
    }
}
