"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import uPlot from "uplot";
import { formatGlucose, mgdlToMmol, mmolToMgdl } from "@/lib/glucose-units";
import { twMerge } from "@/lib/ui/twMerge";
import {
  CHART_X_AXIS_SIZE_PX,
  CHART_Y_AXIS_SIZE_PX,
  drawAlternatingDayBands,
  formatSharedTimeTick,
  getSharedTimeSplits,
} from "../chart-axis";
import { resolveChartPalette, type ChartPalette } from "../chart-theme";
import { ChartLegendSwatch } from "../ChartLegendSwatch";
import type { PumpActivityLaneInterval } from "../insulin-timeline-data";
import { PumpActivityIntervalDecorations } from "../pump-activity-interval-decorations";
import styles from "../glucose-trend-chart.module.css";
import { MergedDoseOverlay } from "./MergedDoseOverlay";
import type {
  MergedActivityKind,
  MergedChartModel,
  MergedDoseEvent,
  MergedGlucosePoint,
} from "./MergedGlucoseTrendChart.types";
import {
  formatMergedDoseUnits,
  getMergedDoseLabel,
  getVisibleActivityKinds,
  getVisibleMergedDoses,
  isAutomatedMergedDose,
  isLongActingMergedDose,
  layoutMergedDoseMarkers,
  mergedChartAriaLabel,
  resolveMergedBasalDomain,
  resolveMergedGlucoseDomain,
} from "./merged-chart-model";

const MIN_ZOOM_SELECT_PX = 8;
const MIN_ZOOM_MS = 15 * 60 * 1000;
const COMPACT_Y_AXIS_SIZE_PX = 32;
const GLUCOSE_POINT_RADIUS_PX = 3;
const GLUCOSE_LINE_WIDTH_PX = 2;
const DEFAULT_ACTIVITY_LAYOUT = {
  barHeight: 32,
  padding: 6,
  rowHeight: 36,
} as const;
const COMPACT_ACTIVITY_LAYOUT = {
  barHeight: 28,
  padding: 4,
  rowHeight: 32,
} as const;
const MAX_LABELED_DESKTOP_RANGE_MS = 24 * 60 * 60 * 1000;
const LABELED_DOSE_MARKER_WIDTH_PX = 36;
const ICON_ONLY_DOSE_MARKER_WIDTH_PX = 8;

interface ActivityLayout {
  barHeight: number;
  padding: number;
  rowHeight: number;
}
const HOVER_GLUCOSE_TOLERANCE_MS = 3 * 60 * 1000;

interface MergedHoverState {
  activity: MergedActivityKind | null;
  basalRate: number | null;
  doses: MergedDoseEvent[];
  glucose: MergedGlucosePoint | null;
  isSuspended: boolean;
  timestampMs: number;
}

interface MergedGlucoseTrendSurfaceProps {
  compactAxes?: boolean;
  heightClassName: string;
  interactive: boolean;
  model: MergedChartModel;
  onZoomChange?: (domain: [number, number]) => void;
  xDomain: [number, number];
}

function getWholeMmolAxisSplits(
  scaleMin: number,
  scaleMax: number,
  incrementMgdl: number
): number[] {
  if (!Number.isFinite(incrementMgdl) || incrementMgdl <= 0) {
    return [];
  }

  const incrementMmol = Math.max(1, Math.ceil(mgdlToMmol(incrementMgdl)));
  const firstSplit = Math.ceil(mgdlToMmol(scaleMin) / incrementMmol) * incrementMmol;
  const maximum = mgdlToMmol(scaleMax);
  const splits: number[] = [];

  for (let value = firstSplit; value <= maximum; value += incrementMmol) {
    splits.push(mmolToMgdl(value));
  }

  return splits;
}

function glucoseColor(
  value: number,
  thresholds: MergedChartModel["thresholds"],
  palette: ChartPalette
): string {
  if (value < thresholds.urgentLow || value > thresholds.urgentHigh) {
    return palette.error;
  }

  if (value < thresholds.low || value > thresholds.high) {
    return palette.warning;
  }

  return palette.target;
}

