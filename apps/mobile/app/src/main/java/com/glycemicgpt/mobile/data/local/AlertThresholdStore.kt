package com.glycemicgpt.mobile.data.local

import android.content.Context
import android.content.SharedPreferences
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Local cache of the user's server-side alert thresholds (the `alert_thresholds` table the
 * backend's alert engine fires from), fetched via `GET /api/settings/alert-thresholds`.
 *
 * This is what the on-device alert floor fires from, so it must match the server exactly:
 * sync-only, like [SafetyLimitsStore] -- the mobile app NEVER allows local override; only
 * [updateAll] from backend sync is permitted. These are deliberately distinct from
 * [GlucoseRangeStore] (the *display* target range): the two tables are user-editable
 * independently, and a safety floor firing at display-range values instead of the user's real
 * alert thresholds would alarm at the wrong glucose levels and desync from the server.
 *
 * The defaults mirror the backend's `AlertThreshold` column defaults but exist only for the
 * watch alert relay -- the alert floor never fires until [isSynced] is true (GLY-115: never
 * alarm off guessed thresholds).
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

    /** True once the thresholds have been fetched from the backend at least once. The alert
     *  floor is gated on this -- it must never fire off the hardcoded defaults. */
    fun isSynced(): Boolean = lastFetchedMs != 0L

    /**
     * Atomically update all four thresholds plus the fetch timestamp in a single
     * SharedPreferences transaction. Only called from backend sync; the caller
     * ([com.glycemicgpt.mobile.data.repository.AuthRepository]) validates range and ordering
     * before persisting.
     */
    fun updateAll(urgentLow: Int, lowWarning: Int, highWarning: Int, urgentHigh: Int) {
        prefs.edit()
            .putInt(KEY_URGENT_LOW, urgentLow)
            .putInt(KEY_LOW_WARNING, lowWarning)
            .putInt(KEY_HIGH_WARNING, highWarning)
            .putInt(KEY_URGENT_HIGH, urgentHigh)
            .putLong(KEY_LAST_FETCHED, System.currentTimeMillis())
            .commit()
    }

    /** Clear all cached thresholds, resetting to defaults and un-syncing. Called on logout so
     *  the floor can never fire off another account's thresholds. */
    fun clear() {
        prefs.edit().clear().commit()
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
    }
}
