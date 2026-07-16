package com.glycemicgpt.mobile.data.local

import android.app.Application
import android.content.Context
import android.content.SharedPreferences
import androidx.test.core.app.ApplicationProvider
import app.cash.turbine.test
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Real-storage proof of the [AlertThresholdStore] arming semantics against actual
 * SharedPreferences (GLY-151). The fake-based [AlertThresholdStoreTest] re-implements the same
 * logic in memory, so a regression in the real class ships with a green suite; these tests run
 * the real class end-to-end. The legacy seed writes the LITERAL on-disk keys a pre-GLY-145
 * install has, so the persisted schema itself is pinned — renaming a key or changing the
 * migration fallback silently disarms real users and must fail here.
 */
// Plain Application: the manifest's @HiltAndroidApp class would pull keystore-backed
// injection into a JVM test that only needs a Context for plain SharedPreferences.
@RunWith(RobolectricTestRunner::class)
@Config(application = Application::class)
class AlertThresholdStoreRobolectricTest {

    private lateinit var context: Context
    private lateinit var rawPrefs: SharedPreferences
    private lateinit var store: AlertThresholdStore

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        // The literal prefs file name the store reads: seeding through this handle writes the
        // exact bytes-on-disk layout an upgrade migrates from.
        rawPrefs = context.getSharedPreferences("alert_thresholds", Context.MODE_PRIVATE)
        store = AlertThresholdStore(context)
    }

    /** A pre-GLY-145 install: thresholds + fetch timestamp on disk, NO "source" key. */
    private fun seedLegacySyncedInstall() {
        rawPrefs.edit()
            .putInt("urgent_low", 50)
            .putInt("low_warning", 75)
            .putInt("high_warning", 170)
            .putInt("urgent_high", 260)
            .putLong("last_fetched_ms", System.currentTimeMillis())
            .commit()
    }

    // --- AC1: migration getter -- a legacy synced install stays ARMED across the upgrade ---

    @Test
    fun `legacy install with fetch timestamp and no source key reads as BACKEND and stays armed`() {
        seedLegacySyncedInstall()
        assertEquals(ThresholdSource.BACKEND, store.source)
        assertTrue(store.isConfigured())
        assertEquals(50, store.urgentLowMgDl)
        assertEquals(75, store.lowWarningMgDl)
        assertEquals(170, store.highWarningMgDl)
        assertEquals(260, store.urgentHighMgDl)
    }

    @Test
    fun `pristine install reads as NONE and stays disarmed`() {
        assertEquals(ThresholdSource.NONE, store.source)
        assertFalse(store.isConfigured())
    }

    @Test
    fun `explicit persisted source wins over the legacy timestamp fallback`() {
        // A LOCAL store keeps a zero timestamp, but even a corrupt combination (LOCAL source +
        // nonzero timestamp) must honor the persisted source, not re-derive from the timestamp.
        rawPrefs.edit()
            .putString("source", ThresholdSource.LOCAL.name)
            .putLong("last_fetched_ms", System.currentTimeMillis())
            .commit()
        assertEquals(ThresholdSource.LOCAL, store.source)
    }

    @Test
    fun `unrecognized persisted source falls back to the timestamp rule instead of crashing`() {
        // A corrupt or future source string must never take alert evaluation down; the getter
        // tolerates it and re-derives from the timestamp like a legacy install.
        rawPrefs.edit()
            .putString("source", "GARBAGE")
            .putLong("last_fetched_ms", 123L)
            .commit()
        assertEquals(ThresholdSource.BACKEND, store.source)
        rawPrefs.edit().remove("last_fetched_ms").commit()
        assertEquals(ThresholdSource.NONE, store.source)
    }

    // --- AC2: source-gated clear() -- logout wipes BACKEND, must preserve LOCAL ---

    @Test
    fun `clear after a backend sync disarms and resets to defaults`() {
        store.updateAll(50, 75, 170, 260)
        store.clear()
        assertEquals(ThresholdSource.NONE, store.source)
        assertFalse(store.isConfigured())
        assertEquals(AlertThresholdStore.DEFAULT_URGENT_LOW, store.urgentLowMgDl)
        assertEquals(AlertThresholdStore.DEFAULT_LOW_WARNING, store.lowWarningMgDl)
        assertEquals(AlertThresholdStore.DEFAULT_HIGH_WARNING, store.highWarningMgDl)
        assertEquals(AlertThresholdStore.DEFAULT_URGENT_HIGH, store.urgentHighMgDl)
        assertEquals(0L, store.lastFetchedMs)
    }

    @Test
    fun `clear preserves LOCAL thresholds - logout must not disarm a device-configured floor`() {
        store.updateLocal(60, 80, 160, 240)
        store.clear()
        assertEquals(ThresholdSource.LOCAL, store.source)
        assertTrue(store.isConfigured())
        assertEquals(60, store.urgentLowMgDl)
        assertEquals(80, store.lowWarningMgDl)
        assertEquals(160, store.highWarningMgDl)
        assertEquals(240, store.urgentHighMgDl)
    }

    @Test
    fun `clear on a never-configured store is a no-op`() {
        store.clear()
        assertEquals(ThresholdSource.NONE, store.source)
        assertFalse(store.isConfigured())
    }

    @Test
    fun `clear after a legacy migration wipes - the derived BACKEND source drives the logout gate`() {
        // The upgrade-then-logout sequence a real pre-GLY-145 user hits: the source is only
        // DERIVED (timestamp, no key), yet logout must still treat it as BACKEND and wipe.
        seedLegacySyncedInstall()
        store.clear()
        assertEquals(ThresholdSource.NONE, store.source)
        assertFalse(store.isConfigured())
    }

    // --- AC3: write semantics ---

    @Test
    fun `updateAll persists thresholds, timestamp and BACKEND source in the real prefs`() {
        store.updateAll(50, 75, 170, 260)
        assertEquals(ThresholdSource.BACKEND, store.source)
        assertTrue(store.isConfigured())
        assertNotEquals(0L, store.lastFetchedMs)
        // The on-disk schema itself, so a key rename can't slip through the store's own getters.
        assertEquals(ThresholdSource.BACKEND.name, rawPrefs.getString("source", null))
        assertEquals(50, rawPrefs.getInt("urgent_low", -1))
        assertEquals(75, rawPrefs.getInt("low_warning", -1))
        assertEquals(170, rawPrefs.getInt("high_warning", -1))
        assertEquals(260, rawPrefs.getInt("urgent_high", -1))
        assertEquals(store.lastFetchedMs, rawPrefs.getLong("last_fetched_ms", -1L))
    }

    @Test
    fun `updateLocal resets the fetch timestamp so a BACKEND-era one cannot survive`() {
        store.updateAll(50, 75, 170, 260)
        assertNotEquals(0L, store.lastFetchedMs)
        store.updateLocal(60, 80, 160, 240)
        assertEquals(0L, store.lastFetchedMs)
        assertEquals(0L, rawPrefs.getLong("last_fetched_ms", -1L))
        assertEquals(ThresholdSource.LOCAL, store.source)
    }

    @Test
    fun `updateAll overwrites LOCAL values - backend is master`() {
        store.updateLocal(60, 80, 160, 240)
        store.updateAll(50, 75, 170, 260)
        assertEquals(ThresholdSource.BACKEND, store.source)
        assertEquals(50, store.urgentLowMgDl)
        assertEquals(75, store.lowWarningMgDl)
        assertEquals(170, store.highWarningMgDl)
        assertEquals(260, store.urgentHighMgDl)
    }

    @Test
    fun `out-of-range updates throw and persist nothing`() {
        // 19/501 sit one past the bounds, so an off-by-one loosening of 20..500 fails here.
        assertThrows(IllegalArgumentException::class.java) {
            store.updateAll(19, 75, 170, 260)
        }
        assertThrows(IllegalArgumentException::class.java) {
            store.updateLocal(55, 75, 170, 501)
        }
        assertFalse(store.isConfigured())
        assertTrue(rawPrefs.all.isEmpty())
    }

    @Test
    fun `the exact 20 and 500 bounds of the safety range are legal`() {
        // The other half of the off-by-one pin: narrowing 20..500 to 21..499 fails here.
        store.updateAll(20, 70, 180, 500)
        assertTrue(store.isConfigured())
        assertEquals(20, store.urgentLowMgDl)
        assertEquals(500, store.urgentHighMgDl)
    }

    @Test
    fun `disordered updates throw and persist nothing`() {
        assertThrows(IllegalArgumentException::class.java) {
            store.updateAll(80, 70, 170, 260)
        }
        assertThrows(IllegalArgumentException::class.java) {
            store.updateLocal(80, 70, 170, 260)
        }
        // The middle bound is STRICT: the low band may never touch the high band, or every
        // reading would classify as both low and high.
        assertThrows(IllegalArgumentException::class.java) {
            store.updateAll(50, 100, 100, 200)
        }
        assertFalse(store.isConfigured())
        assertTrue(rawPrefs.all.isEmpty())
    }

    @Test
    fun `a rejected update leaves previously stored values intact`() {
        store.updateAll(50, 75, 170, 260)
        assertThrows(IllegalArgumentException::class.java) {
            store.updateAll(10, 75, 170, 260)
        }
        assertEquals(50, store.urgentLowMgDl)
        assertEquals(260, store.urgentHighMgDl)
        assertEquals(ThresholdSource.BACKEND, store.source)
    }

    @Test
    fun `rounded ties at the urgent boundaries are legal`() {
        // Float rounding can produce urgent/warning ties (69.8/70.2 -> 70/70); the classifier
        // checks the urgent band first, so a tie fires the more severe alert.
        store.updateAll(70, 70, 170, 170)
        assertTrue(store.isConfigured())
        assertEquals(70, store.urgentLowMgDl)
        assertEquals(70, store.lowWarningMgDl)
        assertEquals(170, store.highWarningMgDl)
        assertEquals(170, store.urgentHighMgDl)
    }

    // --- isConfiguredFlow: the reactive channel the claim surfaces disarm through ---

    @Test
    fun `isConfiguredFlow emits on writes and on the logout clear`() = runTest {
        // The real listener wiring is the only channel observe() learns about a Settings save
        // or a logout disarm through. The clear() leg rides the null-key callback the store's
        // KDoc calls out — dropping that arm would leave a logged-out surface claiming
        // "watching" until its next cold start.
        store.isConfiguredFlow().test {
            assertFalse(awaitItem())
            store.updateLocal(60, 80, 160, 240)
            assertTrue(expectMostRecentItem())
            store.updateAll(50, 75, 170, 260)
            assertTrue(expectMostRecentItem())
            store.clear()
            assertFalse(expectMostRecentItem())
            cancelAndIgnoreRemainingEvents()
        }
    }
}
