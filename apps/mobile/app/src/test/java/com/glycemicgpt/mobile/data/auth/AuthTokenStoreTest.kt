package com.glycemicgpt.mobile.data.auth

import com.glycemicgpt.mobile.data.local.AuthTokenStore
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AuthTokenStoreTest {

    @Test
    fun `extractJwtExpiration parses valid JWT`() {
        // JWT payload: {"sub":"1","email":"test@test.com","exp":1893456000,"type":"refresh"}
        // exp = 1893456000 (Jan 1, 2030 UTC)
        val payloadJson = """{"sub":"1","email":"test@test.com","exp":1893456000,"type":"refresh"}"""
        val payloadBase64 = java.util.Base64.getUrlEncoder().withoutPadding()
            .encodeToString(payloadJson.toByteArray())

        val jwt = "eyJhbGciOiJIUzI1NiJ9.$payloadBase64.signature"
        val result = AuthTokenStore.extractJwtExpiration(jwt)

        assertEquals(1893456000L * 1000L, result)
    }

    @Test
    fun `extractJwtExpiration returns 0 for malformed JWT`() {
        assertEquals(0L, AuthTokenStore.extractJwtExpiration("not-a-jwt"))
        assertEquals(0L, AuthTokenStore.extractJwtExpiration(""))
        assertEquals(0L, AuthTokenStore.extractJwtExpiration("one.two"))
    }

    @Test
    fun `extractJwtExpiration returns 0 when exp is missing`() {
        val payloadJson = """{"sub":"1","email":"test@test.com","type":"refresh"}"""
        val payloadBase64 = java.util.Base64.getUrlEncoder().withoutPadding()
            .encodeToString(payloadJson.toByteArray())

        val jwt = "header.$payloadBase64.signature"
        val result = AuthTokenStore.extractJwtExpiration(jwt)

        assertEquals(0L, result)
    }

    @Test
    fun `PROACTIVE_REFRESH_WINDOW_MS is 5 minutes`() {
        assertEquals(5 * 60 * 1000L, AuthTokenStore.PROACTIVE_REFRESH_WINDOW_MS)
    }

    @Test
    fun `isBackendConfigured is true only for a non-blank base URL`() {
        assertFalse(AuthTokenStore.isBackendConfigured(null))
        assertFalse(AuthTokenStore.isBackendConfigured(""))
        assertFalse(AuthTokenStore.isBackendConfigured("   "))
        assertTrue(AuthTokenStore.isBackendConfigured("https://server.example.com"))
    }
}
