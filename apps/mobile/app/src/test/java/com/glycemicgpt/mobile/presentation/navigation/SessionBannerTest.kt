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
 *
 * Unauthenticated is additionally mode-aware (GLY-146): a BLE-only user is
 * permanently Unauthenticated by design, so with no backend configured the
 * sign-in prompt must not render. Expired stays unconditional -- a lapsed
 * full-stack session still needs the nudge.
 */
class SessionBannerTest {

    @Test
    fun `initializing shows no banner`() {
        assertNull(sessionBannerMessage(AuthState.Initializing, backendConfigured = true))
        assertNull(sessionBannerMessage(AuthState.Initializing, backendConfigured = false))
    }

    @Test
    fun `refreshing shows no banner`() {
        assertNull(sessionBannerMessage(AuthState.Refreshing, backendConfigured = true))
        assertNull(sessionBannerMessage(AuthState.Refreshing, backendConfigured = false))
    }

    @Test
    fun `authenticated shows no banner`() {
        assertNull(sessionBannerMessage(AuthState.Authenticated, backendConfigured = true))
        assertNull(sessionBannerMessage(AuthState.Authenticated, backendConfigured = false))
    }

    @Test
    fun `expired shows its message regardless of mode`() {
        assertEquals(
            "Session expired, please sign in again",
            sessionBannerMessage(AuthState.Expired(), backendConfigured = true),
        )
        assertEquals(
            "Session expired, please sign in again",
            sessionBannerMessage(AuthState.Expired(), backendConfigured = false),
        )
    }

    @Test
    fun `unauthenticated with a backend shows the sign-in prompt`() {
        assertEquals(
            "Not signed in, tap to sign in",
            sessionBannerMessage(AuthState.Unauthenticated, backendConfigured = true),
        )
    }

    @Test
    fun `unauthenticated without a backend shows no banner`() {
        assertNull(sessionBannerMessage(AuthState.Unauthenticated, backendConfigured = false))
    }
}
