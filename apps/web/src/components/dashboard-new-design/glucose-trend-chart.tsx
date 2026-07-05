"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import uPlot from "uplot";
import { Icon } from "@/base/Icon";
import type { ForecastReadResponse, GlucoseHistoryReading } from "@/lib/api";
import { type ChartTimePeriod, PERIOD_TO_MS, isMultiDay } from "@/lib/chart-periods";
import { getWindowDurationMs } from "@/lib/glucose/history-selection";
import { serializeTimeRangeClipboardValue } from "@/lib/glucose/time-range-clipboard";
import { formatGlucose, unitLabel, type GlucoseUnit } from "@/lib/glucose-units";
import { twMerge } from "@/lib/ui/twMerge";
import { useGlucoseHistory } from "@/hooks/use-glucose-history";
import { useOptionalDashboardTimeRange } from "./dashboard-time-range-context";
import { GLUCOSE_THRESHOLDS } from "./glucose-hero";
import { TREND_ARROWS, TREND_DESCRIPTIONS, type TrendDirection } from "./trend-arrow";
import { mapBackendTrendToFrontend } from "@/hooks/use-glucose-stream";
import styles from "./glucose-trend-chart.module.css";

const CHART_TARGET_COLOR = "var(--color-signal-check-fill)";
const CHART_WARNING_COLOR = "var(--color-signal-warning-fill)";
const CHART_ERROR_COLOR = "var(--color-signal-error-fill)";
const MIN_GLUCOSE_MGDL = 20;
const MAX_GLUCOSE_MGDL = 500;
const DEFAULT_Y_DOMAIN: [number, number] = [40, 300];
const MIN_ZOOM_SELECT_PX = 8;
const MIN_ZOOM_MS = 15 * 60 * 1000;
const CLICK_DRAG_TOLERANCE_PX = 3;
const AUTO_LINE_MIN_POINT_SPACING_PX = 5;
const POINT_RADIUS = 3;
const LINE_WIDTH = 2;
const TOOLTIP_CURSOR_GAP_PX = 30;
const TOOLTIP_EDGE_PADDING_PX = 8;
const TOOLTIP_MAX_WIDTH_PX = 208;
const TOOLTIP_ESTIMATED_HEIGHT_PX = 116;
const THEME_SCOPE_SELECTOR = [
  ".theme-light",
  ".theme-dark",
  ".theme-light-1",
  ".theme-dark-1",
  ".theme-light-2",
  ".theme-dark-2",
].join(",");

const PERIODS: { value: ChartTimePeriod; label: string }[] = [
  { value: "3h", label: "3H" },
  { value: "6h", label: "6H" },
  { value: "12h", label: "12H" },
  { value: "24h", label: "24H" },
  { value: "3d", label: "3D" },
  { value: "7d", label: "7D" },
  { value: "14d", label: "14D" },
  { value: "30d", label: "30D" },
];

export { PERIOD_TO_MS };

interface ChartPoint {
  timestamp: number;
  value: number;
  color: string;
  iso: string;
  trend: TrendDirection;
  trendRate: number | null;
}

interface GlucoseLinePoint {
  x: number;
  y: number;
  value: number;
}

interface GlucoseLineSegment {
  from: GlucoseLinePoint;
  to: GlucoseLinePoint;
  value: number;
}

interface ChartPalette {
  target: string;
  warning: string;
  error: string;
  axis: string;
  grid: string;
  tick: string;
}

interface RangeStatus {
  label: string;
  swatchClassName: string;
}

interface UplotGlucoseTrendProps {
  ariaLabel: string;
  data: ChartPoint[];
  xDomain: [number, number];
  yDomain: [number, number];
  urgentLowThreshold: number;
  lowThreshold: number;
  highThreshold: number;
  urgentHighThreshold: number;
  unit: GlucoseUnit;
  multiDay: boolean;
  onZoomChange: (domain: [number, number] | null) => void;
}

export interface GlucoseTrendChartProps {
  refreshKey?: number;
  className?: string;
  thresholds?: {
    urgentLow: number;
    low: number;
    high: number;
    urgentHigh: number;
  };
  forecast?: ForecastReadResponse | null;
  unit?: GlucoseUnit;
  embedded?: boolean;
}

