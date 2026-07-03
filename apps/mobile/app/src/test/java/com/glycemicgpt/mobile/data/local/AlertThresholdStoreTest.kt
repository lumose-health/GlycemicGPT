package com.glycemicgpt.mobile.data.local

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Tests for [AlertThresholdStore] semantics (GLY-115). Uses an in-memory mirror to avoid the
 * Android SharedPreferences dependency, mirroring [SafetyLimitsStoreTest]'s pattern. The
 * contract that matters most: [AlertThresholdStore.isSynced] is false until the first
 * backend fetch and false again after [AlertThresholdStore.clear] — the alert floor's
 * never-fire-off-defaults gate keys off it.
 */
class AlertThresholdStoreTest {

    @Test
    fun `defaults mirror the backend column defaults`() {
        val store = InMemoryAlertThresholdStore()
        assertEquals(AlertThresholdStore.DEFAULT_URGENT_LOW, store.urgentLowMgDl)
        assertEquals(AlertThresholdStore.DEFAULT_LOW_WARNING, store.lowWarningMgDl)
        assertEquals(AlertThresholdStore.DEFAULT_HIGH_WARNING, store.highWarningMgDl)
        assertEquals(AlertThresholdStore.DEFAULT_URGENT_HIGH, store.urgentHighMgDl)
    }

    @Test
    fun `never synced until the first update`() {
        val store = InMemoryAlertThresholdStore()
        assertFalse(store.isSynced())
        store.updateAll(50, 75, 170, 260)
        assertTrue(store.isSynced())
    }

    @Test
    fun `updateAll persists all four thresholds`() {
        val store = InMemoryAlertThresholdStore()
        store.updateAll(50, 75, 170, 260)
        assertEquals(50, store.urgentLowMgDl)
        assertEquals(75, store.lowWarningMgDl)
        assertEquals(170, store.highWarningMgDl)
        assertEquals(260, store.urgentHighMgDl)
    }

    @Test
    fun `clear resets to defaults and un-syncs - disarming the floor`() {
        val store = InMemoryAlertThresholdStore()
        store.updateAll(50, 75, 170, 260)
        store.clear()
        assertFalse(store.isSynced())
        assertEquals(AlertThresholdStore.DEFAULT_URGENT_LOW, store.urgentLowMgDl)
        assertEquals(AlertThresholdStore.DEFAULT_LOW_WARNING, store.lowWarningMgDl)
    }

    @Test
    fun `isStale is true when never fetched and false right after update`() {
        val store = InMemoryAlertThresholdStore()
        assertTrue(store.isStale())
        store.updateAll(50, 75, 170, 260)
        assertFalse(store.isStale())
    }

    @Test
    fun `isStale is true when max age exceeded`() {
        val store = InMemoryAlertThresholdStore()
        store.updateAll(50, 75, 170, 260)
        store.forceLastFetched(System.currentTimeMillis() - AlertThresholdStore.STALE_THRESHOLD_MS - 1)
        assertTrue(store.isStale())
    }

    /**
     * In-memory mirror of [AlertThresholdStore] for testing without Android SharedPreferences.
     * Mirrors the same storage/retrieval logic.
     */
    private class InMemoryAlertThresholdStore {
        private var _urgentLow: Int = AlertThresholdStore.DEFAULT_URGENT_LOW
        private var _lowWarning: Int = AlertThresholdStore.DEFAULT_LOW_WARNING
        private var _highWarning: Int = AlertThresholdStore.DEFAULT_HIGH_WARNING
        private var _urgentHigh: Int = AlertThresholdStore.DEFAULT_URGENT_HIGH
        var lastFetchedMs: Long = 0L
            private set

        fun forceLastFetched(ms: Long) {
            lastFetchedMs = ms
        }

        val urgentLowMgDl: Int get() = _urgentLow
        val lowWarningMgDl: Int get() = _lowWarning
        val highWarningMgDl: Int get() = _highWarning
        val urgentHighMgDl: Int get() = _urgentHigh

        fun isSynced(): Boolean = lastFetchedMs != 0L

        fun updateAll(urgentLow: Int, lowWarning: Int, highWarning: Int, urgentHigh: Int) {
            _urgentLow = urgentLow
            _lowWarning = lowWarning
            _highWarning = highWarning
            _urgentHigh = urgentHigh
            lastFetchedMs = System.currentTimeMillis()
        }

        fun clear() {
            _urgentLow = AlertThresholdStore.DEFAULT_URGENT_LOW
            _lowWarning = AlertThresholdStore.DEFAULT_LOW_WARNING
            _highWarning = AlertThresholdStore.DEFAULT_HIGH_WARNING
            _urgentHigh = AlertThresholdStore.DEFAULT_URGENT_HIGH
            lastFetchedMs = 0L
        }

        fun isStale(maxAgeMs: Long = AlertThresholdStore.STALE_THRESHOLD_MS): Boolean {
            val age = System.currentTimeMillis() - lastFetchedMs
            return age > maxAgeMs
        }
    }
}
