package com.glycemicgpt.weardevice.util

// MIRROR: tier bounds must stay in sync with the phone's
// app/src/main/java/com/glycemicgpt/mobile/domain/freshness/Freshness.kt (FreshnessPolicy.CGM /
// FreshnessPolicy.PUMP). The wear module deliberately has no dependency on the phone app, so the
// values are mirrored here the same way WearDataContract is; a drift would make the watch call
// the same reading fresher or staler than the phone does.
//
// GLY-116 axis (b): every wrist surface that shows a pushed value (BG, IoB, the last alert)
// ages it against the WATCH's own clock with these tiers, independently of the mirrored
// "watching" status — a dead phone freezes pushes, and only local aging turns that frozen
// snapshot into an honest "no recent data".
object WatchFreshness {

    /** Same three-tier vocabulary as the phone's Freshness enum. */
    enum class Tier { FRESH, STALE, TOO_STALE }

    /** CGM glucose: one missed sensor interval (~6 min) is STALE, three (~15 min) is TOO_STALE. */
    const val CGM_STALE_AFTER_MS = 6 * 60_000L
    const val CGM_TOO_STALE_AFTER_MS = 15 * 60_000L

    /** Pump-state values (IoB): polled slower, looser bounds — 15 min STALE, 60 min TOO_STALE. */
    const val PUMP_STALE_AFTER_MS = 15 * 60_000L
    const val PUMP_TOO_STALE_AFTER_MS = 60 * 60_000L

    /**
     * Fallback decay window for the mirrored monitoring status when a (pre-GLY-116) phone build
     * omits the timeout key: one CGM staleness window, matching what the phone would advertise.
     */
    const val DEFAULT_STATUS_TIMEOUT_MS = CGM_STALE_AFTER_MS

    /**
     * Max future-dating (negative age) tolerated on the mirrored status before it is treated
     * as untrustworthy, mirroring the phone's ALERT_FLOOR_MAX_FUTURE_SKEW_MS. Small negative
     * ages are ROUTINE — surfaces sample "now" on their own cadence, so a status received
     * between ticks reads slightly future-dated; failing those closed would flap the wrist to
     * "no recent data" after every heartbeat. A large negative age means the watch clock
     * jumped backward and the decay clock is meaningless — that fails closed.
     */
    const val STATUS_MAX_FUTURE_SKEW_MS = 60_000L

    /**
     * Half-open boundaries mirroring the phone's FreshnessThresholds.classify: age <
     * [staleAfterMs] is FRESH, age < [tooStaleAfterMs] is STALE, else TOO_STALE. Negative ages
     * (clock skew, future-dated push) read as FRESH — display policy, same as the phone.
     */
    fun classify(ageMs: Long, staleAfterMs: Long, tooStaleAfterMs: Long): Tier = when {
        ageMs < staleAfterMs -> Tier.FRESH
        ageMs < tooStaleAfterMs -> Tier.STALE
        else -> Tier.TOO_STALE
    }

    fun cgmTier(ageMs: Long): Tier = classify(ageMs, CGM_STALE_AFTER_MS, CGM_TOO_STALE_AFTER_MS)

    fun pumpTier(ageMs: Long): Tier = classify(ageMs, PUMP_STALE_AFTER_MS, PUMP_TOO_STALE_AFTER_MS)
}
