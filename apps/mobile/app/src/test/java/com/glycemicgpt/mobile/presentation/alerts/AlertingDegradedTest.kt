package com.glycemicgpt.mobile.presentation.alerts

import com.glycemicgpt.mobile.data.network.NetworkStatus
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
        thresholdsSynced: Boolean = true,
        canNotify: Boolean = true,
    ) = alertFloorStatus(network, stream, cgmAgeMs, FreshnessPolicy.CGM, thresholdsSynced, canNotify)

    @Test
    fun `healthy server wins regardless of floor inputs`() {
        assertEquals(
            AlertFloorStatus.SERVER_ACTIVE,
            status(
                network = NetworkStatus.REACHABLE,
                stream = AlertStreamState.CONNECTED,
                cgmAgeMs = null,
                thresholdsSynced = false,
                canNotify = false,
            ),
        )
    }

    @Test
    fun `degraded with a fresh reading and synced thresholds claims watching`() {
        assertEquals(AlertFloorStatus.FLOOR_WATCHING, status(cgmAgeMs = 30_000L))
    }

    @Test
    fun `degraded with a stale reading claims NOT watching - the lethal trap pinned`() {
        // Exactly the claim GLY-115 exists to keep honest: STALE and TOO_STALE readings mean
        // the floor cannot fire, so the surface must never say "watching".
        assertEquals(AlertFloorStatus.FLOOR_NOT_WATCHING, status(cgmAgeMs = 6 * 60_000L))
        assertEquals(AlertFloorStatus.FLOOR_NOT_WATCHING, status(cgmAgeMs = 20 * 60_000L))
    }

    @Test
    fun `degraded with no reading at all claims NOT watching`() {
        assertEquals(AlertFloorStatus.FLOOR_NOT_WATCHING, status(cgmAgeMs = null))
    }

    @Test
    fun `degraded with unsynced thresholds claims NOT watching even on a fresh reading`() {
        assertEquals(
            AlertFloorStatus.FLOOR_NOT_WATCHING,
            status(cgmAgeMs = 0L, thresholdsSynced = false),
        )
    }

    @Test
    fun `degraded without notification permission claims NOT watching`() {
        assertEquals(
            AlertFloorStatus.FLOOR_NOT_WATCHING,
            status(cgmAgeMs = 0L, canNotify = false),
        )
    }

    @Test
    fun `a reading future-dated beyond the skew bound claims NOT watching`() {
        assertEquals(AlertFloorStatus.FLOOR_NOT_WATCHING, status(cgmAgeMs = -10 * 60_000L))
    }

    // -- banner copy selection ------------------------------------------------------------------

    @Test
    fun `watching copy says the phone is watching and carries the threshold-only disclaimer`() {
        val text = alertingDegradedBannerText(AlertFloorStatus.FLOOR_WATCHING)!!
        assertTrue(text.contains("this phone is watching"))
        assertTrue(text.contains("Threshold-only, no prediction"))
    }

    @Test
    fun `not-watching copy says NOT watching and never claims coverage`() {
        val text = alertingDegradedBannerText(AlertFloorStatus.FLOOR_NOT_WATCHING)!!
        assertTrue(text.contains("NOT watching"))
        assertFalse(text.contains("is watching your"))
    }

    @Test
    fun `server-active has no banner copy`() {
        assertNull(alertingDegradedBannerText(AlertFloorStatus.SERVER_ACTIVE))
    }
}
