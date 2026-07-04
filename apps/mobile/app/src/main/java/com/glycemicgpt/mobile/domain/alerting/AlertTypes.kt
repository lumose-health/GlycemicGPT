package com.glycemicgpt.mobile.domain.alerting

/**
 * The server's alert vocabulary (backend `models/alert.py`), shared by every consumer that keys
 * behavior off an alert's type or severity: [com.glycemicgpt.mobile.service.AlertFloor] emits
 * these, `AlertNotificationManager` routes notification channels by them (a low landing off the
 * DND-bypassing alarm channel is a silent safety downgrade), and the stable notification slot is
 * derived from them. One home so the sides cannot drift apart without a compile error.
 *
 * The watch wire protocol uses different strings (`urgent_low`/`low`/`high`/`urgent_high`) —
 * map via `PumpPollingOrchestrator.SERVER_TO_WATCH_ALERT_TYPE`, never mix the vocabularies.
 */
object AlertTypes {
    const val LOW_URGENT = "low_urgent"
    const val LOW_WARNING = "low_warning"
    const val HIGH_WARNING = "high_warning"
    const val HIGH_URGENT = "high_urgent"
    const val IOB_WARNING = "iob_warning"

    /** Alert types that route to the low-glucose channel (IMPORTANCE_HIGH, bypassDnd, alarm). */
    val LOW_ALERT_TYPES = listOf(LOW_URGENT, LOW_WARNING)

    /** Alert types that route to the high-glucose channel. */
    val HIGH_ALERT_TYPES = listOf(HIGH_WARNING, HIGH_URGENT)
}

/** Server severity wire values (backend `AlertSeverity`) used where the mobile side constructs
 *  or branches on severities. */
object AlertSeverities {
    const val WARNING = "warning"
    const val URGENT = "urgent"
    const val EMERGENCY = "emergency"
}
