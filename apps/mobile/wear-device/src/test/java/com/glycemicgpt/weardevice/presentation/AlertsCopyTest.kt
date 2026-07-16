package com.glycemicgpt.weardevice.presentation

import com.glycemicgpt.weardevice.data.WearDataContract
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Pins [notWatchingReasonCopy]'s exhaustiveness over the wire reasons (GLY-151). The mapping
 * is deliberately fail-open — an unknown reason falls back to a generic "nothing is watching"
 * line — so a dropped or renamed branch doesn't crash, it silently swaps the actionable copy
 * ("set thresholds in Settings") for the generic one. These tests make that degradation RED.
 * The reason list is read reflectively off [WearDataContract], so a reason added to the wire
 * contract without a copy arm (and a keyword below) fails here instead of degrading silently.
 */
class AlertsCopyTest {

    private val genericLine = notWatchingReasonCopy(null)

    /** One discriminating keyword per wire reason, binding each reason to ITS copy — a
     *  merely-distinct assertion would still pass with two arms swapped. */
    private val discriminatingKeyword = mapOf(
        WearDataContract.MONITORING_REASON_NOTIFICATIONS_DENIED to "notifications",
        WearDataContract.MONITORING_REASON_THRESHOLDS_NOT_SYNCED to "synced",
        WearDataContract.MONITORING_REASON_THRESHOLDS_NOT_CONFIGURED to "Settings",
        WearDataContract.MONITORING_REASON_PUMP_DISCONNECTED to "pump",
        WearDataContract.MONITORING_REASON_NO_FRESH_READING to "fresh",
    )

    /** Every reason constant the wire contract declares, so new ones are swept in
     *  without anyone remembering to edit this test. */
    private val wireReasons = WearDataContract::class.java.declaredFields
        .filter { it.name.startsWith("MONITORING_REASON_") }
        .map { it.get(null) as String }

    @Test
    fun `every wire reason maps to a distinct line naming its own cause`() {
        assertEquals(
            "Wire contract and keyword map disagree - a new reason needs a copy arm and a keyword",
            discriminatingKeyword.keys,
            wireReasons.toSet(),
        )
        val lines = wireReasons.map { reason ->
            val line = notWatchingReasonCopy(reason)
            assertNotEquals(
                "Reason '$reason' fell back to the generic line - a copy branch was dropped",
                genericLine,
                line,
            )
            assertTrue(
                "Reason '$reason' copy '$line' doesn't name its cause",
                line.contains(discriminatingKeyword.getValue(reason), ignoreCase = true),
            )
            line
        }
        assertEquals(
            "Two reasons share the same copy - the user can't tell the causes apart",
            wireReasons.size,
            lines.toSet().size,
        )
    }

    @Test
    fun `null reason falls back to the generic line`() {
        // Pinned literally on purpose: comparing against genericLine here would be tautological.
        assertEquals(
            "Monitoring degraded — nothing is watching for lows or highs.",
            notWatchingReasonCopy(null),
        )
    }

    @Test
    fun `unknown reason falls back to the generic line instead of crashing`() {
        assertEquals(genericLine, notWatchingReasonCopy("SOME_FUTURE_REASON"))
    }
}
