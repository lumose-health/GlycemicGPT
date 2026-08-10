import { formatGlucose, unitLabel } from "@/lib/glucose-units";
import { twMerge } from "@/lib/ui/twMerge";
import { ChartLegendSwatch } from "../ChartLegendSwatch";
import { GlucoseForecastLegend } from "../GlucoseForecast";
import type { MergedChartModel } from "./MergedGlucoseTrendChart.types";
import {
  getVisibleActivityKinds,
  getVisibleMergedDoses,
  isLongActingMergedDose,
} from "./merged-chart-model";

function LegendItem({
  className,
  label,
}: {
  className: string;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <ChartLegendSwatch className={className} />
      <span>{label}</span>
    </span>
  );
}

export function MergedChartLegend({
  className,
  model,
}: {
  className?: string;
  model: MergedChartModel;
}) {
  const activityKinds = getVisibleActivityKinds({
    activityIntervals: model.activityIntervals,
    domain: model.fullDomain,
    suspensionIntervals: model.suspensionIntervals,
  });
  const visibleDoses = getVisibleMergedDoses(model.doses, model.fullDomain);
  const hasLongActing = visibleDoses.some(isLongActingMergedDose);
  const low = formatGlucose(model.thresholds.low, model.unit);
  const high = formatGlucose(model.thresholds.high, model.unit);

  return (
    <div
      className={twMerge(
        "flex flex-wrap gap-x-3 gap-y-2 font_metric_caption text-foreground-secondary",
        className
      )}
      aria-label="Merged chart labels"
      role="group"
    >

      <LegendItem
        className="border border-signal-check-fill bg-signal-check-fill/15"
        label={`Glucose target ${low} to ${high} (${unitLabel(model.unit)})`}
      />
      <LegendItem
        className="border border-signal-warning-fill bg-signal-warning-fill/15"
        label="High or low"
      />
      <LegendItem
        className="border border-signal-error-fill bg-signal-error-fill/15"
        label="Urgent high or low"
      />
      <GlucoseForecastLegend
        eligible={model.forecastEligible}
        forecast={model.forecast}
        points={model.forecastPoints}
      />
      {model.hasPump ? (
        <LegendItem
          className="border border-data-insulin-basal bg-data-insulin-basal/15"
          label="Pump basal (U/hr)"
        />
      ) : null}
      <LegendItem
        className="rounded-pill bg-data-insulin-bolus"
        label="Manual bolus (U)"
      />
      <LegendItem
        className="rotate-45 rounded-none bg-data-insulin-correction"
        label="Automated correction (U)"
      />
      {hasLongActing ? (
        <LegendItem
          className="rounded-pill border border-data-insulin-bolus bg-transparent"
          label="Long acting injection (U)"
        />
      ) : null}
      {activityKinds.includes("sleep") ? (
        <LegendItem
          className="border border-data-insulin-mode-sleep bg-data-insulin-mode-sleep/15"
          label="Sleep"
        />
      ) : null}
      {activityKinds.includes("exercise") ? (
        <LegendItem
          className="border border-data-insulin-mode-exercise bg-data-insulin-mode-exercise/15"
          label="Exercise"
        />
      ) : null}
      {activityKinds.includes("suspension") ? (
        <LegendItem
          className="border border-signal-error-fill bg-signal-error-fill/15"
          label="Pump suspended"
        />
      ) : null}
    </div>
  );
}
