package com.glycemicgpt.weardevice.complications

import androidx.wear.watchface.complications.data.ComplicationData
import androidx.wear.watchface.complications.data.ComplicationType
import androidx.wear.watchface.complications.data.LongTextComplicationData
import androidx.wear.watchface.complications.data.NoDataComplicationData
import androidx.wear.watchface.complications.data.PlainComplicationText
import androidx.wear.watchface.complications.data.ShortTextComplicationData
import androidx.wear.watchface.complications.datasource.ComplicationRequest
import androidx.wear.watchface.complications.datasource.SuspendingComplicationDataSourceService
import com.glycemicgpt.weardevice.data.WatchDataRepository
import com.glycemicgpt.weardevice.util.WatchFreshness

class IoBComplicationDataSource : SuspendingComplicationDataSourceService() {

    override fun getPreviewData(type: ComplicationType): ComplicationData {
        val text = PlainComplicationText.Builder("2.45").build()
        val title = PlainComplicationText.Builder("IoB").build()
        val description = PlainComplicationText.Builder("Insulin on Board: 2.45 units").build()

        return when (type) {
            ComplicationType.SHORT_TEXT ->
                ShortTextComplicationData.Builder(text = text, contentDescription = description)
                    .setTitle(title)
                    .build()
            ComplicationType.LONG_TEXT ->
                LongTextComplicationData.Builder(
                    text = PlainComplicationText.Builder("IoB: 2.45 units").build(),
                    contentDescription = description,
                )
                    .setTitle(title)
                    .build()
            else -> NoDataComplicationData()
        }
    }

    override suspend fun onComplicationRequest(request: ComplicationRequest): ComplicationData {
        if (!WatchDataRepository.watchFaceConfig.value.showIoB) {
            return NoDataComplicationData()
        }
        val render = render(WatchDataRepository.iob.value, System.currentTimeMillis())
        val iobText = render.text
        val descriptionText = render.description

        val text = PlainComplicationText.Builder(iobText).build()
        val title = PlainComplicationText.Builder("IoB").build()
        val description = PlainComplicationText.Builder(descriptionText).build()

        return when (request.complicationType) {
            ComplicationType.SHORT_TEXT ->
                ShortTextComplicationData.Builder(text = text, contentDescription = description)
                    .setTitle(title)
                    .build()
            ComplicationType.LONG_TEXT ->
                LongTextComplicationData.Builder(
                    text = PlainComplicationText.Builder("IoB: $iobText units").build(),
                    contentDescription = description,
                )
                    .setTitle(title)
                    .build()
            else -> NoDataComplicationData()
        }
    }

    /** What the complication shows for a cached IoB + now. Pure for boundary unit tests. */
    internal data class IoBRender(val text: String, val description: String)

    internal companion object {
        /**
         * GLY-116 axis (b): IoB decays fast enough that an hour-old value presented as current
         * is dosing-relevant misinformation. Age against the watch clock on the shared PUMP
         * policy: STALE (>=15 min) keeps the value with a "?" marker, TOO_STALE (>=60 min)
         * drops it — never an unbounded render.
         */
        fun render(iobState: WatchDataRepository.IoBState?, nowMs: Long): IoBRender {
            val tier = iobState?.let { WatchFreshness.pumpTier(nowMs - it.timestampMs) }
            val showValue =
                tier == WatchFreshness.Tier.FRESH || tier == WatchFreshness.Tier.STALE
            if (iobState == null || !showValue) {
                return IoBRender(text = "--", description = "No recent data")
            }
            val staleMark = if (tier == WatchFreshness.Tier.STALE) "?" else ""
            val text = "%.2f%s".format(iobState.iob, staleMark)
            return IoBRender(
                text = text,
                description = if (tier == WatchFreshness.Tier.STALE) {
                    "Insulin on Board: %.2f units (stale)".format(iobState.iob)
                } else {
                    "Insulin on Board: $text units"
                },
            )
        }
    }
}