export function getPointColor(
  value: number,
  thresholds?: { urgentLow: number; low: number; high: number; urgentHigh: number }
): string {
  const t = thresholds ?? {
    urgentLow: GLUCOSE_THRESHOLDS.URGENT_LOW,
    low: GLUCOSE_THRESHOLDS.LOW,
    high: GLUCOSE_THRESHOLDS.HIGH,
    urgentHigh: GLUCOSE_THRESHOLDS.URGENT_HIGH,
  };

  if (value < t.urgentLow) return CHART_ERROR_COLOR;
  if (value < t.low) return CHART_WARNING_COLOR;
  if (value <= t.high) return CHART_TARGET_COLOR;
  if (value <= t.urgentHigh) return CHART_WARNING_COLOR;
  return CHART_ERROR_COLOR;
}

function transformReadings(
  readings: GlucoseHistoryReading[],
  thresholds?: { urgentLow: number; low: number; high: number; urgentHigh: number }
): ChartPoint[] {
  return readings
    .filter((reading) => reading.value >= MIN_GLUCOSE_MGDL && reading.value <= MAX_GLUCOSE_MGDL)
    .map((reading) => ({
      timestamp: new Date(reading.reading_timestamp).getTime(),
      value: reading.value,
      color: getPointColor(reading.value, thresholds),
      iso: reading.reading_timestamp,
      trend: mapBackendTrendToFrontend(reading.trend),
      trendRate: reading.trend_rate,
    }))
    .filter((point) => Number.isFinite(point.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp);
}

function resolveRenderMode(dataLength: number, width: number): "line" | "points" {
  if (dataLength > Math.max(1, Math.floor(width / AUTO_LINE_MIN_POINT_SPACING_PX))) {
    return "line";
  }

  return "points";
}

function interpolateLinePoint(
  from: GlucoseLinePoint,
  to: GlucoseLinePoint,
  t: number
): GlucoseLinePoint {
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
    value: from.value + (to.value - from.value) * t,
  };
}

function getGlucoseLineSegments(
  points: GlucoseLinePoint[],
  lowThreshold: number,
  highThreshold: number
): GlucoseLineSegment[] {
  const segments: GlucoseLineSegment[] = [];

  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];

    if (
      !Number.isFinite(from.x) ||
      !Number.isFinite(from.y) ||
      !Number.isFinite(to.x) ||
      !Number.isFinite(to.y)
    ) {
      continue;
    }

    const valueDelta = to.value - from.value;
    const crossings = valueDelta === 0
      ? []
      : [lowThreshold, highThreshold]
        .filter((threshold) => (
          (from.value < threshold && to.value > threshold) ||
          (from.value > threshold && to.value < threshold)
        ))
        .map((threshold) => (threshold - from.value) / valueDelta)
        .filter((t) => t > 0 && t < 1)
        .sort((a, b) => a - b);

    const breakpoints = [0, ...crossings, 1];

    for (let breakpointIndex = 0; breakpointIndex < breakpoints.length - 1; breakpointIndex += 1) {
      const fromT = breakpoints[breakpointIndex];
      const toT = breakpoints[breakpointIndex + 1];
      const midpointT = fromT + (toT - fromT) / 2;

      segments.push({
        from: interpolateLinePoint(from, to, fromT),
        to: interpolateLinePoint(from, to, toT),
        value: interpolateLinePoint(from, to, midpointT).value,
      });
    }
  }

  return segments;
}

function resolveCssToken(
  scope: HTMLElement,
  name: string,
  fallback: string,
  seen: ReadonlySet<string> = new Set()
): string {
  if (typeof window === "undefined") {
    return fallback;
  }

  const root = document.documentElement;
  const themeScope = scope.closest(THEME_SCOPE_SELECTOR);
  const candidates = themeScope && themeScope !== root
    ? [scope, themeScope, root]
    : [root, scope];
  const value = candidates
    .map((candidate) => getComputedStyle(candidate).getPropertyValue(name).trim())
    .find(Boolean);

  if (!value) {
    return fallback;
  }

  const variableMatch = value.match(/^var\((--[a-zA-Z0-9-_]+)(?:,\s*(.+))?\)$/);

  if (!variableMatch) {
    return value;
  }

  const [, nextName, nextFallback] = variableMatch;

  if (seen.has(nextName)) {
    return nextFallback ?? fallback;
  }

  return resolveCssToken(
    scope,
    nextName,
    nextFallback ?? fallback,
    new Set([...seen, nextName])
  );
}

