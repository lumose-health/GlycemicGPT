import type uPlot from "uplot";

export const CHART_X_AXIS_SIZE_PX = 40;
export const CHART_Y_AXIS_SIZE_PX = 36;
const DAY_SECONDS = 24 * 60 * 60;
const DAY_BAND_OPACITY = 0.2;

export function drawAlternatingDayBands(chart: uPlot, color: string): void {
  const scaleMin = chart.scales.x.min;
  const scaleMax = chart.scales.x.max;

  if (scaleMin == null || scaleMax == null || scaleMax <= scaleMin) {
    return;
  }

  const plotLeft = chart.bbox.left;
  const plotRight = plotLeft + chart.bbox.width;
  const firstDayStart = Math.floor(scaleMin / DAY_SECONDS) * DAY_SECONDS;

  chart.ctx.save();
  chart.ctx.fillStyle = color;
  chart.ctx.globalAlpha = DAY_BAND_OPACITY;

  for (
    let dayStart = firstDayStart;
    dayStart < scaleMax;
    dayStart += DAY_SECONDS
  ) {
    const dayIndex = Math.floor(dayStart / DAY_SECONDS);

    if (Math.abs(dayIndex) % 2 !== 0) {
      continue;
    }

    const startPosition = chart.valToPos(dayStart, "x", true);
    const endPosition = chart.valToPos(dayStart + DAY_SECONDS, "x", true);
    const left = Math.max(plotLeft, Math.min(startPosition, endPosition));
    const right = Math.min(plotRight, Math.max(startPosition, endPosition));

    if (right > left) {
      chart.ctx.fillRect(left, chart.bbox.top, right - left, chart.bbox.height);
    }
  }

  chart.ctx.restore();
}

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
