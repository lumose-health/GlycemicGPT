package com.glycemicgpt.weardevice.complications

import androidx.wear.watchface.complications.data.ComplicationData
import androidx.wear.watchface.complications.data.ComplicationText
import androidx.wear.watchface.complications.data.ComplicationType
import androidx.wear.watchface.complications.data.CountUpTimeReference
import androidx.wear.watchface.complications.data.LongTextComplicationData
import androidx.wear.watchface.complications.data.NoDataComplicationData
import androidx.wear.watchface.complications.data.PlainComplicationText
import androidx.wear.watchface.complications.data.ShortTextComplicationData
import androidx.wear.watchface.complications.data.TimeDifferenceComplicationText
import androidx.wear.watchface.complications.data.TimeDifferenceStyle
import androidx.wear.watchface.complications.datasource.ComplicationRequest
import androidx.wear.watchface.complications.datasource.SuspendingComplicationDataSourceService
import com.glycemicgpt.weardevice.data.WatchDataRepository
import com.glycemicgpt.weardevice.util.GlucoseDisplayUtils
import com.glycemicgpt.weardevice.util.GlucoseUnit
import com.glycemicgpt.weardevice.util.WatchFreshness
import java.time.Instant
import java.util.concurrent.TimeUnit

class BgComplicationDataSource : SuspendingComplicationDataSourceService() {

    override fun getPreviewData(type: ComplicationType): ComplicationData {
        // Show the sample reading in the user's configured unit so the picker preview
        // matches what they will actually see (defaults to mg/dL before any sync).
        WatchDataRepository.init(applicationContext)
        val unit = WatchDataRepository.glucoseUnit.value
        val sample = GlucoseDisplayUtils.formatGlucose(PREVIEW_MG_DL, unit)
        val sampleWithLabel = GlucoseDisplayUtils.formatWithLabel(PREVIEW_MG_DL, unit)

        val text = PlainComplicationText.Builder("$sample \u2192").build()
        val title = PlainComplicationText.Builder("BG").build()
        val description = PlainComplicationText.Builder("Blood Glucose: $sampleWithLabel").build()

        return when (type) {
            ComplicationType.SHORT_TEXT ->
                ShortTextComplicationData.Builder(text = text, contentDescription = description)
                    .setTitle(title)
                    .build()
            ComplicationType.LONG_TEXT ->
                LongTextComplicationData.Builder(
                    text = PlainComplicationText.Builder("BG: $sampleWithLabel \u2192").build(),
                    contentDescription = description,
                )
                    .setTitle(title)
                    .build()
            else -> NoDataComplicationData()
        }
    }

    override suspend fun onComplicationRequest(request: ComplicationRequest): ComplicationData {
        WatchDataRepository.init(applicationContext)
        val unit = WatchDataRepository.glucoseUnit.value
        val cgmState = WatchDataRepository.cgm.value
        val render = render(cgmState, System.currentTimeMillis(), unit)

        val text = PlainComplicationText.Builder(render.shortText).build()
        val description = PlainComplicationText.Builder(render.description).build()

        // Use TimeDifferenceComplicationText so the system efficiently updates
        // the "Xm ago" display without waking our service. Kept in every tier that has a
        // reading at all: for TOO_STALE the age is the only honest thing left to show.
        val title: ComplicationText = if (render.ageReferenceMs != null) {
            TimeDifferenceComplicationText.Builder(
                TimeDifferenceStyle.SHORT_SINGLE_UNIT,
                CountUpTimeReference(Instant.ofEpochMilli(render.ageReferenceMs)),
            )
                .setMinimumTimeUnit(TimeUnit.MINUTES)
                .build()
        } else {
            PlainComplicationText.Builder("BG").build()
        }

        return when (request.complicationType) {
            ComplicationType.SHORT_TEXT ->
                ShortTextComplicationData.Builder(text = text, contentDescription = description)
                    .setTitle(title)
                    .build()
            ComplicationType.LONG_TEXT ->
                LongTextComplicationData.Builder(
                    text = PlainComplicationText.Builder(render.longText).build(),
                    contentDescription = description,
                )
                    .setTitle(title)
                    .build()
            else -> NoDataComplicationData()
        }
    }

    /** What the complication shows for a given cached reading + now. Pure so the tier
     *  boundaries are unit-testable without a service context. */
    internal data class BgRender(
        val shortText: String,
        val longText: String,
        val description: String,
        /** Timestamp the "Xm ago" count-up title runs from, or null with no reading at all. */
        val ageReferenceMs: Long?,
    )

    internal companion object {
        /** Representative sample value for the complication picker preview. */
        const val PREVIEW_MG_DL = 120

        /**
         * GLY-116 axis (b): the shown value ages on the shared three-tier policy against the
         * WATCH's own clock — deliberately no coverage/"watching" input, so a stale feed greys
         * even while the mirrored status still says ServerActive (the decoupled-source case).
         * STALE de-emphasises with a "?" marker instead of rendering confident-live until the
         * 15-min hard cap; TOO_STALE drops the number but keeps the age counting — "--" with
         * no context was never actionable.
         */
        fun render(
            cgmState: WatchDataRepository.CgmState?,
            nowMs: Long,
            unit: GlucoseUnit,
        ): BgRender {
            val valid = cgmState?.takeIf { GlucoseDisplayUtils.isValidGlucose(it.mgDl) }
            val tier = valid?.let { WatchFreshness.cgmTier(nowMs - it.timestampMs) }
            val showValue =
                tier == WatchFreshness.Tier.FRESH || tier == WatchFreshness.Tier.STALE
            val staleMark = if (tier == WatchFreshness.Tier.STALE) "?" else ""

            return if (valid != null && showValue) {
                val labeled = GlucoseDisplayUtils.formatWithLabel(valid.mgDl, unit)
                BgRender(
                    shortText = "${GlucoseDisplayUtils.formatGlucose(valid.mgDl, unit)}$staleMark " +
                        GlucoseDisplayUtils.trendSymbol(valid.trend),
                    longText = "BG: $labeled$staleMark ${GlucoseDisplayUtils.trendSymbol(valid.trend)}",
                    description = if (tier == WatchFreshness.Tier.STALE) {
                        "Blood Glucose: $labeled (stale)"
                    } else {
                        "Blood Glucose: $labeled"
                    },
                    ageReferenceMs = valid.timestampMs,
                )
            } else {
                BgRender(
                    shortText = "--",
                    longText = "BG: --",
                    description = "No recent data",
                    ageReferenceMs = valid?.timestampMs,
                )
            }
        }
    }
}
