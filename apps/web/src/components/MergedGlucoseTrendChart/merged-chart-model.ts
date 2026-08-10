import type { GlucoseHistoryReading } from "@/lib/api";
import { mapBackendTrendToFrontend } from "@/hooks/use-glucose-stream";
import type { GlucoseUnit } from "@/lib/glucose-units";
import { isValidGlucoseMgdl } from "@/lib/glucose-classification";
import type { GlucoseForecastPoint } from "@/components/GlucoseForecast";
import type {
  MergedActivityKind,
  MergedDoseEvent,
  MergedDoseMarkerLayout,
  MergedGlucosePoint,
} from "./MergedGlucoseTrendChart.types";
import type {
  PumpActivityInterval,
  PumpBasalSegment,
  PumpSuspensionInterval,
} from "@/components/InsulinTimeline/insulin-timeline-data";

const DEFAULT_GLUCOSE_DOMAIN: [number, number] = [40, 300];

export function transformMergedGlucoseReadings(
  readings: readonly GlucoseHistoryReading[]
): MergedGlucosePoint[] {
  return readings
    .filter((reading) => isValidGlucoseMgdl(reading.value))
    .map((reading) => ({
      timestampMs: new Date(reading.reading_timestamp).getTime(),
      trend: mapBackendTrendToFrontend(reading.trend),
      valueMgDl: reading.value,
    }))
    .filter((point) => Number.isFinite(point.timestampMs))
    .sort((left, right) => left.timestampMs - right.timestampMs);
}

export function resolveMergedGlucoseDomain(
  points: readonly MergedGlucosePoint[],
  lowThreshold: number,
  highThreshold: number,
  forecastPoints: readonly GlucoseForecastPoint[] = [],
): [number, number] {
  let minimum = Math.min(lowThreshold, highThreshold);
  let maximum = Math.max(lowThreshold, highThreshold);

  for (const point of points) {
    minimum = Math.min(minimum, point.valueMgDl);
    maximum = Math.max(maximum, point.valueMgDl);
  }

  for (const point of forecastPoints) {
    minimum = Math.min(minimum, point.valueMgDl);
    maximum = Math.max(maximum, point.valueMgDl);
  }

  return [
    Math.min(DEFAULT_GLUCOSE_DOMAIN[0], minimum - 10),
    Math.max(DEFAULT_GLUCOSE_DOMAIN[1], maximum + 10),
  ];
}

export function resolveMergedBasalDomain(
  segments: readonly PumpBasalSegment[],
  domain: [number, number]
): [number, number] {
  const maximum = segments.reduce((current, segment) => {
    if (segment.endMs <= domain[0] || segment.startMs >= domain[1]) {
      return current;
    }

    return Math.max(current, segment.rateUnitsPerHour);
  }, 0);
  const upperBound = Math.ceil(Math.max(1, maximum * 1.15) * 2) / 2;

  return [0, upperBound];
}

export function getMergedDoseUnits(event: MergedDoseEvent): number {
  return "deliveredUnits" in event
    ? event.deliveredUnits
    : event.injectedUnits;
}

export function getMergedDoseLabel(event: MergedDoseEvent): string {
  if (!("deliveredUnits" in event)) {
    return "Long acting injection";
  }

  return event.kind === "automated_correction"
    ? "Automated correction"
    : "Manual bolus";
}

export function formatMergedDoseUnits(event: MergedDoseEvent): string {
  const units = getMergedDoseUnits(event);
  return Number.isInteger(units) ? units.toFixed(0) : units.toFixed(1);
}

export function isAutomatedMergedDose(event: MergedDoseEvent): boolean {
  return "deliveredUnits" in event && event.kind === "automated_correction";
}

export function isLongActingMergedDose(event: MergedDoseEvent): boolean {
  return !("deliveredUnits" in event);
}

export function getVisibleMergedDoses(
  doses: readonly MergedDoseEvent[],
  domain: [number, number]
): MergedDoseEvent[] {
  return doses.filter(
    (dose) => dose.timestampMs >= domain[0] && dose.timestampMs <= domain[1]
  );
}

export function layoutMergedDoseMarkers({
  domain,
  doses,
  markerWidth = 48,
  maxRows = 4,
  plotWidth,
}: {
  domain: [number, number];
  doses: readonly MergedDoseEvent[];
  markerWidth?: number;
  maxRows?: number;
  plotWidth: number;
}): MergedDoseMarkerLayout[] {
  const duration = Math.max(1, domain[1] - domain[0]);
  const gap = 2;
  const availableRows = Math.max(1, Math.floor(maxRows));
  const rowEnds = Array<number>(availableRows).fill(Number.NEGATIVE_INFINITY);

  return getVisibleMergedDoses(doses, domain)
    .sort((left, right) => left.timestampMs - right.timestampMs)
    .map((event) => {
      const center = ((event.timestampMs - domain[0]) / duration) * plotWidth;
      const left = Math.max(0, Math.min(plotWidth - markerWidth, center - markerWidth / 2));
      let row = rowEnds.findIndex((end) => end + gap <= left);

      if (row === -1) {
        row = availableRows - 1;
      }

      rowEnds[row] = left + markerWidth;
      return { event, left, row };
    });
}

export function getVisibleActivityKinds({
  activityIntervals,
  domain,
  suspensionIntervals,
}: {
  activityIntervals: readonly PumpActivityInterval[];
  domain: [number, number];
  suspensionIntervals: readonly PumpSuspensionInterval[];
}): MergedActivityKind[] {
  const kinds: MergedActivityKind[] = [];
  const intersects = (startMs: number, endMs: number) =>
    endMs > domain[0] && startMs < domain[1];

  if (
    activityIntervals.some(
      (interval) => interval.mode === "sleep" && intersects(interval.startMs, interval.endMs)
    )
  ) {
    kinds.push("sleep");
  }

  if (
    activityIntervals.some(
      (interval) => interval.mode === "exercise" && intersects(interval.startMs, interval.endMs)
    )
  ) {
    kinds.push("exercise");
  }

  if (
    suspensionIntervals.some((interval) => intersects(interval.startMs, interval.endMs))
  ) {
    kinds.push("suspension");
  }

  return kinds;
}

export function mergedChartAriaLabel(
  points: readonly MergedGlucosePoint[],
  doses: readonly MergedDoseEvent[],
  basalSegments: readonly PumpBasalSegment[],
  unit: GlucoseUnit,
  forecastPoints: readonly GlucoseForecastPoint[] = [],
): string {
  const glucoseUnit = unit === "mmol" ? "millimoles per litre" : "milligrams per deciliter";
  return forecastPoints.length > 0
    ? `Merged glucose trend with ${points.length} glucose readings in ${glucoseUnit}, ${doses.length} insulin doses, ${basalSegments.length} pump basal segments, and ${forecastPoints.length} forecast values`
    : `Merged glucose trend with ${points.length} glucose readings in ${glucoseUnit}, ${doses.length} insulin doses, and ${basalSegments.length} pump basal segments`;
}
