package com.glycemicgpt.weardevice.complications

import com.glycemicgpt.weardevice.data.WatchDataRepository
import com.glycemicgpt.weardevice.util.GlucoseUnit
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * GLY-116 AC-C: age-bounds for every wrist surface that renders a pushed value, boundary pair
 * at each tier edge (edge−1 / edge). The render decisions are pure companions, so the same
 * logic the complication services ship is what these tests drive — and none of them take the
 * "watching" bit as input, which is the structural proof that axis (b) de-emphasis is
 * independent of axis (a) coverage (BG greys at STALE age even while the mirrored status says
 * ServerActive).
 */
class ComplicationFreshnessRenderTest {

    private val nowMs = 1_750_000_000_000L

    // -- BG complication: CGM tiers (6-min FRESH boundary, 15-min cap) ------------------------

    private fun cgm(ageMs: Long, mgDl: Int = 120) = WatchDataRepository.CgmState(
        mgDl = mgDl, trend = "FLAT", timestampMs = nowMs - ageMs,
        low = 70, high = 180, urgentLow = 55, urgentHigh = 250,
    )

    @Test
    fun `BG renders confident-live strictly below the 6-min STALE edge`() {
        val render = BgComplicationDataSource.render(cgm(6 * 60_000L - 1), nowMs, GlucoseUnit.MGDL)
        assertEquals("120 →", render.shortText)
        assertEquals("Blood Glucose: 120 mg/dL", render.description)
    }

    @Test
    fun `BG de-emphasises in the STALE band - value kept but marked, not confident-live`() {
        val render = BgComplicationDataSource.render(cgm(6 * 60_000L), nowMs, GlucoseUnit.MGDL)
        assertEquals("120? →", render.shortText)
        assertTrue(render.description.endsWith("(stale)"))
    }

    @Test
    fun `BG STALE band boundary pair at the 15-min cap`() {
        val atEdgeMinus1 = BgComplicationDataSource.render(cgm(15 * 60_000L - 1), nowMs, GlucoseUnit.MGDL)
        assertEquals("120? →", atEdgeMinus1.shortText)

        val atEdge = BgComplicationDataSource.render(cgm(15 * 60_000L), nowMs, GlucoseUnit.MGDL)
        assertEquals("--", atEdge.shortText)
        assertEquals("No recent data", atEdge.description)
        // The age keeps counting even when the number is dropped — the only honest thing left.
        assertEquals(nowMs - 15 * 60_000L, atEdge.ageReferenceMs)
    }

    @Test
    fun `BG with no cached reading shows placeholder with no age reference`() {
        val render = BgComplicationDataSource.render(null, nowMs, GlucoseUnit.MGDL)
        assertEquals("--", render.shortText)
        assertEquals(null, render.ageReferenceMs)
    }

    @Test
    fun `BG future-dated reading renders FRESH - skew is a display concern`() {
        val render = BgComplicationDataSource.render(cgm(-5_000L), nowMs, GlucoseUnit.MGDL)
        assertEquals("120 →", render.shortText)
    }

    @Test
    fun `BG invalid glucose is rejected regardless of age`() {
        val render = BgComplicationDataSource.render(cgm(0L, mgDl = 900), nowMs, GlucoseUnit.MGDL)
        assertEquals("--", render.shortText)
    }

    // -- IoB complication: PUMP tiers (15-min STALE, 60-min TOO_STALE) ------------------------

    private fun iob(ageMs: Long) =
        WatchDataRepository.IoBState(iob = 2.45f, timestampMs = nowMs - ageMs)

    @Test
    fun `IoB boundary pair at the 15-min STALE edge`() {
        assertEquals("2.45", IoBComplicationDataSource.render(iob(15 * 60_000L - 1), nowMs).text)
        assertEquals("2.45?", IoBComplicationDataSource.render(iob(15 * 60_000L), nowMs).text)
    }

