import type uPlot from "uplot";

export const CHART_X_AXIS_SIZE_PX = 40;
export const CHART_Y_AXIS_SIZE_PX = 36;
const DAY_SECONDS = 24 * 60 * 60;
const DAY_BAND_OPACITY = 0.2;

function getCalendarDateParts(
  epochSeconds: number,
  timeZone?: string,
): { year: number; month: number; day: number } {
  const date = new Date(epochSeconds * 1000);

  if (!timeZone) {
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
    };
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(date);
  const read = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  return { year: read("year"), month: read("month"), day: read("day") };
}

function getTimeZoneOffsetMs(epochMs: number, timeZone: string): number {
  const date = new Date(epochMs);
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(date);
  const read = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  return (
    Date.UTC(
      read("year"),
      read("month") - 1,
      read("day"),
      read("hour"),
      read("minute"),
      read("second"),
    ) - epochMs
  );
}

function getCalendarDayStart(
  year: number,
  month: number,
  day: number,
  timeZone?: string,
): number {
  if (!timeZone) {
    return new Date(year, month - 1, day).getTime() / 1000;
  }

  const wallTimeMs = Date.UTC(year, month - 1, day);
  let epochMs = wallTimeMs - getTimeZoneOffsetMs(wallTimeMs, timeZone);
  epochMs = wallTimeMs - getTimeZoneOffsetMs(epochMs, timeZone);
  return epochMs / 1000;
}

function getLocalDayOrdinal(epochSeconds: number, timeZone?: string): number {
  const { year, month, day } = getCalendarDateParts(epochSeconds, timeZone);
  return Math.floor(
    Date.UTC(year, month - 1, day) /
      (DAY_SECONDS * 1000),
  );
}

function getLocalDayStart(epochSeconds: number, timeZone?: string): number {
  const { year, month, day } = getCalendarDateParts(epochSeconds, timeZone);
  return getCalendarDayStart(year, month, day, timeZone);
}

function getLocalDayStartFromOrdinal(
  dayOrdinal: number,
  timeZone?: string,
): number {
  const calendarDate = new Date(dayOrdinal * DAY_SECONDS * 1000);
  return getCalendarDayStart(
    calendarDate.getUTCFullYear(),
    calendarDate.getUTCMonth() + 1,
    calendarDate.getUTCDate(),
    timeZone,
  );
}

export function drawAlternatingDayBands(
  chart: uPlot,
  color: string,
  timeZone?: string,
): void {
  const scaleMin = chart.scales.x.min;
  const scaleMax = chart.scales.x.max;

  if (scaleMin == null || scaleMax == null || scaleMax <= scaleMin) {
    return;
  }

  const plotLeft = chart.bbox.left;
  const plotRight = plotLeft + chart.bbox.width;
  const firstDayStart = getLocalDayStart(scaleMin, timeZone);

  chart.ctx.save();
  chart.ctx.fillStyle = color;
  chart.ctx.globalAlpha = DAY_BAND_OPACITY;

  for (let dayStart = firstDayStart; dayStart < scaleMax; ) {
    const dayIndex = getLocalDayOrdinal(dayStart, timeZone);
    const nextDayStart = getLocalDayStartFromOrdinal(dayIndex + 1, timeZone);

    if (Math.abs(dayIndex) % 2 !== 0) {
      dayStart = nextDayStart;
      continue;
    }

    const startPosition = chart.valToPos(dayStart, "x", true);
    const endPosition = chart.valToPos(nextDayStart, "x", true);
    const left = Math.max(plotLeft, Math.min(startPosition, endPosition));
    const right = Math.min(plotRight, Math.max(startPosition, endPosition));

    if (right > left) {
      chart.ctx.fillRect(left, chart.bbox.top, right - left, chart.bbox.height);
    }

    dayStart = nextDayStart;
  }

  chart.ctx.restore();
}

export function formatSharedTimeTick(
  epochSeconds: number,
  multiDay: boolean,
  timeZone?: string,
): string {
  const date = new Date(epochSeconds * 1000);

  if (multiDay) {
    return date.toLocaleDateString([], {
      day: "numeric",
      month: "short",
      timeZone,
    });
  }

  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
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
  return getSharedTimeSplitsForTimeZone(
    chart,
    scaleMin,
    scaleMax,
  );
}

export function getSharedTimeSplitsForTimeZone(
  chart: uPlot,
  scaleMin: number,
  scaleMax: number,
  timeZone?: string,
): number[] {
  const pixelRatio = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const plotWidth = chart.bbox.width / pixelRatio;
  const maxIntervals = Math.max(1, Math.floor(plotWidth / MIN_TIME_GRID_SPACING_PX));
  const minimumIncrement = (scaleMax - scaleMin) / maxIntervals;
  const increment = TIME_GRID_INCREMENTS_SECONDS.find(
    (candidate) => candidate >= minimumIncrement
  ) ?? TIME_GRID_INCREMENTS_SECONDS[TIME_GRID_INCREMENTS_SECONDS.length - 1];

  if (increment >= DAY_SECONDS) {
    const incrementDays = increment / DAY_SECONDS;
    const scaleDayOrdinal = getLocalDayOrdinal(scaleMin, timeZone);
    let splitDayOrdinal =
      Math.ceil(scaleDayOrdinal / incrementDays) * incrementDays;
    let split = getLocalDayStartFromOrdinal(splitDayOrdinal, timeZone);

    if (split < scaleMin) {
      splitDayOrdinal += incrementDays;
      split = getLocalDayStartFromOrdinal(splitDayOrdinal, timeZone);
    }

    const splits: number[] = [];
    while (split <= scaleMax) {
      splits.push(split);
      splitDayOrdinal += incrementDays;
      split = getLocalDayStartFromOrdinal(splitDayOrdinal, timeZone);
    }

    return splits;
  }

  const firstSplit = Math.ceil(scaleMin / increment) * increment;
  const splits: number[] = [];

  for (let split = firstSplit; split <= scaleMax; split += increment) {
    splits.push(split);
  }

  return splits;
}
