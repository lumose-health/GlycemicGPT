import type uPlot from "uplot";

export const CHART_Y_AXIS_SIZE_PX = 36;

export function formatSharedTimeTick(
  epochSeconds: number,
  multiDay: boolean
): string {
  const date = new Date(epochSeconds * 1000);

  if (multiDay) {
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

const MIN_TIME_GRID_SPACING_PX = 72;
const TIME_GRID_INCREMENTS_SECONDS = [
  5 * 60,
  10 * 60,
  15 * 60,
  30 * 60,
  60 * 60,
  2 * 60 * 60,
  3 * 60 * 60,
  4 * 60 * 60,
  6 * 60 * 60,
  12 * 60 * 60,
  24 * 60 * 60,
  2 * 24 * 60 * 60,
  3 * 24 * 60 * 60,
  7 * 24 * 60 * 60,
  14 * 24 * 60 * 60,
  30 * 24 * 60 * 60,
];

export function getSharedTimeSplits(
  chart: uPlot,
  _axisIndex: number,
  scaleMin: number,
  scaleMax: number
): number[] {
  const pixelRatio = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const plotWidth = chart.bbox.width / pixelRatio;
  const maxIntervals = Math.max(1, Math.floor(plotWidth / MIN_TIME_GRID_SPACING_PX));
  const minimumIncrement = (scaleMax - scaleMin) / maxIntervals;
  const increment = TIME_GRID_INCREMENTS_SECONDS.find(
    (candidate) => candidate >= minimumIncrement
  ) ?? TIME_GRID_INCREMENTS_SECONDS[TIME_GRID_INCREMENTS_SECONDS.length - 1];
  const firstSplit = Math.ceil(scaleMin / increment) * increment;
  const splits: number[] = [];

  for (let split = firstSplit; split <= scaleMax; split += increment) {
    splits.push(split);
  }

  return splits;
}