    @Test
    fun `IoB boundary pair at the 60-min TOO_STALE edge - no unbounded render`() {
        assertEquals("2.45?", IoBComplicationDataSource.render(iob(60 * 60_000L - 1), nowMs).text)
        val tooStale = IoBComplicationDataSource.render(iob(60 * 60_000L), nowMs)
        assertEquals("--", tooStale.text)
        assertEquals("No recent data", tooStale.description)
    }

    // -- Alerts complication: alert age-bound + coverage cue ----------------------------------

    private fun alert(ageMs: Long, type: String = "low") = WatchDataRepository.AlertState(
        type = type, bgValue = 62, timestampMs = nowMs - ageMs, message = "LOW 62 mg/dL",
    )

    @Test
    fun `active alert below the 15-min cap renders active with its age`() {
        val render = AlertsComplicationDataSource.render(
            alert(15 * 60_000L - 1),
            WatchDataRepository.WristCoverage.Watching,
            nowMs,
        )
        assertEquals(AlertsComplicationDataSource.COLOR_WARNING, render.tint)
        assertEquals("Alert active (14m ago)", render.description)
    }

    @Test
    fun `alert at the 15-min cap de-emphasises to historical - never active-indefinitely`() {
        val render = AlertsComplicationDataSource.render(
            alert(15 * 60_000L),
            WatchDataRepository.WristCoverage.Watching,
            nowMs,
        )
        assertEquals(AlertsComplicationDataSource.COLOR_DEFAULT, render.tint)
        assertEquals("Alert as of 15m ago — data stale", render.description)
    }

    @Test
    fun `stale alert with nothing watching warns - quiet grey is reserved for covered`() {
        // A real alert whose phone then dies ages past the cap and never auto-clears; grey
        // there would be indistinguishable from the healthy all-clear glance, suppressing the
        // dead-phone cue in exactly the case it exists for.
        val notWatching = AlertsComplicationDataSource.render(
            alert(15 * 60_000L),
            WatchDataRepository.WristCoverage.NotWatching("PUMP_DISCONNECTED"),
            nowMs,
        )
        assertEquals(AlertsComplicationDataSource.COLOR_WARNING, notWatching.tint)
        assertEquals("Alert as of 15m ago — data stale, not watching", notWatching.description)

        val noStatus = AlertsComplicationDataSource.render(
            alert(15 * 60_000L),
            WatchDataRepository.WristCoverage.NoRecentStatus,
            nowMs,
        )
        assertEquals(AlertsComplicationDataSource.COLOR_WARNING, noStatus.tint)
        assertEquals("Alert as of 15m ago — data stale, not watching", noStatus.description)
    }

    @Test
    fun `urgent alert tints red while its data is current`() {
        val render = AlertsComplicationDataSource.render(
            alert(60_000L, type = "urgent_low"),
            WatchDataRepository.WristCoverage.Watching,
            nowMs,
        )
        assertEquals(AlertsComplicationDataSource.COLOR_URGENT, render.tint)
    }

    @Test
    fun `no alert plus watching is the only quiet all-clear`() {
        val render = AlertsComplicationDataSource.render(
            null,
            WatchDataRepository.WristCoverage.Watching,
            nowMs,
        )
        assertEquals(AlertsComplicationDataSource.COLOR_DEFAULT, render.tint)
        assertEquals("No active alerts", render.description)
    }

    @Test
    fun `no alert plus not-watching warns instead of reading all-clear`() {
        val render = AlertsComplicationDataSource.render(
            null,
            WatchDataRepository.WristCoverage.NotWatching("PUMP_DISCONNECTED"),
            nowMs,
        )
        assertEquals(AlertsComplicationDataSource.COLOR_WARNING, render.tint)
        assertEquals("Monitoring degraded — not watching", render.description)
        assertFalse(render.description.contains("No active alerts"))
    }

    @Test
    fun `no alert plus no recent status warns - dead phone must not look covered`() {
        val render = AlertsComplicationDataSource.render(
            null,
            WatchDataRepository.WristCoverage.NoRecentStatus,
            nowMs,
        )
        assertEquals(AlertsComplicationDataSource.COLOR_WARNING, render.tint)
        assertEquals("No recent data from phone", render.description)
    }
}
