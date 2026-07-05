package com.glycemicgpt.mobile.presentation.alerts

import com.glycemicgpt.mobile.data.network.NetworkStatus
import com.glycemicgpt.mobile.domain.alerting.AlertFloorStatus
import com.glycemicgpt.mobile.domain.alerting.FloorNotWatchingReason
import com.glycemicgpt.mobile.domain.alerting.alertFloorStatus
import com.glycemicgpt.mobile.domain.alerting.isAlertingDegraded
import com.glycemicgpt.mobile.domain.freshness.FreshnessPolicy
import com.glycemicgpt.mobile.service.AlertStreamState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The banner-visibility rule (AC4): the ONLY non-degraded combination is backend reachable + SSE
 * stream connected. Every other combination means no new server alerts arrive, so the honest
 * banner must show.
 */
class AlertingDegradedTest {

    @Test
    fun `reachable and connected is the only golden combination`() {
        assertFalse(isAlertingDegraded(NetworkStatus.REACHABLE, AlertStreamState.CONNECTED))
    }

    @Test
    fun `stream not connected is degraded even while backend is reachable`() {
        assertTrue(isAlertingDegraded(NetworkStatus.REACHABLE, AlertStreamState.DISCONNECTED))
        assertTrue(isAlertingDegraded(NetworkStatus.REACHABLE, AlertStreamState.RECONNECTING))
    }

    @Test
    fun `backend unreachable is degraded even while the stream still reports connected`() {
        // The SSE read timeout is minutes long; NetworkMonitor notices an outage first. The banner
        // must not wait for the stream to time out.
        assertTrue(isAlertingDegraded(NetworkStatus.BACKEND_UNREACHABLE, AlertStreamState.CONNECTED))
    }

    @Test
    fun `device offline is always degraded`() {
        for (stream in AlertStreamState.entries) {
            assertTrue(isAlertingDegraded(NetworkStatus.OFFLINE, stream))
        }
    }

    // -- alertFloorStatus (GLY-115 AC7): the two-state honest claim ----------------------------

    private fun status(
        network: NetworkStatus = NetworkStatus.BACKEND_UNREACHABLE,
        stream: AlertStreamState = AlertStreamState.RECONNECTING,
        cgmAgeMs: Long? = 0L,
        thresholdsConfigured: Boolean = true,
        backendConfigured: Boolean = true,
        canNotify: Boolean = true,
        pumpConnected: Boolean = true,
    ) = alertFloorStatus(
        network, stream, cgmAgeMs, FreshnessPolicy.CGM,
        thresholdsConfigured, backendConfigured, canNotify, pumpConnected,
    )

    private fun reasonOf(status: AlertFloorStatus): FloorNotWatchingReason =
        (status as AlertFloorStatus.FloorNotWatching).reason

    @Test
    fun `healthy server wins regardless of floor inputs`() {
        assertEquals(
            AlertFloorStatus.ServerActive,
            status(
                network = NetworkStatus.REACHABLE,
                stream = AlertStreamState.CONNECTED,
                cgmAgeMs = null,
                thresholdsConfigured = false,
                canNotify = false,
                pumpConnected = false,
            ),
        )
    }

    @Test
    fun `degraded with fresh reading, synced thresholds and a live pump claims watching`() {
        assertEquals(AlertFloorStatus.FloorWatching, status(cgmAgeMs = 30_000L))
    }

    @Test
    fun `degraded with a stale reading claims NOT watching - the lethal trap pinned`() {
        // Exactly the claim GLY-115 exists to keep honest: STALE and TOO_STALE readings mean
        // the floor cannot fire, so the surface must never say "watching".
        assertEquals(
            FloorNotWatchingReason.NO_FRESH_READING,
            reasonOf(status(cgmAgeMs = 6 * 60_000L)),
        )
        assertEquals(
            FloorNotWatchingReason.NO_FRESH_READING,
            reasonOf(status(cgmAgeMs = 20 * 60_000L)),
        )
    }

    @Test
    fun `degraded with no reading at all claims NOT watching`() {
        assertEquals(FloorNotWatchingReason.NO_FRESH_READING, reasonOf(status(cgmAgeMs = null)))
    }

    @Test
    fun `degraded with unsynced thresholds claims NOT watching even on a fresh reading`() {
        assertEquals(
            FloorNotWatchingReason.THRESHOLDS_NOT_SYNCED,
            reasonOf(status(cgmAgeMs = 0L, thresholdsConfigured = false, backendConfigured = true)),
        )
    }

    @Test
    fun `missing thresholds without a backend claims NOT CONFIGURED, not not-synced`() {
        // GLY-145: for a BLE-only user "haven't synced from your server" would be a permanent
        // lie — there is no server. The honest reason points at the Settings editor instead.
        assertEquals(
            FloorNotWatchingReason.THRESHOLDS_NOT_CONFIGURED,
            reasonOf(status(cgmAgeMs = 0L, thresholdsConfigured = false, backendConfigured = false)),
        )
    }