function resolveCssColor(
  scope: HTMLElement,
  name: string,
  fallback: string
): string {
  if (typeof document === "undefined") {
    return fallback;
  }

  const tokenValue = resolveCssToken(scope, name, fallback);
  const probe = document.createElement("span");
  probe.style.position = "absolute";
  probe.style.pointerEvents = "none";
  probe.style.visibility = "hidden";
  probe.style.color = tokenValue;

  if (!probe.style.color) {
    return fallback;
  }

  scope.appendChild(probe);

  const resolvedColor = getComputedStyle(probe).color;
  probe.remove();

  return resolvedColor || fallback;
}

function resolveChartPalette(scope: HTMLElement): ChartPalette {
  return {
    target: resolveCssColor(scope, "--color-signal-check-fill", "#2a7643"),
    warning: resolveCssColor(scope, "--color-signal-warning-fill", "#f8c129"),
    error: resolveCssColor(scope, "--color-signal-error-fill", "#cd1d0c"),
    axis: resolveCssColor(scope, "--color-border-hover", "#ced0ce"),
    grid: resolveCssColor(scope, "--color-border-default", "#e6e8e6"),
    tick: resolveCssColor(scope, "--color-foreground-secondary", "#767676"),
  };
}

function getPointCanvasColor(
  value: number,
  thresholds: { urgentLow: number; low: number; high: number; urgentHigh: number },
  palette: ChartPalette
): string {
  if (value < thresholds.urgentLow) return palette.error;
  if (value < thresholds.low) return palette.warning;
  if (value <= thresholds.high) return palette.target;
  if (value <= thresholds.urgentHigh) return palette.warning;
  return palette.error;
}

function getRangeStatus(
  value: number,
  thresholds: { urgentLow: number; low: number; high: number; urgentHigh: number },
  unit: GlucoseUnit
): RangeStatus {
  if (value < thresholds.urgentLow || value > thresholds.urgentHigh) {
    return {
      label: "Urgent",
      swatchClassName: "bg-signal-error-fill",
    };
  }

  if (value < thresholds.low || value > thresholds.high) {
    return {
      label: "High/Low",
      swatchClassName: "bg-signal-warning-fill",
    };
  }

  return {
    label: `${formatGlucose(thresholds.low, unit)}-${formatGlucose(thresholds.high, unit)} ${unitLabel(unit)} Target`,
    swatchClassName: "bg-signal-check-fill",
  };
}

function getTooltipPosition({
  cursorLeft,
  cursorTop,
  chartWidth,
  chartHeight,
}: {
  cursorLeft: number;
  cursorTop: number;
  chartWidth: number;
  chartHeight: number;
}): { left: number; top: number } {
  const preferredLeft = cursorLeft + TOOLTIP_CURSOR_GAP_PX;
  const maxRightPosition = Math.max(
    TOOLTIP_EDGE_PADDING_PX,
    chartWidth - TOOLTIP_MAX_WIDTH_PX - TOOLTIP_EDGE_PADDING_PX
  );
  const preferredTop = cursorTop + TOOLTIP_CURSOR_GAP_PX;
  const maxLowerPosition = Math.max(
    TOOLTIP_EDGE_PADDING_PX,
    chartHeight - TOOLTIP_ESTIMATED_HEIGHT_PX - TOOLTIP_EDGE_PADDING_PX
  );
  const left = preferredLeft <= maxRightPosition
    ? preferredLeft
    : Math.max(
      TOOLTIP_EDGE_PADDING_PX,
      cursorLeft - TOOLTIP_MAX_WIDTH_PX - TOOLTIP_CURSOR_GAP_PX
    );
  const top = preferredTop <= maxLowerPosition
    ? preferredTop
    : Math.max(
      TOOLTIP_EDGE_PADDING_PX,
      cursorTop - TOOLTIP_ESTIMATED_HEIGHT_PX - TOOLTIP_CURSOR_GAP_PX
    );

  return {
    left,
    top,
  };
}

