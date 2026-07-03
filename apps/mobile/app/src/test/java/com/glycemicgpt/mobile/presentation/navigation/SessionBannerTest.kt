package com.glycemicgpt.mobile.presentation.navigation

import com.glycemicgpt.mobile.data.auth.AuthState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Pins the session-banner policy: a banner only for RESOLVED session-less
 * states. The pre-validation [AuthState.Initializing] default must render
 * nothing -- keying the banner off it would flash "not signed in" at cold
 * start for every authenticated user before startup validation resolves
 * the real state.
 */
class SessionBannerTest {

    @Test
    fun `initializing shows no banner`() {
        assertNull(sessionBannerMessage(AuthState.Initializing))
    }

    @Test
    fun `refreshing shows no banner`() {
        assertNull(sessionBannerMessage(AuthState.Refreshing))
    }

    @Test
    fun `authenticated shows no banner`() {
        assertNull(sessionBannerMessage(AuthState.Authenticated))
    }

    @Test
    fun `expired shows its message`() {
        assertEquals(
            "Session expired, please sign in again",
            sessionBannerMessage(AuthState.Expired()),
        )
    }

    @Test
    fun `unauthenticated shows the sign-in prompt`() {
        assertEquals(
            "Not signed in, tap to sign in",
            sessionBannerMessage(AuthState.Unauthenticated),
        )
    }
}