    @Test
    fun `configured thresholds claim watching regardless of backend mode`() {
        // The arming claim keys on thresholdsConfigured alone: backendConfigured only selects
        // the missing-thresholds reason, never widens or narrows the coverage claim.
        assertEquals(
            AlertFloorStatus.FloorWatching,
            status(cgmAgeMs = 30_000L, backendConfigured = false),
        )
    }

    @Test
    fun `degraded without notification permission claims NOT watching`() {
        assertEquals(
            FloorNotWatchingReason.NOTIFICATIONS_DENIED,
            reasonOf(status(cgmAgeMs = 0L, canNotify = false)),
        )
    }

    @Test
    fun `degraded with the pump disconnected claims NOT watching even on a fresh cached reading`() {
        // The floor evaluates only on newly polled readings: with BLE down it cannot fire no
        // matter how fresh the cached reading still looks. Claiming "watching" here would be a
        // multi-minute false-coverage window bounded only by freshness decay.
        assertEquals(
            FloorNotWatchingReason.PUMP_DISCONNECTED,
            reasonOf(status(cgmAgeMs = 0L, pumpConnected = false)),
        )
    }

    @Test
    fun `a reading future-dated beyond the skew bound claims NOT watching`() {
        assertEquals(
            FloorNotWatchingReason.NO_FRESH_READING,
            reasonOf(status(cgmAgeMs = -10 * 60_000L)),
        )
    }

    @Test
    fun `the most actionable failed precondition wins when several fail at once`() {
        // Denied notifications are durable and user-fixable; they must not be hidden behind a
        // "no recent glucose" diagnosis the user can't act on.
        assertEquals(
            FloorNotWatchingReason.NOTIFICATIONS_DENIED,
            reasonOf(
                status(cgmAgeMs = null, thresholdsConfigured = false, canNotify = false, pumpConnected = false),
            ),
        )
    }

    // -- banner copy selection ------------------------------------------------------------------

    @Test
    fun `watching copy says the phone is watching and carries the threshold-only disclaimer`() {
        for (backendConfigured in listOf(true, false)) {
            val text = alertingDegradedBannerText(AlertFloorStatus.FloorWatching, backendConfigured)!!
            assertTrue(text.contains("phone is watching"))
            assertTrue(text.contains("Threshold-only, no prediction"))
        }
    }

    @Test
    fun `every not-watching variant says NOT watching and never claims coverage`() {
        for (backendConfigured in listOf(true, false)) {
            for (reason in FloorNotWatchingReason.entries) {
                val text = alertingDegradedBannerText(
                    AlertFloorStatus.FloorNotWatching(reason), backendConfigured,
                )!!
                assertTrue("$reason copy must claim non-coverage", text.contains("NOT watching"))
                assertFalse("$reason copy must not claim coverage", text.contains("is watching your"))
            }
        }
    }

    @Test
    fun `notifications-denied copy names the user-fixable remediation`() {
        val text = alertingDegradedBannerText(
            AlertFloorStatus.FloorNotWatching(FloorNotWatchingReason.NOTIFICATIONS_DENIED),
            true,
        )!!
        assertTrue(text.contains("Enable notifications"))
        assertFalse(text.contains("no recent glucose"))
    }

    @Test
    fun `not-configured copy points at the Settings editor`() {
        val text = alertingDegradedBannerText(
            AlertFloorStatus.FloorNotWatching(FloorNotWatchingReason.THRESHOLDS_NOT_CONFIGURED),
            false,
        )!!
        assertTrue(text.contains("set your alert thresholds in Settings"))
    }

    @Test
    fun `no BLE-only copy ever mentions a server or a restorable connection`() {
        // GLY-145 AC8: with no backend configured, "Server alerts paused" and "until the
        // connection is restored" assert a server that never existed. Sweep the whole family.
        // THRESHOLDS_NOT_SYNCED is excluded: the selector only ever emits it when a backend IS
        // configured (see `missing thresholds without a backend claims NOT CONFIGURED`), so its
        // server phrasing is honest in every reachable pairing.
        val statuses = listOf(AlertFloorStatus.FloorWatching) +
            FloorNotWatchingReason.entries
                .filter { it != FloorNotWatchingReason.THRESHOLDS_NOT_SYNCED }
                .map { AlertFloorStatus.FloorNotWatching(it) }
        for (status in statuses) {
            val text = alertingDegradedBannerText(status, backendConfigured = false)!!
            assertFalse("$status BLE-only copy must not say server: \"$text\"", text.contains("server", ignoreCase = true))
            assertFalse("$status BLE-only copy must not promise reconnection: \"$text\"", text.contains("connection is restored"))
        }
    }

    @Test
    fun `backend-mode watching copy keeps the server-paused framing`() {
        val text = alertingDegradedBannerText(AlertFloorStatus.FloorWatching, true)!!
        assertTrue(text.contains("Server alerts paused"))
    }

    @Test
    fun `server-active has no banner copy in either mode`() {
        assertNull(alertingDegradedBannerText(AlertFloorStatus.ServerActive, true))
        assertNull(alertingDegradedBannerText(AlertFloorStatus.ServerActive, false))
    }
}