function drawTargetRange(
  chart: uPlot,
  model: MergedChartModel,
  palette: ChartPalette
): void {
  const low = chart.valToPos(model.thresholds.low, "glucose", true);
  const high = chart.valToPos(model.thresholds.high, "glucose", true);
  const top = Math.min(low, high);
  const height = Math.abs(low - high);

  if (!Number.isFinite(top) || !Number.isFinite(height) || height <= 0) {
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
  model: MergedChartModel,
  palette: ChartPalette
): void {
  const pixelRatio = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const left = chart.bbox.left;
  const right = left + chart.bbox.width;

  chart.ctx.save();
  chart.ctx.setLineDash([4 * pixelRatio, 4 * pixelRatio]);
  chart.ctx.lineWidth = pixelRatio;
  chart.ctx.strokeStyle = palette.warning;

  for (const threshold of [model.thresholds.low, model.thresholds.high]) {
    const y = chart.valToPos(threshold, "glucose", true);
    chart.ctx.beginPath();
    chart.ctx.moveTo(left, y);
    chart.ctx.lineTo(right, y);
    chart.ctx.stroke();
  }

  chart.ctx.restore();
}

function drawBasalSegments(
  chart: uPlot,
  model: MergedChartModel,
  domain: [number, number],
  palette: ChartPalette
): void {
  if (!model.hasPump) {
    return;
  }

  const pixelRatio = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const baseline = chart.valToPos(0, "basal", true);
  const plotLeft = chart.bbox.left;
  const plotRight = plotLeft + chart.bbox.width;
  const visibleSegments = model.basalSegments.filter(
    (segment) => segment.endMs > domain[0] && segment.startMs < domain[1]
  );

  chart.ctx.save();
  chart.ctx.fillStyle = palette.insulinBasal;
  chart.ctx.strokeStyle = palette.insulinBasal;
  chart.ctx.lineWidth = 1.5 * pixelRatio;

  for (let index = 0; index < visibleSegments.length; index += 1) {
    const segment = visibleSegments[index];
    const x1 = Math.max(
      plotLeft,
      chart.valToPos(Math.max(domain[0], segment.startMs) / 1000, "x", true)
    );
    const x2 = Math.min(
      plotRight,
      chart.valToPos(Math.min(domain[1], segment.endMs) / 1000, "x", true)
    );
    const y = chart.valToPos(segment.rateUnitsPerHour, "basal", true);

    if (![x1, x2, y, baseline].every(Number.isFinite) || x2 <= x1) {
      continue;
    }

    if (segment.rateUnitsPerHour > 0) {
      chart.ctx.globalAlpha = 0.14;
      chart.ctx.fillRect(x1, y, x2 - x1, Math.max(pixelRatio, baseline - y));
    }

    chart.ctx.globalAlpha = 0.9;
    chart.ctx.beginPath();
    chart.ctx.moveTo(x1, y);
    chart.ctx.lineTo(x2, y);
    chart.ctx.stroke();

    const previous = visibleSegments[index - 1];
    if (previous && previous.endMs === segment.startMs) {
      const previousY = chart.valToPos(previous.rateUnitsPerHour, "basal", true);
      chart.ctx.globalAlpha = 0.55;
      chart.ctx.beginPath();
      chart.ctx.moveTo(x1, previousY);
      chart.ctx.lineTo(x1, y);
      chart.ctx.stroke();
    }
  }

  chart.ctx.restore();
}

function drawGlucose(
  chart: uPlot,
  points: readonly MergedGlucosePoint[],
  model: MergedChartModel,
  palette: ChartPalette
): void {
  if (points.length === 0) {
    return;
  }

  const pixelRatio = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const showPoints = points.length <= Math.max(1, Math.floor(chart.bbox.width / pixelRatio / 5));

  chart.ctx.save();
  chart.ctx.lineCap = "round";
  chart.ctx.lineJoin = "round";
  chart.ctx.lineWidth = GLUCOSE_LINE_WIDTH_PX * pixelRatio;

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const x1 = chart.valToPos(previous.timestampMs / 1000, "x", true);
    const y1 = chart.valToPos(previous.valueMgDl, "glucose", true);
    const x2 = chart.valToPos(current.timestampMs / 1000, "x", true);
    const y2 = chart.valToPos(current.valueMgDl, "glucose", true);

    if (![x1, y1, x2, y2].every(Number.isFinite)) {
      continue;
    }

    chart.ctx.strokeStyle = glucoseColor(
      (previous.valueMgDl + current.valueMgDl) / 2,
      model.thresholds,
      palette
    );
    chart.ctx.beginPath();
    chart.ctx.moveTo(x1, y1);
    chart.ctx.lineTo(x2, y2);
    chart.ctx.stroke();
  }

  if (showPoints) {
    for (const point of points) {
      const x = chart.valToPos(point.timestampMs / 1000, "x", true);
      const y = chart.valToPos(point.valueMgDl, "glucose", true);

      chart.ctx.fillStyle = glucoseColor(point.valueMgDl, model.thresholds, palette);
      chart.ctx.beginPath();
      chart.ctx.arc(x, y, GLUCOSE_POINT_RADIUS_PX * pixelRatio, 0, Math.PI * 2);
      chart.ctx.fill();
    }
  }

  chart.ctx.restore();
}

