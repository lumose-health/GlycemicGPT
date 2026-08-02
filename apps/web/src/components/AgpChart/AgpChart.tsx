"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent
} from "react";
import uPlot from "uplot";
import { Button } from "@/base/Button";
import { Panel } from "@/components/Panel";
import {
  AGP_PERIOD_LABELS,
  useGlucosePercentiles,
  type AgpPeriod
} from "@/hooks/use-glucose-percentiles";
import type { AGPBucket } from "@/lib/api";
import {
  formatGlucose,
  unitLabel,
  type GlucoseUnit
} from "@/lib/glucose-units";
import { getWindowDurationMs } from "@/lib/glucose/history-selection";
import { twMerge } from "@/lib/ui/twMerge";
import { resolveChartPalette } from "@/lib/charts/chart-theme";
import { useOptionalDashboardTimeRange } from "@/components/DashboardTimeRangeProvider";
import styles from "@/components/GlucoseTrendChart/GlucoseTrendChart.module.css";
import type { AgpChartPoint, AgpChartProps } from "./AgpChart.types";

const DEFAULT_Y_DOMAIN: [number, number] = [40, 300];
const HOUR_SPLITS = [0, 3, 6, 9, 12, 15, 18, 21];
const COMPACT_HOUR_SPLITS = [0, 6, 12, 18];

const AGP_PERIODS: { value: AgpPeriod; label: string }[] = [
  { value: "7d", label: "7D" },
  { value: "14d", label: "14D" },
  { value: "30d", label: "30D" },
  { value: "90d", label: "90D" }
];

const clampMgdl = (value: number): number => Math.max(20, Math.min(500, value));

export function formatHour(hour: number): string {
  const normalizedHour = Math.max(0, Math.min(23, Math.round(hour)));

  if (normalizedHour === 0) return "12 AM";
  if (normalizedHour === 12) return "12 PM";
  if (normalizedHour < 12) return `${normalizedHour} AM`;
  return `${normalizedHour - 12} PM`;
}

export function transformBuckets(buckets: AGPBucket[]): AgpChartPoint[] {
  return buckets.map((bucket) => ({
    hour: bucket.hour,
    label: formatHour(bucket.hour),
    p10: clampMgdl(bucket.p10),
    p25: clampMgdl(bucket.p25),
    p50: clampMgdl(bucket.p50),
    p75: clampMgdl(bucket.p75),
    p90: clampMgdl(bucket.p90),
    count: bucket.count
  }));
}

function getAgpPeriodForWindow(
  window: { from: string; to: string } | null | undefined
): AgpPeriod {
  if (!window) return "14d";

  const days = Math.max(
    1,
    Math.ceil(getWindowDurationMs(window) / (24 * 60 * 60 * 1000))
  );

  if (days <= 7) return "7d";
  if (days <= 14) return "14d";
  if (days <= 30) return "30d";
  return "90d";
}

