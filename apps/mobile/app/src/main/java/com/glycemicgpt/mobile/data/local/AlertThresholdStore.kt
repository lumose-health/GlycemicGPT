package com.glycemicgpt.mobile.data.local

import android.content.Context
import android.content.SharedPreferences
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Where the active alert thresholds came from. The alert floor arms only when this is not
 * [NONE] -- it must never fire off thresholds the user didn't choose (GLY-115).
 */
enum class ThresholdSource {
    /** Never configured: the floor stays disarmed and the surfaces say so honestly. */
    NONE,

    /** Synced from the backend's `alert_thresholds` table. Backend is master: while a backend
     *  is configured these are the only values the floor fires from. */
    BACKEND,

    /** Set by the user on this device (BLE-only mode, no backend). Survives logout. */
    LOCAL,
}

/**
 * The alert thresholds the on-device alert floor fires from, from one of two sources
 * (GLY-145): [updateAll] syncs the user's server-side `alert_thresholds` (the table the
 * backend's alert engine fires from, via `GET /api/settings/alert-thresholds`), and
 * [updateLocal] persists user-set values from the Settings editor in BLE-only mode. Backend is
 * master: the Settings editor only writes while no backend is configured, and a valid backend
 * fetch overwrites LOCAL values. These are deliberately distinct from [GlucoseRangeStore] (the
 * *display* target range): a safety floor firing at display-range values instead of the user's
 * real alert thresholds would alarm at the wrong glucose levels and desync from the server.
 *
 * The defaults mirror the backend's `AlertThreshold` column defaults but exist only for the
 * watch alert relay -- the alert floor never fires until [isConfigured] is true (GLY-115:
 * never alarm off guessed thresholds).
 */
@Singleton
class AlertThresholdStore @Inject constructor(
    @ApplicationContext context: Context,
) {
    private val prefs: SharedPreferences =
        context.getSharedPreferences("alert_thresholds", Context.MODE_PRIVATE)

    val urgentLowMgDl: Int
        get() = prefs.getInt(KEY_URGENT_LOW, DEFAULT_URGENT_LOW)

    val lowWarningMgDl: Int
        get() = prefs.getInt(KEY_LOW_WARNING, DEFAULT_LOW_WARNING)

    val highWarningMgDl: Int
        get() = prefs.getInt(KEY_HIGH_WARNING, DEFAULT_HIGH_WARNING)

    val urgentHighMgDl: Int
        get() = prefs.getInt(KEY_URGENT_HIGH, DEFAULT_URGENT_HIGH)

    /** Timestamp of the last successful fetch from the backend, or 0 if never synced. */
    val lastFetchedMs: Long
        get() = prefs.getLong(KEY_LAST_FETCHED, 0L)

    /**
     * Where the stored thresholds came from. Installs that synced from the backend before the
     * source key existed have a fetch timestamp but no persisted source; they are BACKEND, so
     * an already-armed floor stays armed across the upgrade.
     */
    val source: ThresholdSource
        get() {
            prefs.getString(KEY_SOURCE, null)?.let { stored ->
                ThresholdSource.entries.firstOrNull { it.name == stored }?.let { return it }
            }
            return if (lastFetchedMs != 0L) ThresholdSource.BACKEND else ThresholdSource.NONE
        }

    /** True once thresholds exist from either source (backend sync or the local Settings
     *  editor). The alert floor is gated on this -- it must never fire off the hardcoded
     *  defaults, which no user ever chose. */
    fun isConfigured(): Boolean = source != ThresholdSource.NONE

    /**
     * Atomically update all four thresholds plus the fetch timestamp in a single
     * SharedPreferences transaction, marking the source BACKEND. Only called from backend
     * sync; the caller ([com.glycemicgpt.mobile.data.repository.AuthRepository]) validates
     * range and ordering before persisting. The guards here are defense-in-depth on the
     * canonical alarm source: a future caller that bypasses upstream validation must fail
     * loudly (leaving the last stored values intact), never persist unsafe thresholds.
     */
    fun updateAll(urgentLow: Int, lowWarning: Int, highWarning: Int, urgentHigh: Int) {
        requireSafeThresholds(urgentLow, lowWarning, highWarning, urgentHigh)
        prefs.edit()
            .putInt(KEY_URGENT_LOW, urgentLow)
            .putInt(KEY_LOW_WARNING, lowWarning)
            .putInt(KEY_HIGH_WARNING, highWarning)
            .putInt(KEY_URGENT_HIGH, urgentHigh)
            .putLong(KEY_LAST_FETCHED, System.currentTimeMillis())
            .putString(KEY_SOURCE, ThresholdSource.BACKEND.name)
            .commit()
    }

    /**
     * Persist user-set thresholds from the Settings editor (GLY-145), marking the source
     * LOCAL and arming the floor with no backend. Same guards as [updateAll]; parameter
     * order mirrors the low-to-high band order the editor shows. The caller
     * ([com.glycemicgpt.mobile.presentation.settings.SettingsViewModel]) only offers the
     * editor while no backend is configured -- backend stays master.
     */
    fun updateLocal(urgentLow: Int, lowWarning: Int, highWarning: Int, urgentHigh: Int) {
        requireSafeThresholds(urgentLow, lowWarning, highWarning, urgentHigh)
        prefs.edit()
            .putInt(KEY_URGENT_LOW, urgentLow)
            .putInt(KEY_LOW_WARNING, lowWarning)
            .putInt(KEY_HIGH_WARNING, highWarning)
            .putInt(KEY_URGENT_HIGH, urgentHigh)
            .putString(KEY_SOURCE, ThresholdSource.LOCAL.name)
            // LOCAL values have no backend fetch behind them: reset the timestamp explicitly so
            // a stale one from a previous BACKEND era can't survive under LOCAL values.
            .putLong(KEY_LAST_FETCHED, 0L)
            .commit()
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

    /** Clear BACKEND thresholds, resetting to defaults and disarming the floor. Called on
     *  logout so the floor can never fire off another account's thresholds. LOCAL thresholds
     *  are preserved: they belong to this device, not the account signing out, and wiping
     *  them would silently disarm a user with nothing to restore from. */
    fun clear() {
        if (source == ThresholdSource.BACKEND) {
            prefs.edit().clear().commit()
        }
    }

    /** Returns true if the cached values are older than the given max age (or never synced). */
    fun isStale(maxAgeMs: Long = STALE_THRESHOLD_MS): Boolean {
        val age = System.currentTimeMillis() - lastFetchedMs
        return age > maxAgeMs
    }

    companion object {
        const val DEFAULT_URGENT_LOW = 55
        const val DEFAULT_LOW_WARNING = 70
        const val DEFAULT_HIGH_WARNING = 180
        const val DEFAULT_URGENT_HIGH = 250
        const val STALE_THRESHOLD_MS = 3_600_000L // 1 hour

        private const val KEY_URGENT_LOW = "urgent_low"
        private const val KEY_LOW_WARNING = "low_warning"
        private const val KEY_HIGH_WARNING = "high_warning"
        private const val KEY_URGENT_HIGH = "urgent_high"
        private const val KEY_LAST_FETCHED = "last_fetched_ms"
        private const val KEY_SOURCE = "source"
    }
}