function activityColor(kind: MergedActivityKind, palette: ChartPalette): string {
  if (kind === "sleep") {
    return palette.insulinModeSleep;
  }

  if (kind === "exercise") {
    return palette.insulinModeExercise;
  }

  return palette.error;
}

function drawActivityTrack(
  chart: uPlot,
  model: MergedChartModel,
  domain: [number, number],
  kinds: readonly MergedActivityKind[],
  palette: ChartPalette,
  layout: ActivityLayout
): void {
  if (kinds.length === 0) {
    return;
  }

  const pixelRatio = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const plotLeft = chart.bbox.left;
  const plotRight = plotLeft + chart.bbox.width;
  const rowStart =
    chart.bbox.top + chart.bbox.height + layout.padding * pixelRatio;

  chart.ctx.save();
  chart.ctx.strokeStyle = palette.grid;
  chart.ctx.lineWidth = pixelRatio;
  chart.ctx.beginPath();
  chart.ctx.moveTo(plotLeft, chart.bbox.top + chart.bbox.height + pixelRatio);
  chart.ctx.lineTo(plotRight, chart.bbox.top + chart.bbox.height + pixelRatio);
  chart.ctx.stroke();

  chart.ctx.globalAlpha = 0.28;
  chart.ctx.fillStyle = palette.surfaceSecondary;
  chart.ctx.fillRect(
    plotLeft,
    rowStart,
    chart.bbox.width,
    layout.barHeight * pixelRatio
  );

  kinds.forEach((kind) => {
    const color = activityColor(kind, palette);
    const intervals = kind === "suspension"
      ? model.suspensionIntervals
      : model.activityIntervals.filter((interval) => interval.mode === kind);

    for (const interval of intervals) {
      if (interval.endMs <= domain[0] || interval.startMs >= domain[1]) {
        continue;
      }

      const x1 = Math.max(
        plotLeft,
        chart.valToPos(Math.max(domain[0], interval.startMs) / 1000, "x", true)
      );
      const x2 = Math.min(
        plotRight,
        chart.valToPos(Math.min(domain[1], interval.endMs) / 1000, "x", true)
      );

      chart.ctx.globalAlpha = kind === "suspension" ? 0.18 : 0.24;
      chart.ctx.fillStyle = color;
      chart.ctx.fillRect(
        x1,
        rowStart,
        Math.max(pixelRatio, x2 - x1),
        layout.barHeight * pixelRatio
      );
      chart.ctx.globalAlpha = 1;
      chart.ctx.strokeStyle = color;
      chart.ctx.strokeRect(
        x1,
        rowStart,
        Math.max(pixelRatio, x2 - x1),
        layout.barHeight * pixelRatio
      );

      if (kind === "suspension") {
        chart.ctx.beginPath();
        for (let stripe = x1; stripe < x2; stripe += 6 * pixelRatio) {
          chart.ctx.moveTo(
            stripe,
            rowStart + layout.barHeight * pixelRatio
          );
          chart.ctx.lineTo(
            Math.min(x2, stripe + layout.barHeight * pixelRatio),
            rowStart
          );
        }
        chart.ctx.stroke();
      }
    }
  });

  chart.ctx.restore();
}