function drawTargetRange(
  chart: uPlot,
  lowThreshold: number,
  highThreshold: number,
  palette: ChartPalette
): void {
  const yLow = chart.valToPos(lowThreshold, "y", true);
  const yHigh = chart.valToPos(highThreshold, "y", true);
  const top = Math.min(yHigh, yLow);
  const height = Math.abs(yLow - yHigh);

  if (height <= 0) {
    return;
  }

  chart.ctx.save();
  chart.ctx.globalAlpha = 0.08;
  chart.ctx.fillStyle = palette.target;
  chart.ctx.fillRect(chart.bbox.left, top, chart.bbox.width, height);
  chart.ctx.restore();
}

function drawThresholdLines(
  chart: uPlot,
  lowThreshold: number,
  highThreshold: number,
  palette: ChartPalette
): void {
  const left = chart.bbox.left;
  const right = chart.bbox.left + chart.bbox.width;

  chart.ctx.save();
  chart.ctx.setLineDash([4, 4]);
  chart.ctx.lineWidth = 1;

  for (const threshold of [lowThreshold, highThreshold]) {
    const y = chart.valToPos(threshold, "y", true);
    chart.ctx.strokeStyle = palette.warning;
    chart.ctx.beginPath();
    chart.ctx.moveTo(left, y);
    chart.ctx.lineTo(right, y);
    chart.ctx.stroke();
  }

  chart.ctx.restore();
}

function drawGlucoseLineSegments(
  chart: uPlot,
  segments: GlucoseLineSegment[],
  thresholds: { urgentLow: number; low: number; high: number; urgentHigh: number },
  palette: ChartPalette
): void {
  const pixelRatio = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;

  chart.ctx.save();
  chart.ctx.lineCap = "round";
  chart.ctx.lineJoin = "round";
  chart.ctx.lineWidth = LINE_WIDTH * pixelRatio;

  for (const segment of segments) {
    const fromX = chart.valToPos(segment.from.x, "x", true);
    const fromY = chart.valToPos(segment.from.y, "y", true);
    const toX = chart.valToPos(segment.to.x, "x", true);
    const toY = chart.valToPos(segment.to.y, "y", true);

    if (
      !Number.isFinite(fromX) ||
      !Number.isFinite(fromY) ||
      !Number.isFinite(toX) ||
      !Number.isFinite(toY)
    ) {
      continue;
    }

    chart.ctx.strokeStyle = getPointCanvasColor(segment.value, thresholds, palette);
    chart.ctx.beginPath();
    chart.ctx.moveTo(fromX, fromY);
    chart.ctx.lineTo(toX, toY);
    chart.ctx.stroke();
  }

  chart.ctx.restore();
}

function drawReadingPoints(
  chart: uPlot,
  points: ChartPoint[],
  mode: "all" | "none",
  thresholds: { urgentLow: number; low: number; high: number; urgentHigh: number },
  palette: ChartPalette
): void {
  if (mode === "none") {
    return;
  }

  const pixelRatio = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const xs = chart.data[0];
  const ys = chart.data[1];

  chart.ctx.save();

  for (let index = 0; index < xs.length; index += 1) {
    const yValue = ys[index];

    if (yValue == null) {
      continue;
    }

    const x = chart.valToPos(xs[index], "x", true);
    const y = chart.valToPos(yValue, "y", true);

    chart.ctx.fillStyle = points[index]
      ? getPointCanvasColor(points[index].value, thresholds, palette)
      : palette.target;
    chart.ctx.beginPath();
    chart.ctx.arc(x, y, POINT_RADIUS * pixelRatio, 0, Math.PI * 2);
    chart.ctx.fill();
  }

  chart.ctx.restore();
}

