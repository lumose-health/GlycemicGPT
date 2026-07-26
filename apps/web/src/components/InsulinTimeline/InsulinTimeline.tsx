"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import uPlot from "uplot";
import { Button } from "@/base";
import type { BolusReviewItem } from "@/lib/api";
import { twMerge } from "@/lib/ui/twMerge";
import {
  CHART_Y_AXIS_SIZE_PX,
  getSharedTimeSplits,
} from "@/lib/charts/chart-axis";
import {
  resolveChartPalette,
  type ChartPalette,
} from "@/lib/charts/chart-theme";
import styles from "@/components/GlucoseTrendChart/GlucoseTrendChart.module.css";
import type {
  InsulinEventKind,
  InsulinTimelineEvent,
  InsulinTimelineProps,
} from "./InsulinTimeline.types";

const MAX_BOLUS_UNITS = 60;
const MAX_BASAL_INJECTION_UNITS = 160;
const MARKER_SIZE_PX = 5;
const INSULIN_HOVER_PROXIMITY_PX = 14;

function getEventKind(item: BolusReviewItem): InsulinEventKind {
  if (item.event_type === "basal_injection") {
    return "basal";
  }

  if (item.is_automated) {
    return "automated";
  }

  if (item.event_type === "correction") {
    return "correction";
  }

  return "bolus";
}

function getEventLabel(kind: InsulinEventKind): string {
  switch (kind) {
    case "basal":
      return "Basal injection";
    case "correction":
      return "Correction";
    case "automated":
      return "Auto correction";
    default:
      return "Manual bolus";
  }
}

export function transformInsulinEvents(
  items: BolusReviewItem[],
): InsulinTimelineEvent[] {
  const seen = new Set<string>();

  return items
    .map((item) => {
      const timestamp = new Date(item.event_timestamp).getTime();
      const kind = getEventKind(item);
      const maxUnits =
        kind === "basal" ? MAX_BASAL_INJECTION_UNITS : MAX_BOLUS_UNITS;

      if (
        !Number.isFinite(timestamp) ||
        !Number.isFinite(item.units) ||
        item.units <= 0 ||
        item.units > maxUnits
      ) {
        return null;
      }

      const dedupeKey = `${timestamp}:${item.units}:${kind}`;

      if (seen.has(dedupeKey)) {
        return null;
      }

      seen.add(dedupeKey);

      return {
        timestamp,
        units: item.units,
        kind,
        label: getEventLabel(kind),
      } satisfies InsulinTimelineEvent;
    })
    .filter((event): event is InsulinTimelineEvent => event !== null)
    .sort((left, right) => left.timestamp - right.timestamp);
}