function nearestHoverState(
  chart: uPlot,
  model: MergedChartModel,
  domain: [number, number],
  timestampMs: number
): MergedHoverState {
  const nearestGlucose = model.points.reduce<MergedGlucosePoint | null>(
    (nearest, point) => {
      if (point.timestampMs < domain[0] || point.timestampMs > domain[1]) {
        return nearest;
      }

      if (
        nearest === null ||
        Math.abs(point.timestampMs - timestampMs) <
          Math.abs(nearest.timestampMs - timestampMs)
      ) {
        return point;
      }

      return nearest;
    },
    null
  );
  const hoverWindowMs =
    ((domain[1] - domain[0]) * 18) /
    Math.max(1, chart.bbox.width / (typeof window === "undefined" ? 1 : window.devicePixelRatio || 1));
  const doses = getVisibleMergedDoses(model.doses, domain).filter(
    (dose) => Math.abs(dose.timestampMs - timestampMs) <= hoverWindowMs
  );
  const basal = model.basalSegments.find(
    (segment) => timestampMs >= segment.startMs && timestampMs < segment.endMs
  );
  const activity = model.activityIntervals.find(
    (interval) => timestampMs >= interval.startMs && timestampMs < interval.endMs
  );
  const suspension = model.suspensionIntervals.find(
    (interval) => timestampMs >= interval.startMs && timestampMs < interval.endMs
  );

  return {
    activity: activity?.mode ?? null,
    basalRate: basal?.rateUnitsPerHour ?? null,
    doses,
    glucose:
      nearestGlucose &&
      Math.abs(nearestGlucose.timestampMs - timestampMs) <= HOVER_GLUCOSE_TOLERANCE_MS
        ? nearestGlucose
        : null,
    isSuspended: Boolean(suspension),
    timestampMs,
  };
}

