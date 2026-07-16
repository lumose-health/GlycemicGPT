"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import uPlot from "uplot";
import { Icon } from "@/base/Icon";
import { twMerge } from "@/lib/ui/twMerge";
import {
  type LongActingBasalInjection,
  type PumpActivityInterval,
  type PumpActivityLaneInterval,
  type PumpBasalSegment,
  type PumpSuspensionInterval,
  layoutPumpActivityLanes,
  type RapidInsulinDose,
  resolveRapidDoseDomain,
} from "./insulin-timeline-data";
import {
  CHART_Y_AXIS_SIZE_PX,
  formatSharedTimeTick,
  getSharedTimeSplits,
} from "./chart-axis";
import { resolveChartPalette, type ChartPalette } from "./chart-theme";
import { ChartSectionHeader } from "./ChartSectionHeader";
import styles from "./glucose-trend-chart.module.css";

const BASAL_INJECTION_RADIUS_PX = 16;
const DOSE_TRACK_BOTTOM_PADDING_PX = 8;
const DOSE_TRACK_TOP_PADDING_PX = 12;
const RAPID_DOSE_BAR_WIDTH_PX = 3;
const RAPID_DOSE_MARKER_GAP_PX = 36;
const RAPID_DOSE_MARKER_SIZE_PX = 40;
const RAPID_DOSE_MARKER_COLLISION_GAP_PX = 4;
const RAPID_DOSE_MARKER_MAX_HORIZONTAL_SHIFT_PX = 88;
const TRACK_HOVER_PROXIMITY_PX = 14;

export type InsulinDoseEvent = RapidInsulinDose | LongActingBasalInjection;

export interface ExpandedTimelineHover {
  timestamp: number;
  dose: InsulinDoseEvent | null;
}

interface SharedTimelineProps {
  cursorSyncKey: string;
  multiDay: boolean;
  onHoverChange: (hover: ExpandedTimelineHover | null) => void;
  sectionHeaderSeparator?: boolean;
  showXAxis: boolean;
  xDomain: [number, number];
}

interface DoseTimelineProps extends SharedTimelineProps {
  error: string | null;
  isLoading: boolean;
  longActingBasalInjections: LongActingBasalInjection[];
  onRetry: () => void;
  rapidDoses: RapidInsulinDose[];
}

interface BasalRateTimelineProps extends SharedTimelineProps {
  error: string | null;
  isLoading: boolean;
  isPossiblyTruncated: boolean;
  onRetry: () => void;
  segments: PumpBasalSegment[];
}

interface ActivityModeTimelineProps extends SharedTimelineProps {
  intervals: PumpActivityInterval[];
  suspensionIntervals: PumpSuspensionInterval[];
}

interface TimelineSurfaceState {
  containerRef: React.RefObject<HTMLDivElement | null>;
  dimensions: { width: number; height: number };
  themeRevision: number;
}

