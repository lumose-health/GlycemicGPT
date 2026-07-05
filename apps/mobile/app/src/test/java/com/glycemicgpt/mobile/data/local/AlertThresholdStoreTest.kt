package com.glycemicgpt.mobile.data.local

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Tests for [AlertThresholdStore] semantics (GLY-115, sources GLY-145). Uses an in-memory
 * mirror to avoid the Android SharedPreferences dependency, mirroring [SafetyLimitsStoreTest]'s
 * pattern. The contract that matters most: [AlertThresholdStore.isConfigured] is false until
 * thresholds arrive from a backend sync ([AlertThresholdStore.updateAll]) or the local Settings
 * editor ([AlertThresholdStore.updateLocal]) — the alert floor's never-fire-off-defaults gate
 * keys off it — and [AlertThresholdStore.clear] disarms only BACKEND values, preserving LOCAL.
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
    fun `never configured until the first update from either source`() {
        val store = InMemoryAlertThresholdStore()
        assertEquals(ThresholdSource.NONE, store.source)
        assertFalse(store.isConfigured())
        store.updateAll(50, 75, 170, 260)
        assertTrue(store.isConfigured())
    }

    @Test
    fun `updateAll persists all four thresholds and marks the source BACKEND`() {
        val store = InMemoryAlertThresholdStore()
        store.updateAll(50, 75, 170, 260)
        assertEquals(50, store.urgentLowMgDl)
        assertEquals(75, store.lowWarningMgDl)
        assertEquals(170, store.highWarningMgDl)
        assertEquals(260, store.urgentHighMgDl)
        assertEquals(ThresholdSource.BACKEND, store.source)
    }

    @Test
    fun `updateLocal persists all four thresholds, marks LOCAL and configures with no sync`() {
        val store = InMemoryAlertThresholdStore()
        store.updateLocal(60, 80, 160, 240)
        assertEquals(60, store.urgentLowMgDl)
        assertEquals(80, store.lowWarningMgDl)
        assertEquals(160, store.highWarningMgDl)
        assertEquals(240, store.urgentHighMgDl)
        assertEquals(ThresholdSource.LOCAL, store.source)
        assertTrue(store.isConfigured())
        // No backend fetch ever happened: LOCAL configuration must not fake a sync timestamp.
        assertEquals(0L, store.lastFetchedMs)
    }

    @Test
    fun `updateLocal after a backend era resets the fetch timestamp`() {
        // A stale BACKEND-era timestamp must not survive under LOCAL values: LOCAL thresholds
        // have no backend fetch behind them, so the clock that measures fetch age resets.
        val store = InMemoryAlertThresholdStore()
        store.updateAll(50, 75, 170, 260)
        store.updateLocal(60, 80, 160, 240)
        assertEquals(0L, store.lastFetchedMs)
        assertEquals(ThresholdSource.LOCAL, store.source)
    }

    @Test
    fun `updateAll overwrites LOCAL values - backend is master`() {
        val store = InMemoryAlertThresholdStore()
        store.updateLocal(60, 80, 160, 240)
        store.updateAll(50, 75, 170, 260)
        assertEquals(ThresholdSource.BACKEND, store.source)
        assertEquals(50, store.urgentLowMgDl)
        assertEquals(260, store.urgentHighMgDl)
    }

    @Test
    fun `clear disarms BACKEND thresholds - resetting to defaults and un-configuring`() {
        val store = InMemoryAlertThresholdStore()
        store.updateAll(50, 75, 170, 260)
        store.clear()
        assertFalse(store.isConfigured())
        assertEquals(ThresholdSource.NONE, store.source)
        assertEquals(AlertThresholdStore.DEFAULT_URGENT_LOW, store.urgentLowMgDl)
        assertEquals(AlertThresholdStore.DEFAULT_LOW_WARNING, store.lowWarningMgDl)
    }

    @Test
    fun `clear preserves LOCAL thresholds - logout must not disarm a device-configured floor`() {
        val store = InMemoryAlertThresholdStore()
        store.updateLocal(60, 80, 160, 240)
        store.clear()
        assertEquals(ThresholdSource.LOCAL, store.source)
        assertTrue(store.isConfigured())
        assertEquals(60, store.urgentLowMgDl)
        assertEquals(240, store.urgentHighMgDl)
    }

    @Test
    fun `legacy synced install with no persisted source reads as BACKEND`() {
        // Pre-GLY-145 installs have a fetch timestamp but no source key: an already-armed
        // floor must stay armed across the upgrade.
        val store = InMemoryAlertThresholdStore()
        store.seedLegacySyncedInstall(50, 75, 170, 260)
        assertEquals(ThresholdSource.BACKEND, store.source)
        assertTrue(store.isConfigured())
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

    @Test
    fun `updateAll rejects values outside the 20-500 safety range and persists nothing`() {
        val store = InMemoryAlertThresholdStore()
        assertThrows(IllegalArgumentException::class.java) {
            store.updateAll(10, 75, 170, 260)
        }
        assertFalse(store.isConfigured())
    }

    @Test
    fun `updateLocal rejects values outside the 20-500 safety range and persists nothing`() {
        val store = InMemoryAlertThresholdStore()
        assertThrows(IllegalArgumentException::class.java) {
            store.updateLocal(19, 75, 170, 260)
        }
        assertThrows(IllegalArgumentException::class.java) {
            store.updateLocal(55, 75, 170, 501)
        }
        assertFalse(store.isConfigured())
    }

    @Test
    fun `updateLocal rejects disordered thresholds and persists nothing`() {
        val store = InMemoryAlertThresholdStore()
        assertThrows(IllegalArgumentException::class.java) {
            store.updateLocal(80, 70, 170, 260)
        }
        assertFalse(store.isConfigured())
    }

    @Test
    fun `updateAll rejects disordered thresholds but allows rounded ties at urgent boundaries`() {
        val store = InMemoryAlertThresholdStore()
        // A low band overlapping the high band can never persist...
        assertThrows(IllegalArgumentException::class.java) {
            store.updateAll(80, 70, 170, 260)
        }
        assertFalse(store.isConfigured())
        // ...but urgent/warning ties from float rounding (69.8/70.2 -> 70/70) are legal; the
        // classifier checks the urgent band first, so a tie fires the more severe alert.
        store.updateAll(70, 70, 170, 170)
        assertTrue(store.isConfigured())
    }

    /**
     * In-memory mirror of [AlertThresholdStore] for testing without Android SharedPreferences.
     * Mirrors the same storage/retrieval logic, including the legacy no-source fallback.
     */
    private class InMemoryAlertThresholdStore {
        private var _urgentLow: Int = AlertThresholdStore.DEFAULT_URGENT_LOW
        private var _lowWarning: Int = AlertThresholdStore.DEFAULT_LOW_WARNING
        private var _highWarning: Int = AlertThresholdStore.DEFAULT_HIGH_WARNING
        private var _urgentHigh: Int = AlertThresholdStore.DEFAULT_URGENT_HIGH
        private var storedSource: String? = null
        var lastFetchedMs: Long = 0L
            private set

        fun forceLastFetched(ms: Long) {
            lastFetchedMs = ms
        }

        /** A pre-GLY-145 install: values + fetch timestamp persisted, no source key. */
        fun seedLegacySyncedInstall(urgentLow: Int, lowWarning: Int, highWarning: Int, urgentHigh: Int) {
            _urgentLow = urgentLow
            _lowWarning = lowWarning
            _highWarning = highWarning
            _urgentHigh = urgentHigh
            lastFetchedMs = System.currentTimeMillis()
            storedSource = null
        }

        val urgentLowMgDl: Int get() = _urgentLow
        val lowWarningMgDl: Int get() = _lowWarning
        val highWarningMgDl: Int get() = _highWarning
        val urgentHighMgDl: Int get() = _urgentHigh

        val source: ThresholdSource
            get() {
                storedSource?.let { stored ->
                    ThresholdSource.entries.firstOrNull { it.name == stored }?.let { return it }
                }
                return if (lastFetchedMs != 0L) ThresholdSource.BACKEND else ThresholdSource.NONE
            }

        fun isConfigured(): Boolean = source != ThresholdSource.NONE

        fun updateAll(urgentLow: Int, lowWarning: Int, highWarning: Int, urgentHigh: Int) {
            requireSafeThresholds(urgentLow, lowWarning, highWarning, urgentHigh)
            _urgentLow = urgentLow
            _lowWarning = lowWarning
            _highWarning = highWarning
            _urgentHigh = urgentHigh
            lastFetchedMs = System.currentTimeMillis()
            storedSource = ThresholdSource.BACKEND.name
        }

        fun updateLocal(urgentLow: Int, lowWarning: Int, highWarning: Int, urgentHigh: Int) {
            requireSafeThresholds(urgentLow, lowWarning, highWarning, urgentHigh)
            _urgentLow = urgentLow
            _lowWarning = lowWarning
            _highWarning = highWarning
            _urgentHigh = urgentHigh
            storedSource = ThresholdSource.LOCAL.name
            lastFetchedMs = 0L
        }

        private fun requireSafeThresholds(
            urgentLow: Int,
            lowWarning: Int,
            highWarning: Int,
            urgentHigh: Int,
        ) {
            require(listOf(urgentLow, lowWarning, highWarning, urgentHigh).all { it in 20..500 }) {
                "Alert thresholds out of the 20-500 mg/dL safety range"
            }
            require(urgentLow <= lowWarning && lowWarning < highWarning && highWarning <= urgentHigh) {
                "Alert thresholds not correctly ordered"
            }
        }

        fun clear() {
            if (source != ThresholdSource.BACKEND) return
            _urgentLow = AlertThresholdStore.DEFAULT_URGENT_LOW
            _lowWarning = AlertThresholdStore.DEFAULT_LOW_WARNING
            _highWarning = AlertThresholdStore.DEFAULT_HIGH_WARNING
            _urgentHigh = AlertThresholdStore.DEFAULT_URGENT_HIGH
            lastFetchedMs = 0L
            storedSource = null
        }

        fun isStale(maxAgeMs: Long = AlertThresholdStore.STALE_THRESHOLD_MS): Boolean {
            val age = System.currentTimeMillis() - lastFetchedMs
            return age > maxAgeMs
        }
    }
}
