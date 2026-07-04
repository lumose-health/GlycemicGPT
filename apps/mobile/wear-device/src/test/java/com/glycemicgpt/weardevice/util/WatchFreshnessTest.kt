package com.glycemicgpt.weardevice.util

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Boundary pins for the mirrored freshness tiers (GLY-116 axis b). The values MUST match the
 * phone's FreshnessPolicy (CGM 6/15 min, PUMP 15/60 min) — these tests are the wear-side half
 * of that mirror contract, boundary pair at each tier edge (edge−1 and edge), half-open like
 * the phone's FreshnessThresholds.classify.
 */
class WatchFreshnessTest {

    @Test
    fun `cgm tier boundary pair at the FRESH-STALE edge (6 min)`() {
        assertEquals(WatchFreshness.Tier.FRESH, WatchFreshness.cgmTier(6 * 60_000L - 1))
        assertEquals(WatchFreshness.Tier.STALE, WatchFreshness.cgmTier(6 * 60_000L))
    }

    @Test
    fun `cgm tier boundary pair at the STALE-TOO_STALE edge (15 min)`() {
        assertEquals(WatchFreshness.Tier.STALE, WatchFreshness.cgmTier(15 * 60_000L - 1))
        assertEquals(WatchFreshness.Tier.TOO_STALE, WatchFreshness.cgmTier(15 * 60_000L))
    }

    @Test
    fun `pump tier boundary pair at the FRESH-STALE edge (15 min)`() {
        assertEquals(WatchFreshness.Tier.FRESH, WatchFreshness.pumpTier(15 * 60_000L - 1))
        assertEquals(WatchFreshness.Tier.STALE, WatchFreshness.pumpTier(15 * 60_000L))
    }

    @Test
    fun `pump tier boundary pair at the STALE-TOO_STALE edge (60 min)`() {
        assertEquals(WatchFreshness.Tier.STALE, WatchFreshness.pumpTier(60 * 60_000L - 1))
        assertEquals(WatchFreshness.Tier.TOO_STALE, WatchFreshness.pumpTier(60 * 60_000L))
    }

    @Test
    fun `small negative ages read FRESH - routine clock skew is a display concern`() {
        assertEquals(WatchFreshness.Tier.FRESH, WatchFreshness.cgmTier(-5_000L))
        assertEquals(WatchFreshness.Tier.FRESH, WatchFreshness.pumpTier(-5_000L))
    }

    @Test
    fun `negative ages beyond the skew bound read TOO_STALE - boundary pair`() {
        // A rewound watch clock understates every age; beyond the tolerance the feed fails
        // closed instead of rendering arbitrarily old values as confident-live.
        assertEquals(WatchFreshness.Tier.FRESH, WatchFreshness.cgmTier(-60_000L))
        assertEquals(WatchFreshness.Tier.TOO_STALE, WatchFreshness.cgmTier(-60_001L))
        assertEquals(WatchFreshness.Tier.FRESH, WatchFreshness.pumpTier(-60_000L))
        assertEquals(WatchFreshness.Tier.TOO_STALE, WatchFreshness.pumpTier(-60_001L))
    }

    @Test
    fun `default status timeout is one CGM staleness window`() {
        assertEquals(WatchFreshness.CGM_STALE_AFTER_MS, WatchFreshness.DEFAULT_STATUS_TIMEOUT_MS)
    }
}
