package com.glycemicgpt.weardevice.complications

import android.app.PendingIntent
import android.content.Intent
import android.graphics.drawable.Icon
import androidx.wear.watchface.complications.data.ComplicationData
import androidx.wear.watchface.complications.data.ComplicationType
import androidx.wear.watchface.complications.data.NoDataComplicationData
import androidx.wear.watchface.complications.data.PlainComplicationText
import androidx.wear.watchface.complications.data.SmallImage
import androidx.wear.watchface.complications.data.SmallImageComplicationData
import androidx.wear.watchface.complications.data.SmallImageType
import androidx.wear.watchface.complications.datasource.ComplicationRequest
import androidx.wear.watchface.complications.datasource.SuspendingComplicationDataSourceService
import com.glycemicgpt.weardevice.R
import com.glycemicgpt.weardevice.data.WatchDataRepository
import com.glycemicgpt.weardevice.presentation.AlertsActivity
import com.glycemicgpt.weardevice.util.GlucoseDisplayUtils
import com.glycemicgpt.weardevice.util.WatchFreshness

class AlertsComplicationDataSource : SuspendingComplicationDataSourceService() {

    override fun getPreviewData(type: ComplicationType): ComplicationData {
        if (type != ComplicationType.SMALL_IMAGE) return NoDataComplicationData()
        val icon = Icon.createWithResource(this, R.drawable.ic_complication_bell)
        icon.setTint(COLOR_DEFAULT)
        return SmallImageComplicationData.Builder(
            smallImage = SmallImage.Builder(icon, SmallImageType.PHOTO).build(),
            contentDescription = PlainComplicationText.Builder("Alerts").build(),
        ).build()
    }

    override suspend fun onComplicationRequest(request: ComplicationRequest): ComplicationData {
        if (request.complicationType != ComplicationType.SMALL_IMAGE) {
            return NoDataComplicationData()
        }

        // init: this complication previously read the repository StateFlows without ensuring
        // the persisted state was restored after a process restart (BG already init-ed).
        WatchDataRepository.init(applicationContext)
        val now = System.currentTimeMillis()
        val render = render(
            alert = WatchDataRepository.alert.value,
            coverage = WatchDataRepository.coverageFrom(
                WatchDataRepository.monitoringStatus.value,
                now,
            ),
            nowMs = now,
        )

        val icon = Icon.createWithResource(this, R.drawable.ic_complication_bell)
        icon.setTint(render.tint)
        val description = render.description

        val tapIntent = Intent(this, AlertsActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        }
        val tapAction = PendingIntent.getActivity(
            this,
            ALERTS_REQUEST_CODE,
            tapIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        return SmallImageComplicationData.Builder(
            smallImage = SmallImage.Builder(icon, SmallImageType.PHOTO).build(),
            contentDescription = PlainComplicationText.Builder(description).build(),
        )
            .setTapAction(tapAction)
            .build()
    }

    /** Bell tint + description for a given alert/coverage snapshot. Pure for unit tests. */
    internal data class AlertsRender(val tint: Int, val description: String)

    internal companion object {
        const val ALERTS_REQUEST_CODE = 2001
        const val COLOR_DEFAULT = 0xFF9CA3AF.toInt()   // Grey
        const val COLOR_WARNING = 0xFFFBBF24.toInt()    // Yellow
        const val COLOR_URGENT = 0xFFEF4444.toInt()     // Red

        /**
         * GLY-116: a shown alert is aged on the watch clock (axis b) — once its reading is
         * TOO_STALE it renders as historical ("as of Xm ago"), grey, not active-indefinitely.
         * With no alert showing, the quiet grey bell is reserved for a current "watching"
         * claim (axis a); any degraded/unknown coverage turns the bell amber so the glance
         * says something may not be watching.
         */
        fun render(
            alert: WatchDataRepository.AlertState?,
            coverage: WatchDataRepository.WristCoverage,
            nowMs: Long,
        ): AlertsRender {
            val hasActiveAlert = alert != null && !alert.type.equals("none", ignoreCase = true)
            val isUrgent = alert?.type?.startsWith("urgent", ignoreCase = true) == true
            val alertAgeMs = alert?.let { nowMs - it.timestampMs }
            val alertIsStale = alertAgeMs != null &&
                WatchFreshness.cgmTier(alertAgeMs) == WatchFreshness.Tier.TOO_STALE

            val tint = when {
                hasActiveAlert && alertIsStale -> COLOR_DEFAULT
                isUrgent -> COLOR_URGENT
                hasActiveAlert -> COLOR_WARNING
                coverage !is WatchDataRepository.WristCoverage.Watching -> COLOR_WARNING
                else -> COLOR_DEFAULT
            }
            val description = when {
                hasActiveAlert && alertIsStale ->
                    "Alert as of ${GlucoseDisplayUtils.formatAge(alertAgeMs!!)} — data stale"
                isUrgent -> "Urgent alert active"
                hasActiveAlert -> "Alert active (${GlucoseDisplayUtils.formatAge(alertAgeMs!!)})"
                coverage is WatchDataRepository.WristCoverage.NotWatching ->
                    "Monitoring degraded — not watching"
                coverage is WatchDataRepository.WristCoverage.NoRecentStatus ->
                    "No recent data from phone"
                else -> "No active alerts"
            }
            return AlertsRender(tint, description)
        }
    }
}