function formatTooltipTime(timestampMs: number, multiDay: boolean): string {
  const date = new Date(timestampMs);

  if (multiDay) {
    return `${date.toLocaleDateString([], { month: "short", day: "numeric" })} ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  }

  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function MergedChartTooltip({
  hover,
  model,
  xDomain,
}: {
  hover: MergedHoverState;
  model: MergedChartModel;
  xDomain: [number, number];
}) {
  const fraction =
    (hover.timestampMs - xDomain[0]) / Math.max(1, xDomain[1] - xDomain[0]);

  return (
    <div
      className={twMerge(
        "pointer-events-none absolute top-12 z-20 w-60 rounded-lg border border-border-hover bg-surface-primary px-3 py-2 shadow-lg",
        fraction > 0.65 ? "left-2" : "right-2"
      )}
      data-testid="merged-chart-tooltip"
      role="tooltip"
    >
      <p className="font_metric_caption text-foreground-secondary">
        {formatTooltipTime(hover.timestampMs, model.isMultiDay)}
      </p>
      <p className="mt-1 font_header_4 text-foreground-primary">
        {hover.glucose
          ? formatGlucose(hover.glucose.valueMgDl, model.unit)
          : "No nearby glucose reading"}
      </p>
      {model.hasPump ? (
        <p className="mt-1 font_metric_caption text-foreground-primary">
          Basal: {hover.basalRate == null ? "No confirmed rate" : hover.basalRate.toFixed(2)}
        </p>
      ) : null}
      {hover.doses.length > 0 ? (
        <div className="mt-2 border-t border-border-default pt-2">
          {hover.doses.map((dose, index) => (
            <p
              className="flex items-center gap-1.5 font_metric_caption text-foreground-primary"
              key={`${dose.kind}-${dose.timestampMs}-${index}`}
            >
              <ChartLegendSwatch
                className={isAutomatedMergedDose(dose)
                  ? "rotate-45 bg-data-insulin-correction"
                  : isLongActingMergedDose(dose)
                    ? "border border-data-insulin-bolus bg-transparent"
                    : "bg-data-insulin-bolus"}
              />
              {getMergedDoseLabel(dose)}: {formatMergedDoseUnits(dose)}
            </p>
          ))}
        </div>
      ) : null}
      {hover.activity || hover.isSuspended ? (
        <div className="mt-2 border-t border-border-default pt-2 font_metric_caption text-foreground-primary">
          {hover.activity ? (
            <p className="capitalize">{hover.activity} mode</p>
          ) : null}
          {hover.isSuspended ? (
            <p className="text-signal-error-text">Pump suspended</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function MergedGlucoseTrendSurface({
  compactAxes = false,
  heightClassName,
  interactive,
  model,
  onZoomChange,
  xDomain,
}: MergedGlucoseTrendSurfaceProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dimensions, setDimensions] = useState({ height: 0, width: 0 });
  const [themeRevision, setThemeRevision] = useState(0);
  const [hover, setHover] = useState<MergedHoverState | null>(null);
  const yAxisSize = compactAxes
    ? COMPACT_Y_AXIS_SIZE_PX
    : CHART_Y_AXIS_SIZE_PX;
  const activityLayout = compactAxes
    ? COMPACT_ACTIVITY_LAYOUT
    : DEFAULT_ACTIVITY_LAYOUT;
  const showDoseValues =
    !interactive || xDomain[1] - xDomain[0] <= MAX_LABELED_DESKTOP_RANGE_MS;
  const visiblePoints = useMemo(
    () => model.points.filter(
      (point) => point.timestampMs >= xDomain[0] && point.timestampMs <= xDomain[1]
    ),
    [model.points, xDomain]
  );
  const activityKinds = useMemo(
    () => getVisibleActivityKinds({
      activityIntervals: model.activityIntervals,
      domain: xDomain,
      suspensionIntervals: model.suspensionIntervals,
    }),
    [model.activityIntervals, model.suspensionIntervals, xDomain]
  );
  const activityDecorationIntervals = useMemo<PumpActivityLaneInterval[]>(
    () => activityKinds.flatMap<PumpActivityLaneInterval>((kind) => {
      if (kind === "suspension") {
        return model.suspensionIntervals.map((interval) => ({
          endMs: interval.endMs,
          hasConfirmedResume: interval.hasConfirmedResume,
          kind,
          lane: 0,
          startMs: interval.startMs,
        }));
      }

      return model.activityIntervals
        .filter((interval) => interval.mode === kind)
        .map((interval) => ({
          endMs: interval.endMs,
          hasConfirmedResume: true,
          kind,
          lane: 0,
          startMs: interval.startMs,
        }));
    }),
    [activityKinds, model.activityIntervals, model.suspensionIntervals]
  );
  const doseLayout = useMemo(
    () => {
      const layout = layoutMergedDoseMarkers({
        domain: xDomain,
        doses: model.doses,
        markerWidth: showDoseValues
          ? LABELED_DOSE_MARKER_WIDTH_PX
          : ICON_ONLY_DOSE_MARKER_WIDTH_PX,
        plotWidth: Math.max(
          1,
          dimensions.width - yAxisSize * (model.hasPump ? 2 : 1)
        ),
      });

      return showDoseValues
        ? layout
        : layout.map((marker) => ({ ...marker, row: 0 }));
    },
    [
      dimensions.width,
      model.doses,
      model.hasPump,
      showDoseValues,
      xDomain,
      yAxisSize,
    ]
  );
  const activityTrackHeight =
    activityKinds.length > 0
      ? activityLayout.rowHeight + activityLayout.padding * 2
      : 0;
  const glucoseDomain = useMemo(
    () => resolveMergedGlucoseDomain(
      visiblePoints,
      model.thresholds.low,
      model.thresholds.high
    ),
    [model.thresholds.high, model.thresholds.low, visiblePoints]
  );
  const basalDomain = useMemo(
    () => resolveMergedBasalDomain(model.basalSegments, xDomain),
    [model.basalSegments, xDomain]
  );

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return undefined;
    }

    const updateDimensions = () => {
      const height = Math.floor(element.clientHeight);
      const width = Math.floor(element.clientWidth);
      if (height <= 0 || width <= 0) {
        return;
      }

      setDimensions((current) =>
        current.height === height && current.width === width
          ? current
          : { height, width }
      );
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
    if (!element || dimensions.height <= 0 || dimensions.width <= 0) {
      return undefined;
    }

    element.textContent = "";
    const palette = resolveChartPalette(element);
    const options: uPlot.Options = {
      width: dimensions.width,
      height: dimensions.height,
      padding: [4, 0, 0, 0],
      legend: { show: false },
      cursor: {
        show: interactive,
        x: interactive,
        y: interactive,
        drag: {
          x: interactive,
          y: false,
          setScale: false,
          dist: MIN_ZOOM_SELECT_PX,
        },
        points: { show: false },
      },
      select: {
        show: interactive,
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
        glucose: { range: glucoseDomain },
        basal: { range: basalDomain },
      },
      axes: [
        {
          show: true,
          size: CHART_X_AXIS_SIZE_PX + activityTrackHeight,
          gap: activityTrackHeight,
          stroke: palette.tick,
          grid: { stroke: palette.grid },
          ticks: { stroke: palette.axis },
          splits: getSharedTimeSplits,
          values: (_chart, values) => values.map((value) =>
            formatSharedTimeTick(value, model.isMultiDay)
          ),
        },
        {
          scale: "glucose",
          size: yAxisSize,
          side: 3,
          stroke: palette.tick,
          grid: compactAxes ? { show: false } : { stroke: palette.grid },
          ticks: compactAxes ? { show: false } : { stroke: palette.axis },
          splits: compactAxes
            ? () => [model.thresholds.low, model.thresholds.high]
            : model.unit === "mmol"
            ? (_chart, _axisIndex, scaleMin, scaleMax, increment) =>
              getWholeMmolAxisSplits(scaleMin, scaleMax, increment)
            : undefined,
          values: (_chart, values) => values.map((value) => {
            const formatted = formatGlucose(value, model.unit);
            return compactAxes ? formatted.replace(/\.0$/, "") : formatted;
          }),
        },
        {
          show: model.hasPump,
          scale: "basal",
          size: model.hasPump ? yAxisSize : 0,
          side: 1,
          stroke: palette.tick,
          grid: { show: false },
          ticks: compactAxes ? { show: false } : { stroke: palette.axis },
          values: (_chart, values) => values.map((value) =>
            Number(value.toFixed(2)).toString()
          ),
        },
      ],
      series: [
        {},
        {
          scale: "glucose",
          stroke: "rgba(0, 0, 0, 0)",
          points: { show: false },
          spanGaps: false,
        },
      ],
      hooks: {
        drawClear: [
          (chart) => {
            if (model.isMultiDay) {
              drawAlternatingDayBands(chart, palette.surfaceSecondary);
            }
            drawTargetRange(chart, model, palette);
            drawBasalSegments(chart, model, xDomain, palette);
          },
        ],
        draw: [
          (chart) => {
            drawThresholdLines(chart, model, palette);
            drawGlucose(chart, visiblePoints, model, palette);
            drawActivityTrack(
              chart,
              model,
              xDomain,
              activityKinds,
              palette,
              activityLayout
            );
          },
        ],
        setCursor: interactive
          ? [
              (chart) => {
                const left = chart.cursor.left;
                if (left == null || left < 0) {
                  setHover(null);
                  return;
                }

                const timestampMs = chart.posToVal(left, "x") * 1000;
                setHover(nearestHoverState(chart, model, xDomain, timestampMs));
              },
            ]
          : [],
        setSelect: interactive
          ? [
              (chart) => {
                if (chart.select.width < MIN_ZOOM_SELECT_PX) {
                  return;
                }

                const fromMs = chart.posToVal(chart.select.left, "x") * 1000;
                const toMs =
                  chart.posToVal(chart.select.left + chart.select.width, "x") * 1000;
                chart.setSelect(
                  { left: 0, top: 0, width: 0, height: 0 },
                  false
                );

                if (toMs - fromMs >= MIN_ZOOM_MS) {
                  onZoomChange?.([fromMs, toMs]);
                }
              },
            ]
          : [],
      },
    };
    const xs = visiblePoints.length > 0
      ? visiblePoints.map((point) => point.timestampMs / 1000)
      : [xDomain[0] / 1000, xDomain[1] / 1000];
    const ys = visiblePoints.length > 0
      ? visiblePoints.map((point) => point.valueMgDl)
      : [null, null];
    const chart = new uPlot(options, [xs, ys] as uPlot.AlignedData, element);

    return () => chart.destroy();
  }, [
    activityKinds,
    activityLayout,
    activityTrackHeight,
    basalDomain,
    compactAxes,
    dimensions.height,
    dimensions.width,
    glucoseDomain,
    interactive,
    model,
    onZoomChange,
    themeRevision,
    visiblePoints,
    xDomain,
    yAxisSize,
  ]);

  useEffect(() => {
    if (!interactive) {
      setHover(null);
    }
  }, [interactive, xDomain]);

  return (
    <div
      className="relative min-w-0"
      role="img"
      aria-label={mergedChartAriaLabel(
        visiblePoints,
        getVisibleMergedDoses(model.doses, xDomain),
        model.basalSegments.filter(
          (segment) => segment.endMs > xDomain[0] && segment.startMs < xDomain[1]
        ),
        model.unit
      )}
    >
      <div className="relative min-w-0">
        <div
          className={twMerge(
            styles.uplotFrame,
            heightClassName,
            "min-w-0",
            interactive &&
              "cursor-crosshair [&_.u-select]:border [&_.u-select]:border-signal-info-fill/40 [&_.u-select]:bg-signal-info-fill/15"
          )}
          ref={containerRef}
          aria-hidden="true"
          data-testid={interactive ? "merged-desktop-surface" : "merged-mobile-surface"}
        />
        <MergedDoseOverlay
          layout={doseLayout}
          plotLeft={yAxisSize}
          showValues={showDoseValues}
        />
        {activityDecorationIntervals.length > 0 ? (
          <PumpActivityIntervalDecorations
            chartHeight={dimensions.height}
            chartWidth={dimensions.width}
            compactIcons={compactAxes}
            intervals={activityDecorationIntervals}
            plotInsets={{
              left: yAxisSize,
              right: model.hasPump ? yAxisSize : 0,
            }}
            showXAxis
            trackLayout={{
              barHeight: activityLayout.barHeight,
              rowHeight: activityLayout.rowHeight,
              top:
                dimensions.height -
                CHART_X_AXIS_SIZE_PX -
                activityTrackHeight +
                activityLayout.padding,
            }}
            xDomain={xDomain}
          />
        ) : null}
      </div>
      {interactive && hover ? (
        <MergedChartTooltip hover={hover} model={model} xDomain={xDomain} />
      ) : null}
    </div>
  );
}