function formatXTick(epochSeconds: number, multiDay: boolean): string {
  const date = new Date(epochSeconds * 1000);

  if (multiDay) {
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatTooltipTime(timestamp: number, multiDay: boolean): string {
  const date = new Date(timestamp);

  if (multiDay) {
    return `${date.toLocaleDateString([], { month: "short", day: "numeric" })} ${date.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    })}`;
  }

  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function PeriodSelector({
  selected,
  onSelect,
}: {
  selected: ChartTimePeriod;
  onSelect: (period: ChartTimePeriod) => void;
}) {
  return (
    <div
      className="flex w-full max-w-full gap-1 overflow-x-auto rounded-lg bg-surface-secondary p-1 sm:w-auto"
      role="radiogroup"
      aria-label="Time period"
    >
      {PERIODS.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={selected === value}
          onClick={() => onSelect(value)}
          className={twMerge(
            "shrink-0 rounded-md px-2.5 py-1 font_body_3 transition-colors sm:px-3",
            selected === value
              ? "bg-surface-tertiary text-foreground-primary"
              : "text-foreground-secondary hover:text-foreground-primary"
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function UplotGlucoseTrend({
  ariaLabel,
  data,
  xDomain,
  yDomain,
  urgentLowThreshold,
  lowThreshold,
  highThreshold,
  urgentHighThreshold,
  unit,
  multiDay,
  onZoomChange,
}: UplotGlucoseTrendProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<uPlot | null>(null);
  const dataRef = useRef(data);
  const onZoomChangeRef = useRef(onZoomChange);
  const downXRef = useRef<number | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [hoverPoint, setHoverPoint] = useState<ChartPoint | null>(null);
  const [hoverPosition, setHoverPosition] = useState<{ left: number; top: number } | null>(null);
  const [themeRevision, setThemeRevision] = useState(0);

  useEffect(() => {
    dataRef.current = data;
    onZoomChangeRef.current = onZoomChange;
  }, [data, onZoomChange]);

  useEffect(() => {
    const element = containerRef.current;

    if (!element) {
      return undefined;
    }

    const updateDimensions = () => {
      const nextWidth = Math.floor(element.clientWidth);
      const nextHeight = Math.floor(element.clientHeight);

      if (nextWidth > 0 && nextHeight > 0) {
        setDimensions((current) => (
          current.width === nextWidth && current.height === nextHeight
            ? current
            : { width: nextWidth, height: nextHeight }
        ));
      }
    };

    updateDimensions();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateDimensions);
      return () => window.removeEventListener("resize", updateDimensions);
    }

    const observer = new ResizeObserver(updateDimensions);
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (typeof MutationObserver === "undefined") {
      return undefined;
    }

    const observer = new MutationObserver(() => {
      setThemeRevision((current) => current + 1);
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = containerRef.current;

    if (!element || dimensions.width <= 0 || dimensions.height <= 0) {
      return undefined;
    }

    element.textContent = "";

    const xs = data.map((point) => point.timestamp / 1000);
    const ys = data.map((point) => point.value);
    const lineSegments = getGlucoseLineSegments(
      data.map((point) => ({
        x: point.timestamp / 1000,
        y: point.value,
        value: point.value,
      })),
      lowThreshold,
      highThreshold
    );
    const effectiveRenderMode = resolveRenderMode(data.length, dimensions.width);
    const palette = resolveChartPalette(element);
    const thresholds = {
      urgentLow: urgentLowThreshold,
      low: lowThreshold,
      high: highThreshold,
      urgentHigh: urgentHighThreshold,
    };
    const options: uPlot.Options = {
      width: dimensions.width,
      height: dimensions.height,
      legend: { show: false },
      cursor: {
        x: true,
        y: true,
        drag: {
          x: true,
          y: false,
          setScale: false,
          dist: MIN_ZOOM_SELECT_PX,
        },
        points: { show: false },
      },
      select: {
        show: true,
        left: 0,
        top: 0,
        width: 0,
        height: 0,
      },
      scales: {
        x: {
          time: true,
          range: [xDomain[0] / 1000, xDomain[1] / 1000],
        },
        y: {
          range: yDomain,
        },
      },
      axes: [
        {
          stroke: palette.tick,
          grid: { stroke: palette.grid },
          ticks: { stroke: palette.axis },
          values: (_chart, values) => values.map((value) => formatXTick(value, multiDay)),
        },
        {
          stroke: palette.tick,
          grid: { stroke: palette.grid },
          ticks: { stroke: palette.axis },
          values: (_chart, values) => values.map((value) => formatGlucose(value, unit)),
        },
      ],
      series: [
        {},
        {
          stroke: "rgba(0, 0, 0, 0)",
          width: 1,
          points: { show: false },
          spanGaps: false,
        },
      ],
      hooks: {
        draw: [
          (chart) => {
            drawTargetRange(chart, lowThreshold, highThreshold, palette);
            drawGlucoseLineSegments(chart, lineSegments, thresholds, palette);
            drawThresholdLines(chart, lowThreshold, highThreshold, palette);
            drawReadingPoints(
              chart,
              dataRef.current,
              effectiveRenderMode === "points" ? "all" : "none",
              thresholds,
              palette
            );
          },
        ],
        setCursor: [
          (chart) => {
            const index = chart.cursor.idx;

            if (index == null) {
              setHoverPoint(null);
              setHoverPosition(null);
              return;
            }

            const point = dataRef.current[index];

            if (!point) {
              setHoverPoint(null);
              setHoverPosition(null);
              return;
            }

            setHoverPoint(point);
            setHoverPosition(getTooltipPosition({
              cursorLeft: chart.cursor.left ?? 0,
              cursorTop: chart.cursor.top ?? 0,
              chartWidth: dimensions.width,
              chartHeight: dimensions.height,
            }));
          },
        ],
        setSelect: [
          (chart) => {
            if (chart.select.width < MIN_ZOOM_SELECT_PX) {
              return;
            }

            const fromMs = chart.posToVal(chart.select.left, "x") * 1000;
            const toMs = chart.posToVal(chart.select.left + chart.select.width, "x") * 1000;
            chart.setSelect({ left: 0, top: 0, width: 0, height: 0 }, false);

            if (toMs - fromMs < MIN_ZOOM_MS) {
              return;
            }

            onZoomChangeRef.current?.([fromMs, toMs]);
          },
        ],
        ready: [
          (chart) => {
            chart.over.addEventListener("mousedown", (event) => {
              downXRef.current = event.clientX;
            });

            chart.over.addEventListener("click", (event) => {
              if (
                downXRef.current !== null &&
                Math.abs(event.clientX - downXRef.current) > CLICK_DRAG_TOLERANCE_PX
              ) {
                return;
              }

              const index = chart.cursor.idx;
              const point = typeof index === "number" ? dataRef.current[index] : null;

              if (point) {
                setHoverPoint(point);
              }
            });

            chart.over.addEventListener("dblclick", () => {
              onZoomChangeRef.current?.(null);
            });
          },
        ],
      },
    };

    const chart = new uPlot(options, [xs, ys], element);
    chartRef.current = chart;

    return () => {
      chartRef.current = null;
      chart.destroy();
    };
  }, [
    data,
    dimensions.height,
    dimensions.width,
    highThreshold,
    lowThreshold,
    multiDay,
    themeRevision,
    urgentHighThreshold,
    urgentLowThreshold,
    unit,
    xDomain,
    yDomain,
  ]);

  const hoverRangeStatus = hoverPoint
    ? getRangeStatus(
      hoverPoint.value,
      {
        urgentLow: urgentLowThreshold,
        low: lowThreshold,
        high: highThreshold,
        urgentHigh: urgentHighThreshold,
      },
      unit
    )
    : null;

  return (
    <div
      className="relative h-56 min-w-0 sm:h-64 md:h-72 lg:h-80"
      role="img"
      aria-label={ariaLabel}
    >
      <div
        ref={containerRef}
        aria-hidden="true"
        className={twMerge(
          styles.uplotFrame,
          "h-full min-w-0 cursor-crosshair [&_.u-select]:bg-signal-info-fill/15 [&_.u-select]:border [&_.u-select]:border-signal-info-fill/40"
        )}
      />
      {hoverPoint && hoverPosition ? (
        <div
          className="pointer-events-none absolute z-10 max-w-[13rem] rounded-lg border border-border-hover bg-surface-secondary px-3 py-2 font_body_3 shadow-lg"
          style={{ left: hoverPosition.left, top: hoverPosition.top }}
        >
          <p className="font_header_4" style={{ color: hoverPoint.color }}>
            {formatGlucose(hoverPoint.value, unit)} {unitLabel(unit)}
            {TREND_ARROWS[hoverPoint.trend] && TREND_ARROWS[hoverPoint.trend] !== "?" ? (
              <span className="ml-1">{TREND_ARROWS[hoverPoint.trend]}</span>
            ) : null}
          </p>
          {TREND_DESCRIPTIONS[hoverPoint.trend] !== "unknown trend" ? (
            <p className="font_metric_caption capitalize text-foreground-secondary">
              {TREND_DESCRIPTIONS[hoverPoint.trend]}
            </p>
          ) : null}
          <p className="font_metric_caption text-foreground-secondary">
            {formatTooltipTime(hoverPoint.timestamp, multiDay)}
          </p>
          {hoverRangeStatus ? (
            <p className="mt-2 flex items-center gap-1.5 font_metric_caption text-foreground-secondary">
              <span
                className={twMerge("inline-block h-2 w-2 rounded-full", hoverRangeStatus.swatchClassName)}
                aria-hidden="true"
              />
              {hoverRangeStatus.label}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function resolveYDomain(points: ChartPoint[]): [number, number] {
  if (points.length === 0) {
    return DEFAULT_Y_DOMAIN;
  }

  let min = points[0].value;
  let max = points[0].value;

  for (const point of points) {
    min = Math.min(min, point.value);
    max = Math.max(max, point.value);
  }

  return [Math.min(DEFAULT_Y_DOMAIN[0], min - 10), Math.max(DEFAULT_Y_DOMAIN[1], max + 10)];
}

function isMultiDayWindow(window: { from: string; to: string } | null | undefined): boolean {
  if (!window) {
    return false;
  }

  return getWindowDurationMs(window) >= 3 * 24 * 60 * 60 * 1000;
}

export function GlucoseTrendChart({
  refreshKey,
  className,
  thresholds,
  forecast: _forecast,
  unit = "mgdl",
  embedded = false,
}: GlucoseTrendChartProps) {
  const dashboardTimeRange = useOptionalDashboardTimeRange();
  const { readings, isLoading, error, period, setPeriod, refetch } = useGlucoseHistory(
    "3h",
    dashboardTimeRange?.currentWindow
  );
  const [zoomDomain, setZoomDomain] = useState<[number, number] | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const prevRefreshKeyRef = useRef(refreshKey);
  void _forecast;

  useEffect(() => {
    if (
      refreshKey !== undefined &&
      refreshKey > 0 &&
      refreshKey !== prevRefreshKeyRef.current
    ) {
      prevRefreshKeyRef.current = refreshKey;
      refetch();
    }
  }, [refreshKey, refetch]);

  useEffect(() => {
    setZoomDomain(null);
    setCopyError(null);
  }, [dashboardTimeRange?.currentWindow]);

  const multiDay = dashboardTimeRange?.currentWindow
    ? isMultiDayWindow(dashboardTimeRange.currentWindow)
    : isMultiDay(period);
  const data = useMemo(() => transformReadings(readings, thresholds), [readings, thresholds]);
  const latestReadingTimestamp = data.length > 0 ? data[data.length - 1].timestamp : 0;
  const fullDomain = useMemo(() => {
    if (dashboardTimeRange?.currentWindow) {
      return [
        new Date(dashboardTimeRange.currentWindow.from).getTime(),
        new Date(dashboardTimeRange.currentWindow.to).getTime(),
      ] as [number, number];
    }

    const now = Math.max(Date.now(), latestReadingTimestamp);
    return [now - PERIOD_TO_MS[period], now] as [number, number];
  }, [dashboardTimeRange?.currentWindow, period, latestReadingTimestamp]);
  const xDomain = zoomDomain ?? fullDomain;
  const yDomain = useMemo(() => resolveYDomain(data), [data]);
  const urgentLowThreshold = thresholds?.urgentLow ?? GLUCOSE_THRESHOLDS.URGENT_LOW;
  const lowThreshold = thresholds?.low ?? GLUCOSE_THRESHOLDS.LOW;
  const highThreshold = thresholds?.high ?? GLUCOSE_THRESHOLDS.HIGH;
  const urgentHighThreshold = thresholds?.urgentHigh ?? GLUCOSE_THRESHOLDS.URGENT_HIGH;
  const containerClassName = twMerge(
    embedded
      ? "min-w-0 overflow-hidden p-4 sm:p-6"
      : "min-w-0 overflow-hidden rounded-xl border border-border-default bg-surface-primary p-4 sm:p-6",
    className
  );

  const handlePeriodChange = useCallback(
    (nextPeriod: ChartTimePeriod) => {
      setPeriod(nextPeriod);
      setZoomDomain(null);
    },
    [setPeriod]
  );

  const copyZoomRange = useCallback(async () => {
    if (!zoomDomain) {
      return;
    }

    try {
      await navigator.clipboard.writeText(serializeTimeRangeClipboardValue({
        from: new Date(zoomDomain[0]).toISOString(),
        to: new Date(zoomDomain[1]).toISOString(),
      }));
      setCopyError(null);
    } catch {
      setCopyError("Could not copy zoom range.");
    }
  }, [zoomDomain]);

  if (isLoading && data.length === 0) {
    return (
      <div
        className={containerClassName}
        role="region"
        aria-label="Loading glucose trend chart"
        aria-busy="true"
        data-testid="glucose-trend-chart"
      >
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="h-6 w-40 animate-pulse rounded-sm bg-surface-tertiary" />
          <div className="h-8 w-48 animate-pulse rounded-sm bg-surface-tertiary" />
        </div>
        <div className="h-64 animate-pulse rounded-sm bg-surface-secondary" />
      </div>
    );
  }

  if (error && data.length === 0) {
    return (
      <div
        className={containerClassName}
        role="region"
        aria-label="Glucose trend chart"
        data-testid="glucose-trend-chart"
      >
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {embedded ? null : (
            <h2 className="font_header_4 text-foreground-primary">
              Glucose Trend
            </h2>
          )}
          {dashboardTimeRange ? null : <PeriodSelector selected={period} onSelect={handlePeriodChange} />}
        </div>
        <div className="flex h-64 flex-col items-center justify-center gap-3 text-foreground-secondary">
          <p>Unable to load glucose history</p>
          <button
            type="button"
            onClick={refetch}
            className="rounded-lg bg-surface-secondary px-4 py-2 font_body_3 text-foreground-secondary transition-colors hover:bg-surface-tertiary hover:text-foreground-primary"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div
        className={containerClassName}
        role="region"
        aria-label="Glucose trend chart"
        data-testid="glucose-trend-chart"
      >
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {embedded ? null : (
            <h2 className="font_header_4 text-foreground-primary">
              Glucose Trend
            </h2>
          )}
          {dashboardTimeRange ? null : <PeriodSelector selected={period} onSelect={handlePeriodChange} />}
        </div>
        <div className="flex h-64 items-center justify-center text-foreground-secondary">
          <p>No glucose readings yet</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={containerClassName}
      role="region"
      aria-label={`Glucose trend chart, ${dashboardTimeRange?.label ?? period} view`}
      data-testid="glucose-trend-chart"
    >
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {embedded ? null : (
            <h2 className="font_header_4 text-foreground-primary">Glucose Trend</h2>
          )}
          {zoomDomain ? (
            <>
              <button
                type="button"
                onClick={copyZoomRange}
                className="flex items-center gap-1 rounded-md bg-surface-secondary px-2 py-1 font_metric_caption text-foreground-secondary transition-colors hover:bg-surface-tertiary hover:text-foreground-primary"
                aria-label="Copy zoom time range"
              >
                <Icon icon="copy" decorative className="h-3.5 w-3.5" />
                Copy Zoom
              </button>
              <button
                type="button"
                onClick={() => setZoomDomain(null)}
                className="flex items-center gap-1 rounded-md bg-surface-secondary px-2 py-1 font_metric_caption text-foreground-secondary transition-colors hover:bg-surface-tertiary hover:text-foreground-primary"
                aria-label="Reset zoom"
              >
                <Icon icon="zoom-out" decorative className="h-3.5 w-3.5" />
                Reset Zoom
              </button>
            </>
          ) : null}
        </div>
        {dashboardTimeRange ? null : <PeriodSelector selected={period} onSelect={handlePeriodChange} />}
      </div>
      {copyError ? (
        <p className="mb-2 font_metric_caption text-signal-warning-text" role="alert">
          {copyError}
        </p>
      ) : null}
      <UplotGlucoseTrend
        ariaLabel={`Glucose readings for ${dashboardTimeRange?.label ?? period}`}
        data={data}
        xDomain={xDomain}
        yDomain={yDomain}
        urgentLowThreshold={urgentLowThreshold}
        lowThreshold={lowThreshold}
        highThreshold={highThreshold}
        urgentHighThreshold={urgentHighThreshold}
        unit={unit}
        multiDay={multiDay}
        onZoomChange={setZoomDomain}
      />
    </div>
  );
}

export default GlucoseTrendChart;