function useTimelineSurface(): TimelineSurfaceState {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [themeRevision, setThemeRevision] = useState(0);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;

    const updateDimensions = () => {
      const width = Math.floor(element.clientWidth);
      const height = Math.floor(element.clientHeight);

      if (width > 0 && height > 0) {
        setDimensions((current) => (
          current.width === width && current.height === height
            ? current
            : { width, height }
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
    if (typeof MutationObserver === "undefined") return undefined;

    const observer = new MutationObserver(() => {
      setThemeRevision((current) => current + 1);
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    return () => observer.disconnect();
  }, []);

  return { containerRef, dimensions, themeRevision };
}

function timeAxis(
  palette: ChartPalette,
  multiDay: boolean,
  showXAxis: boolean
): uPlot.Axis {
  return {
    show: true,
    size: showXAxis ? 40 : 0,
    gap: 0,
    stroke: showXAxis ? palette.tick : "rgba(0, 0, 0, 0)",
    grid: { stroke: palette.grid },
    ticks: showXAxis
      ? { show: true, stroke: palette.axis }
      : { show: false },
    splits: getSharedTimeSplits,
    values: (_chart, values) => showXAxis
      ? values.map((value) => formatSharedTimeTick(value, multiDay))
      : [],
  };
}

function eventTimestamp(event: InsulinDoseEvent): number {
  return event.timestampMs;
}

function isRapidDose(event: InsulinDoseEvent): event is RapidInsulinDose {
  return "deliveredUnits" in event;
}

function doseUnits(event: InsulinDoseEvent): number {
  return isRapidDose(event) ? event.deliveredUnits : event.injectedUnits;
}

function doseLabel(event: InsulinDoseEvent): string {
  if (!isRapidDose(event)) return "Basal injection";
  return event.kind === "automated_correction" ? "Auto correction" : "Manual bolus";
}

function doseColor(event: InsulinDoseEvent, palette: ChartPalette): string {
  if (!isRapidDose(event)) return palette.insulinBasal;
  return event.kind === "automated_correction"
    ? palette.insulinCorrection
    : palette.insulinBolus;
}

export function getDoseColorToken(event: InsulinDoseEvent): string {
  if (!isRapidDose(event)) return "var(--color-data-insulin-basal)";
  return event.kind === "automated_correction"
    ? "var(--color-data-insulin-correction)"
    : "var(--color-data-insulin-bolus)";
}

export function getDoseLabel(event: InsulinDoseEvent): string {
  return doseLabel(event);
}

export function getDoseUnits(event: InsulinDoseEvent): number {
  return doseUnits(event);
}

function injectionValueLabel(units: number): string {
  return `${Number.isInteger(units) ? units.toFixed(0) : units.toFixed(1)} U`;
}

export function formatRapidDoseMarkerUnits(units: number): string {
  return `${Number(units.toFixed(2))}`;
}

export function shouldShowRapidDoseMarkers(
  doses: readonly RapidInsulinDose[],
  xDomain: readonly [number, number],
  width: number,
  multiDay: boolean
): boolean {
  if (multiDay || doses.length === 0 || width <= CHART_Y_AXIS_SIZE_PX) {
    return false;
  }

  const plotWidth = width - CHART_Y_AXIS_SIZE_PX;
  if (xDomain[1] <= xDomain[0] || plotWidth < RAPID_DOSE_MARKER_GAP_PX) {
    return false;
  }

  return plotWidth / doses.length >= RAPID_DOSE_MARKER_GAP_PX;
}

export interface RapidDoseMarkerPosition {
  anchorLeft: number;
  dose: RapidInsulinDose;
  left: number;
  top: number;
}

function rapidDoseMarkersCollide(
  left: number,
  top: number,
  other: RapidDoseMarkerPosition
): boolean {
  const minimumSeparation = RAPID_DOSE_MARKER_SIZE_PX + RAPID_DOSE_MARKER_COLLISION_GAP_PX;
  return Math.abs(left - other.left) < minimumSeparation &&
    Math.abs(top - other.top) < minimumSeparation;
}

function rapidDoseMarkerHorizontalCandidates(
  anchorLeft: number,
  minimumLeft: number,
  maximumLeft: number
): number[] {
  const candidates: number[] = [];
  const seen = new Set<string>();
  const addCandidate = (left: number) => {
    const clamped = Math.min(maximumLeft, Math.max(minimumLeft, left));
    const key = clamped.toFixed(3);
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(clamped);
  };

  addCandidate(anchorLeft);
  for (let offset = 1; offset <= RAPID_DOSE_MARKER_MAX_HORIZONTAL_SHIFT_PX; offset += 1) {
    addCandidate(anchorLeft - offset);
    addCandidate(anchorLeft + offset);
  }

  return candidates;
}

export function layoutRapidDoseMarkers(
  doses: readonly RapidInsulinDose[],
  xDomain: readonly [number, number],
  width: number,
  height: number,
  doseScaleMaximum: number
): RapidDoseMarkerPosition[] | null {
  const durationMs = xDomain[1] - xDomain[0];
  const plotWidth = width - CHART_Y_AXIS_SIZE_PX;
  const plotHeight =
    height - DOSE_TRACK_TOP_PADDING_PX - DOSE_TRACK_BOTTOM_PADDING_PX;
  const minimumLeft = CHART_Y_AXIS_SIZE_PX + RAPID_DOSE_MARKER_SIZE_PX / 2;
  const maximumLeft = width - RAPID_DOSE_MARKER_SIZE_PX / 2;

  if (
    doses.length === 0 ||
    durationMs <= 0 ||
    plotWidth <= 0 ||
    plotHeight <= 0 ||
    height <= RAPID_DOSE_MARKER_SIZE_PX ||
    doseScaleMaximum <= 0 ||
    maximumLeft < minimumLeft
  ) {
    return null;
  }

  const basePositions = doses.map<RapidDoseMarkerPosition>((dose) => {
    const anchorLeft = CHART_Y_AXIS_SIZE_PX + (
      (dose.timestampMs - xDomain[0]) / durationMs
    ) * plotWidth;

    return {
      anchorLeft,
      dose,
      left: anchorLeft,
      top:
        DOSE_TRACK_TOP_PADDING_PX +
        (dose.deliveredUnits / doseScaleMaximum) * plotHeight,
    };
  });
  const placementOrder = basePositions
    .map((position, index) => ({
      index,
      verticalConflictCount: basePositions.filter((other, otherIndex) => (
        otherIndex !== index &&
        Math.abs(position.top - other.top) <
          RAPID_DOSE_MARKER_SIZE_PX + RAPID_DOSE_MARKER_COLLISION_GAP_PX
      )).length,
    }))
    .sort((left, right) => (
      right.verticalConflictCount - left.verticalConflictCount ||
      basePositions[left.index].anchorLeft - basePositions[right.index].anchorLeft
    ));
  const placed: RapidDoseMarkerPosition[] = [];
  const positioned = new Array<RapidDoseMarkerPosition>(basePositions.length);

  for (const { index } of placementOrder) {
    const position = basePositions[index];
    const left = rapidDoseMarkerHorizontalCandidates(
      position.anchorLeft,
      minimumLeft,
      maximumLeft
    ).find((candidateLeft) => (
      placed.every((other) => !rapidDoseMarkersCollide(candidateLeft, position.top, other))
    ));

    if (left == null) return null;

    const resolvedPosition = { ...position, left };
    placed.push(resolvedPosition);
    positioned[index] = resolvedPosition;
  }

  return positioned;
}

function rapidDoseScaleMaximum(
  maximumUnits: number,
  showMarkers: boolean,
  height: number
): number {
  if (!showMarkers) return maximumUnits;

  const plotHeight = Math.max(
    1,
    height - DOSE_TRACK_TOP_PADDING_PX - DOSE_TRACK_BOTTOM_PADDING_PX
  );
  const availableMarkerTop = Math.max(
    1,
    height - RAPID_DOSE_MARKER_SIZE_PX - DOSE_TRACK_TOP_PADDING_PX
  );
  const scaleForMarkerHeight = maximumUnits * (plotHeight / availableMarkerTop);
  return Math.ceil(Math.max(maximumUnits * 1.15, scaleForMarkerHeight) * 2) / 2;
}

function drawRapidDoseBar(
  chart: uPlot,
  dose: RapidInsulinDose,
  palette: ChartPalette,
  markerLeft: number | null
): void {
  const pixelRatio = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const x = chart.valToPos(dose.timestampMs / 1000, "x", true);
  const baseline = chart.valToPos(0, "dose", true);
  const y = chart.valToPos(-dose.deliveredUnits, "dose", true);
  if (![x, baseline, y].every(Number.isFinite)) return;

  const color = doseColor(dose, palette);
  const barWidth = RAPID_DOSE_BAR_WIDTH_PX * pixelRatio;

  chart.ctx.save();
  chart.ctx.globalAlpha = 0.7;
  if (markerLeft == null) {
    chart.ctx.fillStyle = color;
    chart.ctx.fillRect(
      x - barWidth / 2,
      baseline,
      barWidth,
      Math.max(pixelRatio, y - baseline)
    );
  } else {
    const markerX = markerLeft * pixelRatio;
    const connectorDelta = markerX - x;
    const connectorDirection = Math.abs(connectorDelta) >= pixelRatio
      ? Math.sign(connectorDelta)
      : 0;
    const connectorEnd = markerX + connectorDirection * barWidth / 2;

    chart.ctx.strokeStyle = color;
    chart.ctx.lineWidth = barWidth;
    chart.ctx.lineCap = "butt";
    chart.ctx.lineJoin = "miter";
    chart.ctx.beginPath();
    chart.ctx.moveTo(x, baseline);
    chart.ctx.lineTo(x, y);
    if (connectorDirection !== 0) {
      chart.ctx.lineTo(connectorEnd, y);
    }
    chart.ctx.stroke();
  }
  chart.ctx.restore();
}

function drawBasalInjection(
  chart: uPlot,
  injection: LongActingBasalInjection,
  markerValue: number,
  palette: ChartPalette
): void {
  const pixelRatio = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const x = chart.valToPos(injection.timestampMs / 1000, "x", true);
  const y = chart.valToPos(markerValue, "dose", true);
  if (![x, y].every(Number.isFinite)) return;

  const radius = BASAL_INJECTION_RADIUS_PX * pixelRatio;
  const color = palette.insulinBasal;

  chart.ctx.save();
  chart.ctx.fillStyle = color;
  chart.ctx.globalAlpha = 0.12;
  chart.ctx.beginPath();
  chart.ctx.arc(x, y, radius, 0, Math.PI * 2);
  chart.ctx.fill();
  chart.ctx.globalAlpha = 1;
  chart.ctx.strokeStyle = color;
  chart.ctx.lineWidth = 1.5 * pixelRatio;
  chart.ctx.stroke();
  chart.ctx.fillStyle = palette.foregroundPrimary;
  chart.ctx.font = `600 ${10 * pixelRatio}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  chart.ctx.textAlign = "center";
  chart.ctx.textBaseline = "middle";
  chart.ctx.fillText(injectionValueLabel(injection.injectedUnits), x, y);
  chart.ctx.restore();
}

function TrackOverlay({
  error,
  isLoading,
  loadingLabel,
  onRetry,
}: {
  error: string | null;
  isLoading: boolean;
  loadingLabel: string;
  onRetry: () => void;
}) {
  if (isLoading) {
    return (
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-center bg-surface-primary/70 font_body_3 text-foreground-secondary"
        role="status"
      >
        {loadingLabel}
      </div>
    );
  }

  if (!error) return null;

  return (
    <div
      className="absolute inset-0 flex items-center justify-center gap-2 bg-surface-primary/85 text-center"
      role="alert"
    >
      <p className="font_body_3 text-signal-error-text">Unable to load insulin history</p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-button bg-surface-secondary px-3 py-1.5 font_body_3 text-foreground-primary outline-hidden focus-visible:ring-2 focus-visible:ring-border-active"
      >
        Retry
      </button>
    </div>
  );
}

export function InsulinDoseTimeline({
  cursorSyncKey,
  error,
  isLoading,
  longActingBasalInjections,
  multiDay,
  onHoverChange,
  onRetry,
  rapidDoses,
  sectionHeaderSeparator,
  showXAxis,
  xDomain,
}: DoseTimelineProps) {
  const { containerRef, dimensions, themeRevision } = useTimelineSurface();
  const onHoverChangeRef = useRef(onHoverChange);
  const visibleRapidDoses = useMemo(
    () => rapidDoses.filter((dose) => dose.timestampMs >= xDomain[0] && dose.timestampMs <= xDomain[1]),
    [rapidDoses, xDomain]
  );
  const visibleBasalInjections = useMemo(
    () => longActingBasalInjections.filter(
      (dose) => dose.timestampMs >= xDomain[0] && dose.timestampMs <= xDomain[1]
    ),
    [longActingBasalInjections, xDomain]
  );
  const visibleEvents = useMemo<InsulinDoseEvent[]>(
    () => [...visibleRapidDoses, ...visibleBasalInjections].sort(
      (left, right) => eventTimestamp(left) - eventTimestamp(right)
    ),
    [visibleBasalInjections, visibleRapidDoses]
  );
  const doseDomain = useMemo(
    () => resolveRapidDoseDomain(visibleRapidDoses),
    [visibleRapidDoses]
  );
  const canAttemptRapidDoseMarkers = useMemo(
    () => shouldShowRapidDoseMarkers(
      visibleRapidDoses,
      xDomain,
      dimensions.width,
      multiDay
    ),
    [dimensions.width, multiDay, visibleRapidDoses, xDomain]
  );
  const markerDoseScaleMaximum = useMemo(
    () => rapidDoseScaleMaximum(doseDomain[1], true, dimensions.height),
    [dimensions.height, doseDomain]
  );
  const rapidDoseMarkerPositions = useMemo(() => {
    if (!canAttemptRapidDoseMarkers) return null;

    return layoutRapidDoseMarkers(
      visibleRapidDoses,
      xDomain,
      dimensions.width,
      dimensions.height,
      markerDoseScaleMaximum
    );
  }, [
    canAttemptRapidDoseMarkers,
    dimensions.height,
    dimensions.width,
    markerDoseScaleMaximum,
    visibleRapidDoses,
    xDomain,
  ]);
  const doseScaleMaximum = rapidDoseMarkerPositions
    ? markerDoseScaleMaximum
    : doseDomain[1];

  useEffect(() => {
    onHoverChangeRef.current = onHoverChange;
  }, [onHoverChange]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || dimensions.width <= 0 || dimensions.height <= 0) return undefined;

    element.textContent = "";
    const injectionMarkerValue = -doseDomain[1] * 0.55;
    const xs = visibleEvents.length > 0
      ? visibleEvents.map((event) => eventTimestamp(event) / 1000)
      : [xDomain[0] / 1000, xDomain[1] / 1000];
    const ys = visibleEvents.length > 0
      ? visibleEvents.map((event) => (
          isRapidDose(event) ? -event.deliveredUnits : injectionMarkerValue
        ))
      : [0, 0];
    const palette = resolveChartPalette(element);
    const options: uPlot.Options = {
      width: dimensions.width,
      height: dimensions.height,
      padding: [
        DOSE_TRACK_TOP_PADDING_PX,
        0,
        DOSE_TRACK_BOTTOM_PADDING_PX,
        0,
      ],
      legend: { show: false },
      cursor: {
        x: true,
        y: false,
        drag: { x: false, y: false },
        points: { show: false },
        sync: { key: cursorSyncKey, scales: ["x", null], setSeries: false },
      },
      scales: {
        x: { time: true, range: [xDomain[0] / 1000, xDomain[1] / 1000] },
        dose: { range: [-doseScaleMaximum, 0] },
      },
      axes: [
        timeAxis(palette, multiDay, showXAxis),
        {
          scale: "dose",
          size: CHART_Y_AXIS_SIZE_PX,
          stroke: palette.tick,
          grid: { stroke: palette.grid },
          ticks: { stroke: palette.axis },
          values: (_chart, values) => values.map((value) => `${Number(Math.abs(value).toFixed(1))}`),
        },
      ],
      series: [
        {},
        { scale: "dose", stroke: "rgba(0, 0, 0, 0)", points: { show: false } },
      ],
      hooks: {
        draw: [
          (chart) => {
            for (const event of visibleEvents) {
              if (isRapidDose(event)) {
                const markerPosition = rapidDoseMarkerPositions?.find(
                  (position) => position.dose === event
                );
                drawRapidDoseBar(chart, event, palette, markerPosition?.left ?? null);
              } else {
                drawBasalInjection(chart, event, injectionMarkerValue, palette);
              }
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
            const event = typeof index === "number" ? visibleEvents[index] ?? null : null;
            const plotWidth = Math.max(1, chart.bbox.width / (window.devicePixelRatio || 1));
            const hoverWindowMs = (
              (xDomain[1] - xDomain[0]) * TRACK_HOVER_PROXIMITY_PX
            ) / plotWidth;

            onHoverChangeRef.current({
              timestamp,
              dose: event && Math.abs(eventTimestamp(event) - timestamp) <= hoverWindowMs
                ? event
                : null,
            });
          },
        ],
      },
    };

    const chart = new uPlot(options, [xs, ys], element);
    return () => chart.destroy();
  }, [
    containerRef,
    cursorSyncKey,
    dimensions.height,
    dimensions.width,
    doseDomain,
    doseScaleMaximum,
    multiDay,
    rapidDoseMarkerPositions,
    showXAxis,
    themeRevision,
    visibleEvents,
    xDomain,
  ]);

  const summaryParts = [
    visibleRapidDoses.length > 0
      ? `${visibleRapidDoses.length} rapid acting dose${visibleRapidDoses.length === 1 ? "" : "s"}`
      : null,
    visibleBasalInjections.length > 0
      ? `${visibleBasalInjections.length} long acting basal injection${visibleBasalInjections.length === 1 ? "" : "s"}`
      : null,
  ].filter(Boolean);

  return (
    <section
      className={sectionHeaderSeparator ? undefined : "border-b border-border-default"}
      aria-label="Insulin doses"
    >
      <ChartSectionHeader
        details={
          <span
            className="flex flex-wrap items-center gap-3"
            aria-label="Insulin dose legend"
          >
            {visibleRapidDoses.some((dose) => dose.kind === "manual_bolus") ? (
              <span className="inline-flex items-center gap-1.5">
                <Icon
                  icon="glucose"
                  decorative
                  className="size-3 -rotate-90 text-data-insulin-bolus"
                />
                Manual bolus
              </span>
            ) : null}
            {visibleRapidDoses.some((dose) => dose.kind === "automated_correction") ? (
              <span className="inline-flex items-center gap-1.5">
                <Icon
                  icon="glucose"
                  decorative
                  className="size-3 -rotate-90 text-data-insulin-correction"
                />
                Auto correction
              </span>
            ) : null}
            {visibleBasalInjections.length > 0 ? (
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="size-3 rounded-full border border-data-insulin-basal"
                  aria-hidden="true"
                />
                Basal injection
              </span>
            ) : null}
          </span>
        }
        heading="Doses"
        separator={sectionHeaderSeparator}
        unit="U"
      />
      <div
        className="relative h-24 min-w-0 sm:h-28"
        role={error ? undefined : "img"}
        aria-label={error ? undefined : `Insulin dose timeline with ${summaryParts.join(" and ") || "no doses"}`}
        aria-busy={isLoading || undefined}
      >
        <div ref={containerRef} aria-hidden="true" className={twMerge(styles.uplotFrame, "h-full min-w-0")} />
        {rapidDoseMarkerPositions && rapidDoseMarkerPositions.length > 0 ? (
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            {rapidDoseMarkerPositions.map(({ dose, left, top }, index) => {
              const markerLabel = formatRapidDoseMarkerUnits(dose.deliveredUnits);
              const key = `${dose.kind}-${dose.timestampMs}-${dose.deliveredUnits}-${index}`;
              const isAutoCorrection = dose.kind === "automated_correction";

              return (
                <span
                  key={key}
                  data-testid={isAutoCorrection
                    ? "auto-correction-dose-marker"
                    : "manual-bolus-dose-marker"}
                  className={twMerge(
                    "absolute size-10",
                    isAutoCorrection
                      ? "text-data-insulin-correction"
                      : "text-data-insulin-bolus"
                  )}
                  style={{
                    left,
                    top,
                    transform: "translateX(-50%)",
                  }}
                >
                  <span className="absolute left-1/2 top-[59%] size-7 -translate-x-1/2 -translate-y-1/2 rounded-full bg-surface-primary" />
                  <Icon
                    icon="glucose"
                    decorative
                    className="absolute inset-0 size-10 -rotate-90"
                  />
                  <span className="absolute left-1/2 top-[59%] -translate-x-1/2 -translate-y-1/2 font_metric_caption text-foreground-primary">
                    {markerLabel}
                  </span>
                </span>
              );
            })}
          </div>
        ) : null}
        <TrackOverlay error={error} isLoading={isLoading} loadingLabel="Loading insulin doses" onRetry={onRetry} />
      </div>
    </section>
  );
}

function basalDomain(segments: readonly PumpBasalSegment[]): [number, number] {
  const maximum = segments.reduce(
    (current, segment) => Math.max(current, segment.rateUnitsPerHour),
    0
  );
  return [0, Math.max(1, Math.ceil(maximum * 2) / 2)];
}

function drawBasalSegments(
  chart: uPlot,
  segments: readonly PumpBasalSegment[],
  palette: ChartPalette
): void {
  const pixelRatio = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const baseline = chart.valToPos(0, "basal", true);

  chart.ctx.save();
  chart.ctx.fillStyle = palette.insulinBasal;
  chart.ctx.strokeStyle = palette.insulinBasal;
  chart.ctx.lineWidth = 1.5 * pixelRatio;

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const x1 = chart.valToPos(segment.startMs / 1000, "x", true);
    const x2 = chart.valToPos(segment.endMs / 1000, "x", true);
    const y = chart.valToPos(segment.rateUnitsPerHour, "basal", true);
    if (![x1, x2, y, baseline].every(Number.isFinite) || x2 <= x1) continue;

    if (segment.rateUnitsPerHour > 0) {
      chart.ctx.globalAlpha = 0.16;
      chart.ctx.fillRect(x1, y, x2 - x1, Math.max(pixelRatio, baseline - y));
    }

    chart.ctx.globalAlpha = 1;
    chart.ctx.beginPath();
    chart.ctx.moveTo(x1, y);
    chart.ctx.lineTo(x2, y);
    chart.ctx.stroke();

    const previous = segments[index - 1];
    if (previous && previous.endMs === segment.startMs) {
      const previousY = chart.valToPos(previous.rateUnitsPerHour, "basal", true);
      chart.ctx.globalAlpha = 0.65;
      chart.ctx.beginPath();
      chart.ctx.moveTo(x1, previousY);
      chart.ctx.lineTo(x1, y);
      chart.ctx.stroke();
      chart.ctx.globalAlpha = 1;
    }
  }

  chart.ctx.restore();
}

export function PumpBasalRateTimeline({
  cursorSyncKey,
  error,
  isLoading,
  isPossiblyTruncated,
  multiDay,
  onHoverChange,
  onRetry,
  sectionHeaderSeparator,
  segments,
  showXAxis,
  xDomain,
}: BasalRateTimelineProps) {
  const { containerRef, dimensions, themeRevision } = useTimelineSurface();
  const onHoverChangeRef = useRef(onHoverChange);
  const visibleSegments = useMemo(
    () => segments.filter((segment) => segment.endMs > xDomain[0] && segment.startMs < xDomain[1]),
    [segments, xDomain]
  );
  const yDomain = useMemo(() => basalDomain(visibleSegments), [visibleSegments]);

  useEffect(() => {
    onHoverChangeRef.current = onHoverChange;
  }, [onHoverChange]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || dimensions.width <= 0 || dimensions.height <= 0) return undefined;

    element.textContent = "";
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
        sync: { key: cursorSyncKey, scales: ["x", null], setSeries: false },
      },
      scales: {
        x: { time: true, range: [xDomain[0] / 1000, xDomain[1] / 1000] },
        basal: { range: yDomain },
      },
      axes: [
        timeAxis(palette, multiDay, showXAxis),
        {
          scale: "basal",
          size: CHART_Y_AXIS_SIZE_PX,
          stroke: palette.tick,
          grid: { stroke: palette.grid },
          ticks: { stroke: palette.axis },
          values: (_chart, values) => values.map((value) => `${Number(value.toFixed(2))}`),
        },
      ],
      series: [
        {},
        { scale: "basal", stroke: "rgba(0, 0, 0, 0)", points: { show: false } },
      ],
      hooks: {
        draw: [(chart) => drawBasalSegments(chart, visibleSegments, palette)],
        setCursor: [
          (chart) => {
            const cursorLeft = chart.cursor.left;
            if (cursorLeft == null || cursorLeft < 0) {
              onHoverChangeRef.current(null);
              return;
            }
            onHoverChangeRef.current({
              timestamp: chart.posToVal(cursorLeft, "x") * 1000,
              dose: null,
            });
          },
        ],
      },
    };

    const chart = new uPlot(
      options,
      [[xDomain[0] / 1000, xDomain[1] / 1000], [0, 0]],
      element
    );
    return () => chart.destroy();
  }, [
    containerRef,
    cursorSyncKey,
    dimensions.height,
    dimensions.width,
    multiDay,
    showXAxis,
    themeRevision,
    visibleSegments,
    xDomain,
    yDomain,
  ]);

  const suspensionCount = visibleSegments.filter(
    (segment) => segment.deliveryState === "suspended"
  ).length;

  return (
    <section
      className={sectionHeaderSeparator ? undefined : "border-t border-border-default"}
      aria-label="Pump basal rate"
    >
      <ChartSectionHeader
        details={
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-2 w-4 border border-data-insulin-basal bg-data-insulin-basal/15"
              aria-hidden="true"
            />
            Basal delivery
          </span>
        }
        heading="Pump basal"
        separator={sectionHeaderSeparator}
        unit="U/hr"
      />
      <div
        className="relative h-24 min-w-0 sm:h-28"
        role={error ? undefined : "img"}
        aria-label={error ? undefined : `Pump basal rate timeline with ${visibleSegments.length} delivery segments and ${suspensionCount} suspensions`}
        aria-busy={isLoading || undefined}
      >
        <div ref={containerRef} aria-hidden="true" className={twMerge(styles.uplotFrame, "h-full min-w-0")} />
        <TrackOverlay error={error} isLoading={isLoading} loadingLabel="Loading pump basal" onRetry={onRetry} />
      </div>
      {isPossiblyTruncated ? (
        <p className="px-9 pb-2 font_metric_caption text-signal-warning-text" role="status">
          Basal history may be incomplete for this range.
        </p>
      ) : null}
    </section>
  );
}

function modeColor(interval: PumpActivityLaneInterval, palette: ChartPalette): string {
  return interval.kind === "sleep"
    ? palette.insulinModeSleep
    : palette.insulinModeExercise;
}

function drawActivityIntervals(
  chart: uPlot,
  intervals: readonly PumpActivityLaneInterval[],
  palette: ChartPalette,
  topValue: number,
  bottomValue: number
): void {
  const pixelRatio = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const top = chart.valToPos(topValue, "mode", true);
  const bottom = chart.valToPos(bottomValue, "mode", true);

  chart.ctx.save();
  chart.ctx.fillStyle = palette.grid;
  chart.ctx.globalAlpha = 0.45;
  chart.ctx.fillRect(chart.bbox.left, top, chart.bbox.width, bottom - top);

  for (const interval of intervals) {
    const x1 = chart.valToPos(interval.startMs / 1000, "x", true);
    const x2 = chart.valToPos(interval.endMs / 1000, "x", true);
    if (![x1, x2].every(Number.isFinite) || x2 <= x1) continue;

    const color = modeColor(interval, palette);
    chart.ctx.fillStyle = color;
    chart.ctx.globalAlpha = 0.18;
    chart.ctx.fillRect(x1, top, x2 - x1, bottom - top);
    chart.ctx.globalAlpha = 1;
    chart.ctx.strokeStyle = color;
    chart.ctx.lineWidth = pixelRatio;
    chart.ctx.strokeRect(x1, top, x2 - x1, bottom - top);

    chart.ctx.save();
    chart.ctx.beginPath();
    chart.ctx.rect(x1, top, x2 - x1, bottom - top);
    chart.ctx.clip();
    chart.ctx.strokeStyle = color;
    chart.ctx.globalAlpha = 1;

    if (interval.kind === "sleep") {
      chart.ctx.lineWidth = pixelRatio;
      const spacing = 8 * pixelRatio;
      const height = bottom - top;

      for (let x = x1 - height; x < x2; x += spacing) {
        chart.ctx.beginPath();
        chart.ctx.moveTo(x, bottom);
        chart.ctx.lineTo(x + height, top);
        chart.ctx.stroke();
      }
    } else {
      const spacing = 8 * pixelRatio;
      chart.ctx.lineWidth = pixelRatio;

      for (let x = x1 + spacing / 2; x < x2; x += spacing) {
        chart.ctx.beginPath();
        chart.ctx.moveTo(x, top);
        chart.ctx.lineTo(x, bottom);
        chart.ctx.stroke();
      }
    }

    chart.ctx.restore();

    if (x2 - x1 >= 48 * pixelRatio) {
      chart.ctx.font = `600 ${10 * pixelRatio}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      chart.ctx.textAlign = "center";
      chart.ctx.textBaseline = "middle";
      const label = interval.kind === "sleep" ? "Sleep" : "Exercise";
      const labelX = x1 + (x2 - x1) / 2;
      const labelY = top + (bottom - top) / 2;
      const labelPaddingX = 4 * pixelRatio;
      const labelHeight = 16 * pixelRatio;
      const labelWidth = chart.ctx.measureText(label).width + labelPaddingX * 2;

      chart.ctx.fillStyle = palette.surfaceFixedDark;
      chart.ctx.fillRect(
        labelX - labelWidth / 2,
        labelY - labelHeight / 2,
        labelWidth,
        labelHeight
      );
      chart.ctx.fillStyle = palette.foregroundFixedLight;
      chart.ctx.fillText(label, labelX, labelY);
    }
  }

  chart.ctx.restore();
}

function drawSuspensionIntervals(
  chart: uPlot,
  intervals: readonly PumpActivityLaneInterval[],
  palette: ChartPalette,
  topValue: number,
  bottomValue: number
): void {
  const pixelRatio = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const top = chart.valToPos(topValue, "mode", true);
  const bottom = chart.valToPos(bottomValue, "mode", true);

  chart.ctx.save();
  chart.ctx.fillStyle = palette.grid;
  chart.ctx.globalAlpha = 0.45;
  chart.ctx.fillRect(chart.bbox.left, top, chart.bbox.width, bottom - top);

  for (const interval of intervals) {
    const x1 = chart.valToPos(interval.startMs / 1000, "x", true);
    const x2 = chart.valToPos(interval.endMs / 1000, "x", true);
    if (![x1, x2, top, bottom].every(Number.isFinite) || x2 <= x1) continue;

    chart.ctx.fillStyle = palette.error;
    chart.ctx.globalAlpha = 0.18;
    chart.ctx.fillRect(x1, top, x2 - x1, bottom - top);
    chart.ctx.globalAlpha = 1;
    chart.ctx.strokeStyle = palette.error;
    chart.ctx.lineWidth = 1.5 * pixelRatio;
    chart.ctx.strokeRect(x1, top, x2 - x1, bottom - top);

    chart.ctx.save();
    chart.ctx.beginPath();
    chart.ctx.rect(x1, top, x2 - x1, bottom - top);
    chart.ctx.clip();
    const spacing = 8 * pixelRatio;
    const height = bottom - top;
    for (let x = x1 - height; x < x2; x += spacing) {
      chart.ctx.beginPath();
      chart.ctx.moveTo(x, bottom);
      chart.ctx.lineTo(x + height, top);
      chart.ctx.stroke();
    }
    chart.ctx.restore();

    chart.ctx.lineWidth = 2 * pixelRatio;
    chart.ctx.beginPath();
    chart.ctx.moveTo(x1, top);
    chart.ctx.lineTo(x1, bottom);
    if (interval.hasConfirmedResume) {
      chart.ctx.moveTo(x2, top);
      chart.ctx.lineTo(x2, bottom);
    }
    chart.ctx.stroke();
  }

  chart.ctx.restore();
}

function activityLaneRange(lane: number, laneCount: number): [number, number] {
  if (laneCount <= 1) {
    return [0.78, 0.22];
  }

  const top = 0.94;
  const bottom = 0.06;
  const gap = 0.08;
  const laneHeight = (top - bottom - gap * (laneCount - 1)) / laneCount;
  const laneTop = top - lane * (laneHeight + gap);
  return [laneTop, laneTop - laneHeight];
}

export function PumpActivityModeTimeline({
  cursorSyncKey,
  intervals,
  multiDay,
  onHoverChange,
  sectionHeaderSeparator,
  showXAxis,
  suspensionIntervals,
  xDomain,
}: ActivityModeTimelineProps) {
  const { containerRef, dimensions, themeRevision } = useTimelineSurface();
  const onHoverChangeRef = useRef(onHoverChange);
  const visibleIntervals = useMemo(
    () => intervals.filter((interval) => interval.endMs > xDomain[0] && interval.startMs < xDomain[1]),
    [intervals, xDomain]
  );
  const visibleSuspensionIntervals = useMemo(
    () => suspensionIntervals.filter(
      (interval) => interval.endMs > xDomain[0] && interval.startMs < xDomain[1]
    ),
    [suspensionIntervals, xDomain]
  );
  const visibleLayout = useMemo(
    () => layoutPumpActivityLanes(
      visibleIntervals,
      visibleSuspensionIntervals
    ),
    [visibleIntervals, visibleSuspensionIntervals]
  );

  useEffect(() => {
    onHoverChangeRef.current = onHoverChange;
  }, [onHoverChange]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || dimensions.width <= 0 || dimensions.height <= 0) return undefined;

    element.textContent = "";
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
        sync: { key: cursorSyncKey, scales: ["x", null], setSeries: false },
      },
      scales: {
        x: { time: true, range: [xDomain[0] / 1000, xDomain[1] / 1000] },
        mode: { range: [0, 1] },
      },
      axes: [
        timeAxis(palette, multiDay, showXAxis),
        {
          scale: "mode",
          size: CHART_Y_AXIS_SIZE_PX,
          stroke: "rgba(0, 0, 0, 0)",
          grid: { show: false },
          ticks: { show: false },
          values: () => [],
        },
      ],
      series: [
        {},
        { scale: "mode", stroke: "rgba(0, 0, 0, 0)", points: { show: false } },
      ],
      hooks: {
        draw: [
          (chart) => {
            const laneCount = visibleLayout.reduce(
              (count, interval) => Math.max(count, interval.lane + 1),
              1
            );

            for (let lane = 0; lane < laneCount; lane += 1) {
              const [top, bottom] = activityLaneRange(lane, laneCount);
              const laneIntervals = visibleLayout.filter(
                (interval) => interval.lane === lane
              );
              const modeIntervals = laneIntervals.filter(
                (interval) => interval.kind !== "suspension"
              );
              const suspensionLaneIntervals = laneIntervals.filter(
                (interval) => interval.kind === "suspension"
              );

              if (modeIntervals.length > 0) {
                drawActivityIntervals(
                  chart,
                  modeIntervals,
                  palette,
                  top,
                  bottom
                );
              }
              if (suspensionLaneIntervals.length > 0) {
                drawSuspensionIntervals(
                  chart,
                  suspensionLaneIntervals,
                  palette,
                  top,
                  bottom
                );
              }
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
            onHoverChangeRef.current({
              timestamp: chart.posToVal(cursorLeft, "x") * 1000,
              dose: null,
            });
          },
        ],
      },
    };

    const chart = new uPlot(
      options,
      [[xDomain[0] / 1000, xDomain[1] / 1000], [0.5, 0.5]],
      element
    );
    return () => chart.destroy();
  }, [
    containerRef,
    cursorSyncKey,
    dimensions.height,
    dimensions.width,
    multiDay,
    showXAxis,
    themeRevision,
    visibleIntervals,
    visibleLayout,
    visibleSuspensionIntervals,
    xDomain,
  ]);

  return (
    <section
      className={sectionHeaderSeparator ? undefined : "border-t border-border-default"}
      aria-label="Pump activity mode"
    >
      <ChartSectionHeader
        details={
          <span className="flex items-center gap-3" aria-label="Pump activity legend">
            {visibleIntervals.some((interval) => interval.mode === "sleep") ? (
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="flex h-3 w-4 items-center justify-center border border-data-insulin-mode-sleep bg-data-insulin-mode-sleep/15 text-[8px] leading-none text-foreground-primary"
                  aria-hidden="true"
                >
                  Z
                </span>
                Sleep
              </span>
            ) : null}
            {visibleIntervals.some((interval) => interval.mode === "exercise") ? (
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="flex h-3 w-4 items-center justify-center border border-data-insulin-mode-exercise bg-data-insulin-mode-exercise/15 text-[8px] leading-none text-foreground-primary"
                  aria-hidden="true"
                >
                  ↑
                </span>
                Exercise
              </span>
            ) : null}
            {visibleSuspensionIntervals.length > 0 ? (
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="h-3 w-4 border border-signal-error-fill bg-signal-error-fill/15"
                  aria-hidden="true"
                />
                Suspended
              </span>
            ) : null}
          </span>
        }
        heading="Pump activity"
        separator={sectionHeaderSeparator}
      />
      <div
        className="relative h-20 min-w-0 sm:h-24"
        role="img"
        aria-label={`Pump activity timeline with ${visibleIntervals.length} Sleep or Exercise interval${visibleIntervals.length === 1 ? "" : "s"} and ${visibleSuspensionIntervals.length} suspension interval${visibleSuspensionIntervals.length === 1 ? "" : "s"}`}
      >
        <div ref={containerRef} aria-hidden="true" className={twMerge(styles.uplotFrame, "h-full min-w-0")} />
      </div>
    </section>
  );
}
