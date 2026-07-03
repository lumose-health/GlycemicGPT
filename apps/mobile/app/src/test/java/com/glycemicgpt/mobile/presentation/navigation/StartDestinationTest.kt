package com.glycemicgpt.mobile.presentation.navigation

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Pins the GLY-133 start-destination policy: routing is keyed on onboarding
 * completion ALONE. The predicate deliberately takes no session/token input --
 * the previous `onboardingComplete && hasActiveSession()` form sent a device
 * whose refresh token expired offline to Onboarding, locking its intact local
 * pump/CGM reads behind a login that cannot succeed offline. If a session
 * parameter ever reappears here, that lockout is back.
 */
class StartDestinationTest {

    @Test
    fun `onboarding complete starts at Home`() {
        assertEquals(Screen.Home.route, startDestinationRoute(onboardingComplete = true))
    }

    @Test
    fun `first-ever user starts at Onboarding`() {
        assertEquals(Screen.Onboarding.route, startDestinationRoute(onboardingComplete = false))
    }
}