function formatXTick(epochSeconds: number, multiDay: boolean): string {
  const date = new Date(epochSeconds * 1000);

  if (multiDay) {
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function getEventColor(
  event: InsulinTimelineEvent,
  palette: ChartPalette,
): string {
  switch (event.kind) {
    case "basal":
      return palette.insulinBasal;
    case "correction":
      return palette.insulinCorrection;
    case "automated":
      return palette.insulinAutomated;
    default:
      return palette.insulinBolus;
  }
}

export function getInsulinEventColorToken(kind: InsulinEventKind): string {
  switch (kind) {
    case "basal":
      return "var(--color-data-insulin-basal)";
    case "correction":
      return "var(--color-data-insulin-correction)";
    case "automated":
      return "var(--color-data-insulin-automated)";
    default:
      return "var(--color-data-insulin-bolus)";
  }
}

export function getInsulinPlotValue(event: InsulinTimelineEvent): number {
  return event.kind === "bolus" ? -event.units : event.units;
}

function drawInsulinBaseline(chart: uPlot, palette: ChartPalette): void {
  const baseline = chart.valToPos(0, "insulin", true);

  if (!Number.isFinite(baseline)) {
    return;
  }

  chart.ctx.save();
  chart.ctx.strokeStyle = palette.axis;
  chart.ctx.lineWidth =
    typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  chart.ctx.beginPath();
  chart.ctx.moveTo(chart.bbox.left, baseline);
  chart.ctx.lineTo(chart.bbox.left + chart.bbox.width, baseline);
  chart.ctx.stroke();
  chart.ctx.restore();
}

function drawMarker(
  chart: uPlot,
  event: InsulinTimelineEvent,
  palette: ChartPalette,
): void {
  const pixelRatio =
    typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const x = chart.valToPos(event.timestamp / 1000, "x", true);
  const y = chart.valToPos(getInsulinPlotValue(event), "insulin", true);
  const baseline = chart.valToPos(0, "insulin", true);
  const markerSize = MARKER_SIZE_PX * pixelRatio;
  const color = getEventColor(event, palette);

  if (![x, y, baseline].every(Number.isFinite)) {
    return;
  }

  chart.ctx.save();
  chart.ctx.strokeStyle = color;
  chart.ctx.fillStyle = color;
  chart.ctx.lineWidth = 1.5 * pixelRatio;

  if (event.kind === "basal") {
    const barWidth = markerSize * 1.6;
    chart.ctx.globalAlpha = 0.25;
    chart.ctx.fillRect(
      x - barWidth / 2,
      y,
      barWidth,
      Math.max(pixelRatio, baseline - y),
    );
    chart.ctx.globalAlpha = 1;
    chart.ctx.strokeRect(
      x - barWidth / 2,
      y,
      barWidth,
      Math.max(pixelRatio, baseline - y),
    );
    chart.ctx.restore();
    return;
  }

  chart.ctx.globalAlpha = 0.55;
  chart.ctx.beginPath();
  chart.ctx.moveTo(x, baseline);
  chart.ctx.lineTo(x, y);
  chart.ctx.stroke();
  chart.ctx.globalAlpha = 1;
  chart.ctx.beginPath();

  if (event.kind === "automated") {
    chart.ctx.moveTo(x, y - markerSize);
    chart.ctx.lineTo(x + markerSize, y);
    chart.ctx.lineTo(x, y + markerSize);
    chart.ctx.lineTo(x - markerSize, y);
    chart.ctx.closePath();
  } else if (event.kind === "correction") {
    chart.ctx.moveTo(x, y - markerSize);
    chart.ctx.lineTo(x + markerSize, y + markerSize);
    chart.ctx.lineTo(x - markerSize, y + markerSize);
    chart.ctx.closePath();
  } else {
    chart.ctx.arc(x, y, markerSize, 0, Math.PI * 2);
  }

  chart.ctx.fill();
  chart.ctx.restore();
}

function resolveYDomain(data: InsulinTimelineEvent[]): [number, number] {
  const maxBolus = data.reduce(
    (current, event) =>
      event.kind === "bolus" ? Math.max(current, event.units) : current,
    0,
  );
  const maxCorrection = data.reduce(
    (current, event) =>
      event.kind !== "bolus" ? Math.max(current, event.units) : current,
    0,
  );

  return [
    -Math.max(2, Math.ceil(maxBolus * 1.2)),
    Math.max(2, Math.ceil(maxCorrection * 1.2)),
  ];
}

export function InsulinTimeline({
  cursorSyncKey,
  data,
  error,
  isLoading,
  multiDay,
  onHoverChange,
  onRetry,
  xDomain,
}: InsulinTimelineProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dataRef = useRef(data);
  const onHoverChangeRef = useRef(onHoverChange);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [themeRevision, setThemeRevision] = useState(0);
  const visibleData = useMemo(
    () =>
      data.filter(
        (event) =>
          event.timestamp >= xDomain[0] && event.timestamp <= xDomain[1],
      ),
    [data, xDomain],
  );
  const yDomain = useMemo(() => resolveYDomain(visibleData), [visibleData]);

  useEffect(() => {
    dataRef.current = visibleData;
    onHoverChangeRef.current = onHoverChange;
  }, [onHoverChange, visibleData]);

  useEffect(() => {
    const element = containerRef.current;

    if (!element) {
      return undefined;
    }

    const updateDimensions = () => {
      const nextWidth = Math.floor(element.clientWidth);
      const nextHeight = Math.floor(element.clientHeight);

      if (nextWidth > 0 && nextHeight > 0) {
        setDimensions((current) =>
          current.width === nextWidth && current.height === nextHeight
            ? current
            : { width: nextWidth, height: nextHeight },
        );
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

    const chartData =
      visibleData.length > 0
        ? visibleData
        : ([
            { timestamp: xDomain[0], units: 0, kind: "bolus", label: "" },
            { timestamp: xDomain[1], units: 0, kind: "bolus", label: "" },
          ] satisfies InsulinTimelineEvent[]);
    const xs = chartData.map((event) => event.timestamp / 1000);
    const ys = chartData.map(getInsulinPlotValue);
    const palette = resolveChartPalette(element);
    const options: uPlot.Options = {
      width: dimensions.width,
      height: dimensions.height,
      padding: [0, 0, 0, 0],
      legend: { show: false },
      cursor: {
        x: true,
        y: false,
        drag: { x: false, y: false },
        points: { show: false },
        sync: {
          key: cursorSyncKey,
          scales: ["x", null],
          setSeries: false,
        },
      },
      scales: {
        x: {
          time: true,
          range: [xDomain[0] / 1000, xDomain[1] / 1000],
        },
        insulin: { range: yDomain },
      },
      axes: [
        {
          stroke: palette.tick,
          grid: { stroke: palette.grid },
          ticks: { stroke: palette.axis },
          splits: getSharedTimeSplits,
          values: (_chart, values) =>
            values.map((value) => formatXTick(value, multiDay)),
        },
        {
          scale: "insulin",
          size: CHART_Y_AXIS_SIZE_PX,
          stroke: palette.tick,
          grid: { stroke: palette.grid },
          ticks: { stroke: palette.axis },
          values: (_chart, values) =>
            values.map((value) => `${Number(Math.abs(value).toFixed(1))}`),
        },
      ],
      series: [
        {},
        {
          scale: "insulin",
          stroke: "rgba(0, 0, 0, 0)",
          width: 1,
          points: { show: false },
        },
      ],
      hooks: {
        draw: [
          (chart) => {
            drawInsulinBaseline(chart, palette);
            for (const event of dataRef.current) {
              drawMarker(chart, event, palette);
            }
          },
        ],
        setCursor: [
          (chart) => {
            const cursorLeft = chart.cursor.left;

            if (cursorLeft == null || cursorLeft < 0) {
              onHoverChangeRef.current(null);
              return;
            }

            const timestamp = chart.posToVal(cursorLeft, "x") * 1000;
            const index = chart.cursor.idx;
            const event =
              typeof index === "number" ? dataRef.current[index] : null;
            const plotWidth = Math.max(
              1,
              chart.bbox.width / (window.devicePixelRatio || 1),
            );
            const hoverWindowMs =
              ((xDomain[1] - xDomain[0]) * INSULIN_HOVER_PROXIMITY_PX) /
              plotWidth;
            const nearbyEvent =
              event && Math.abs(event.timestamp - timestamp) <= hoverWindowMs
                ? event
                : null;

            onHoverChangeRef.current({
              timestamp,
              event: nearbyEvent,
            });
          },
        ],
      },
    };

    const chart = new uPlot(options, [xs, ys], element);

    return () => chart.destroy();
  }, [
    dimensions.height,
    dimensions.width,
    cursorSyncKey,
    multiDay,
    themeRevision,
    visibleData,
    xDomain,
    yDomain,
  ]);

  const accessibleSummary =
    visibleData.length === 0
      ? "Insulin timeline with no recorded doses in this time range"
      : `Insulin timeline with ${visibleData.length} recorded dose${visibleData.length === 1 ? "" : "s"}`;

  return (
    <section
      className="border-t border-border-default"
      aria-label="Insulin doses"
    >
      <div
        className="relative h-36 min-w-0 sm:h-40"
        role={error ? undefined : "img"}
        aria-label={error ? undefined : accessibleSummary}
      >
        <div
          ref={containerRef}
          aria-hidden="true"
          className={twMerge(styles.uplotFrame, "h-full min-w-0")}
        />
        {isLoading ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-surface-primary/70 font_body_3 text-foreground-secondary">
            Loading insulin doses
          </div>
        ) : error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface-primary/80 text-center">
            <p className="font_body_3 text-signal-error-text">
              Unable to load insulin doses
            </p>
            <Button
              type="button"
              onClick={onRetry}
              className="rounded-button bg-surface-secondary px-3 py-1.5 font_body_3 text-foreground-primary outline-hidden focus-visible:ring-2 focus-visible:ring-border-active"
            >
              Retry
            </Button>
          </div>
        ) : visibleData.length === 0 ? (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center font_body_3 text-foreground-secondary">
            No insulin doses in this time range
          </p>
        ) : null}
      </div>
    </section>
  );
}