function withAlpha(color: string, alpha: number): string {
  const rgb = color.match(
    /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*[\d.]+)?\s*\)$/
  );

  if (rgb) {
    return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${alpha})`;
  }

  const hex = color.match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i);

  if (hex) {
    return `rgba(${Number.parseInt(hex[1], 16)}, ${Number.parseInt(hex[2], 16)}, ${Number.parseInt(hex[3], 16)}, ${alpha})`;
  }

  return color;
}

function resolveYDomain(points: AgpChartPoint[]): [number, number] {
  if (points.length === 0) return DEFAULT_Y_DOMAIN;

  let min = DEFAULT_Y_DOMAIN[0];
  let max = DEFAULT_Y_DOMAIN[1];

  for (const point of points) {
    min = Math.min(min, point.p10);
    max = Math.max(max, point.p90);
  }

  return [Math.max(0, Math.floor(min / 10) * 10), Math.ceil(max / 10) * 10];
}

function getHourSplits(chart: uPlot): number[] {
  const pixelRatio = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  return chart.bbox.width / pixelRatio < 440 ? COMPACT_HOUR_SPLITS : HOUR_SPLITS;
}

function PeriodSelector({
  period,
  onPeriodChange
}: {
  period: AgpPeriod;
  onPeriodChange: (period: AgpPeriod) => void;
}) {
  const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);

  const handleKeyDown = (event: KeyboardEvent, index: number) => {
    let nextIndex: number | null = null;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      nextIndex = (index + 1) % AGP_PERIODS.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      nextIndex = (index - 1 + AGP_PERIODS.length) % AGP_PERIODS.length;
    } else if (event.key === "Home") {
      event.preventDefault();
      nextIndex = 0;
    } else if (event.key === "End") {
      event.preventDefault();
      nextIndex = AGP_PERIODS.length - 1;
    }

    if (nextIndex !== null) {
      onPeriodChange(AGP_PERIODS[nextIndex].value);
      buttonsRef.current[nextIndex]?.focus();
    }
  };

  return (
    <div
      aria-label="AGP time period"
      className="flex max-w-full gap-1 overflow-x-auto rounded-panel bg-surface-secondary p-1"
      role="radiogroup"
    >
      {AGP_PERIODS.map((option, index) => (
        <Button
          aria-checked={period === option.value}
          aria-label={AGP_PERIOD_LABELS[option.value]}
          className={twMerge(
            "shrink-0 rounded-panel px-2.5 py-1 font_body_3 text-foreground-primary transition-colors sm:px-3",
            period === option.value
              ? "bg-surface-tertiary text-foreground-primary"
              : "hover:text-foreground-primary"
          )}
          key={option.value}
          onClick={() => onPeriodChange(option.value)}
          onKeyDown={(event) => handleKeyDown(event, index)}
          ref={(element) => {
            buttonsRef.current[index] = element;
          }}
          role="radio"
          tabIndex={period === option.value ? 0 : -1}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

function AgpTooltip({
  point,
  unit
}: {
  point: AgpChartPoint;
  unit: GlucoseUnit;
}) {
  const label = unitLabel(unit);

  return (
    <div
      className="pointer-events-none absolute right-2 top-2 z-10 rounded-panel border border-border-hover bg-surface-secondary px-3 py-2 font_metric_caption text-foreground-primary shadow-lg"
      data-testid="agp-tooltip"
    >
      <p className="font_header_4 text-foreground-primary">{point.label}</p>
      {point.count === 0 ? (
        <p>No data for this hour</p>
      ) : (
        <>
          <p className="text-signal-info-text">
            Median: {formatGlucose(point.p50, unit)} {label}
          </p>
          <p>
            25th to 75th: {formatGlucose(point.p25, unit)} to{" "}
            {formatGlucose(point.p75, unit)} {label}
          </p>
          <p>
            10th to 90th: {formatGlucose(point.p10, unit)} to{" "}
            {formatGlucose(point.p90, unit)} {label}
          </p>
        </>
      )}
    </div>
  );
}

function UplotAgpChart({
  data,
  high,
  low,
  period,
  unit,
  yDomain
}: {
  data: AgpChartPoint[];
  high: number;
  low: number;
  period: AgpPeriod;
  unit: GlucoseUnit;
  yDomain: [number, number];
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [hoveredPoint, setHoveredPoint] = useState<AgpChartPoint | null>(null);
  const [themeRevision, setThemeRevision] = useState(0);

  useEffect(() => {
    const element = containerRef.current;

    if (!element) return undefined;

    const updateDimensions = () => {
      const next = {
        width: Math.floor(element.clientWidth),
        height: Math.floor(element.clientHeight)
      };

      if (next.width <= 0 || next.height <= 0) return;

      setDimensions((current) =>
        current.width === next.width && current.height === next.height
          ? current
          : next
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
    if (typeof MutationObserver === "undefined") return undefined;

    const observer = new MutationObserver(() => {
      setThemeRevision((current) => current + 1);
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"]
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = containerRef.current;

    if (!element || dimensions.width <= 0 || dimensions.height <= 0) {
      return undefined;
    }

    element.textContent = "";
    const palette = resolveChartPalette(element);
    const medianStroke = palette.signalInfoText;
    const outerFill = withAlpha(palette.signalInfoFill, 0.15);
    const innerFill = withAlpha(palette.signalInfoFill, 0.3);
    const hours = data.map((point) => point.hour);
    const values: uPlot.AlignedData = [
      hours,
      data.map((point) => point.p10),
      data.map((point) => point.p25),
      data.map((point) => point.p50),
      data.map((point) => point.p75),
      data.map((point) => point.p90),
      data.map(() => low),
      data.map(() => high)
    ];
    const hiddenSeries: uPlot.Series = {
      stroke: palette.transparent,
      width: 0,
      points: { show: false }
    };
    const targetSeries: uPlot.Series = {
      stroke: palette.target,
      width: 1,
      dash: [4, 4],
      points: { show: false }
    };
    const options: uPlot.Options = {
      width: dimensions.width,
      height: dimensions.height,
      padding: [8, 8, 0, 0],
      legend: { show: false },
      cursor: {
        x: true,
        y: true,
        drag: { x: false, y: false },
        points: { show: false }
      },
      scales: {
        x: { time: false, range: [0, 23] },
        y: { range: yDomain }
      },
      axes: [
        {
          stroke: palette.tick,
          grid: { show: false },
          ticks: { stroke: palette.axis },
          splits: getHourSplits,
          values: (_chart, values) => values.map(formatHour)
        },
        {
          label: unitLabel(unit),
          size: 48,
          stroke: palette.tick,
          grid: { stroke: palette.grid, dash: [3, 3] },
          ticks: { stroke: palette.axis },
          values: (_chart, values) =>
            values.map((value) => formatGlucose(value, unit))
        }
      ],
      series: [
        {},
        { ...hiddenSeries, label: "10th percentile" },
        { ...hiddenSeries, label: "25th percentile" },
        {
          label: "Median",
          stroke: medianStroke,
          width: 2,
          points: { show: false }
        },
        { ...hiddenSeries, label: "75th percentile" },
        { ...hiddenSeries, label: "90th percentile" },
        { ...targetSeries, label: "Low target" },
        { ...targetSeries, label: "High target" }
      ],
      bands: [
        { series: [1, 5], dir: 1, fill: outerFill },
        { series: [2, 4], dir: 1, fill: innerFill }
      ],
      hooks: {
        setCursor: [
          (chart) => {
            const index = chart.cursor.idx;
            setHoveredPoint(
              typeof index === "number" && chart.cursor.left !== null
                ? (data[index] ?? null)
                : null
            );
          }
        ]
      }
    };

    const chart = new uPlot(options, values, element);
    return () => chart.destroy();
  }, [
    data,
    dimensions.height,
    dimensions.width,
    high,
    low,
    themeRevision,
    unit,
    yDomain
  ]);

  return (
    <div
      aria-label={`Ambulatory glucose percentile bands for ${AGP_PERIOD_LABELS[period]}`}
      className="relative h-64 min-w-0 sm:h-72 lg:h-80"
      role="img"
    >
      {hoveredPoint ? <AgpTooltip point={hoveredPoint} unit={unit} /> : null}
      <div
        aria-hidden="true"
        className={twMerge(styles.uplotFrame, "h-full min-w-0")}
        ref={containerRef}
      />
    </div>
  );
}

function AgpLegend() {
  return (
    <div
      aria-label="Chart legend"
      className="flex flex-wrap items-center gap-4 font_metric_caption text-foreground-secondary"
    >
      <span className="flex items-center gap-1.5">
        <span
          className="h-0.5 w-5 rounded-panel bg-signal-info-text"
          aria-hidden="true"
        />
        Median
      </span>
      <span className="flex items-center gap-1.5">
        <span
          className="h-3 w-4 rounded-panel bg-signal-info-fill/30"
          aria-hidden="true"
        />
        25th to 75th percentile
      </span>
      <span className="flex items-center gap-1.5">
        <span
          className="h-3 w-4 rounded-panel bg-signal-info-fill/15"
          aria-hidden="true"
        />
        10th to 90th percentile
      </span>
      <span className="flex items-center gap-1.5">
        <span
          className="w-5 border-t border-dashed border-signal-check-fill"
          aria-hidden="true"
        />
        Target range
      </span>
    </div>
  );
}

export function AgpChart({
  className,
  thresholds,
  unit = "mgdl"
}: AgpChartProps) {
  const dashboardTimeRange = useOptionalDashboardTimeRange();
  const { data, isLoading, error, period, setPeriod, refetch } =
    useGlucosePercentiles("14d");

  useEffect(() => {
    if (dashboardTimeRange?.currentWindow) {
      setPeriod(getAgpPeriodForWindow(dashboardTimeRange.currentWindow));
    }
  }, [dashboardTimeRange?.currentWindow, setPeriod]);

  const chartData = useMemo(
    () => transformBuckets(data?.buckets ?? []),
    [data?.buckets]
  );
  const yDomain = useMemo(() => resolveYDomain(chartData), [chartData]);
  const low = clampMgdl(thresholds?.low ?? 70);
  const high = clampMgdl(thresholds?.high ?? 180);

  return (
    <Panel
      aria-busy={isLoading && !data ? "true" : undefined}
      bodyClassName="p-0 sm:p-0"
      className={className}
      data-testid="agp-chart"
      heading="Ambulatory Glucose Profile"
    >
      <div
        aria-label={`Ambulatory Glucose Profile, ${AGP_PERIOD_LABELS[period]} view`}
        className="p-4"
        role="region"
      >
        {dashboardTimeRange ? null : (
          <div className="mb-4 flex justify-end">
            <PeriodSelector period={period} onPeriodChange={setPeriod} />
          </div>
        )}

        {isLoading && !data ? (
          <div
            aria-label="Loading AGP chart"
            className="h-64 animate-pulse rounded-panel bg-surface-secondary"
          />
        ) : error && !data ? (
          <div className="flex h-64 flex-col items-center justify-center text-center">
            <p className="mb-2 text-signal-error-text">
              Unable to load AGP data
            </p>
            <p className="mb-3 font_metric_caption text-foreground-secondary">
              {error}
            </p>
            <Button
              className="rounded-panel bg-surface-secondary px-4 py-2 font_body_3 text-foreground-primary transition-colors hover:bg-surface-primary"
              onClick={refetch}
            >
              Retry
            </Button>
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-center text-foreground-secondary">
            <p>
              Not enough glucose data for AGP analysis. At least 7 days are
              needed.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <UplotAgpChart
              data={chartData}
              high={high}
              low={low}
              period={period}
              unit={unit}
              yDomain={yDomain}
            />
            <AgpLegend />
          </div>
        )}
      </div>
    </Panel>
  );
}

export default AgpChart;
