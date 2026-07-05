"use client";
/**
 * AGP Chart Component
 *
 * Story 30.5: Ambulatory Glucose Profile (AGP) percentile band chart.
 * Shows glucose patterns over a 24-hour day using p10/p25/p50/p75/p90
 * percentile bands, rendered as stacked areas with a median line overlay.
 */
import { useEffect, useMemo, useRef } from"react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from"recharts";
import clsx from"clsx";
import {
  useGlucosePercentiles,
  type AgpPeriod,
  AGP_PERIOD_LABELS,
} from"@/hooks/use-glucose-percentiles";
import type { AGPBucket } from"@/lib/api";
import { formatGlucose, unitLabel, type GlucoseUnit } from"@/lib/glucose-units";
import { getWindowDurationMs } from"@/lib/glucose/history-selection";
import { useOptionalDashboardTimeRange } from"./dashboard-time-range-context";
// --- Constants ---
const CHART_GRID_COLOR ="var(--color-border-default)";
const CHART_AXIS_COLOR ="var(--color-border-hover)";
const CHART_TICK_COLOR ="var(--color-foreground-secondary)";
const AGP_MEDIAN_COLOR ="var(--color-signal-info-text)";
const AGP_OUTER_FILL ="color-mix(in srgb, var(--color-signal-info-fill) 15%, transparent)";
const AGP_INNER_FILL ="color-mix(in srgb, var(--color-signal-info-fill) 30%, transparent)";
const AGP_TARGET_COLOR ="var(--color-signal-check-fill)";
/** Clamp a glucose mg/dL value to physiological bounds. */
const clampMgdl = (v: number): number => Math.max(20, Math.min(500, v));
const AGP_PERIODS: { value: AgpPeriod; label: string }[] = [
  { value:"7d", label:"7D" },
  { value:"14d", label:"14D" },
  { value:"30d", label:"30D" },
  { value:"90d", label:"90D" },
];

function getAgpPeriodForWindow(window: { from: string; to: string } | null | undefined): AgpPeriod {
  if (!window) {
    return "14d";
  }

  const days = Math.max(1, Math.ceil(getWindowDurationMs(window) / (24 * 60 * 60 * 1000)));

  if (days <= 7) {
    return "7d";
  }

  if (days <= 14) {
    return "14d";
  }

  if (days <= 30) {
    return "30d";
  }

  return "90d";
}
// --- Props ---
export interface AgpChartProps {
  className?: string;
  thresholds?: { urgentLow: number; low: number; high: number; urgentHigh: number };
  /** Active glucose display unit (default mgdl). Band math + domain stay
   * mg/dL; only axis tick labels, the axis title, and tooltip convert. */
  unit?: GlucoseUnit;
}
// --- Data transformation ---
interface AgpChartPoint {
  hour: number;
  label: string;
  base: number;
  band_p10_p25: number;
  band_p25_p50: number;
  band_p50_p75: number;
  band_p75_p90: number;
  // Raw values for tooltip
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  count: number;
}
export function formatHour(hour: number): string {
  const h = Math.max(0, Math.min(23, Math.round(hour)));
  if (h === 0) return"12 AM";
  if (h === 12) return"12 PM";
  if (h < 12) return `${h} AM`;
  return `${h - 12} PM`;
}
export function transformBuckets(buckets: AGPBucket[]): AgpChartPoint[] {
  return buckets.map((b) => {
    const p10 = clampMgdl(b.p10);
    const p25 = clampMgdl(b.p25);
    const p50 = clampMgdl(b.p50);
    const p75 = clampMgdl(b.p75);
    const p90 = clampMgdl(b.p90);
    return {
      hour: b.hour,
      label: formatHour(b.hour),
      base: Math.round(p10),
      band_p10_p25: Math.max(0, Math.round(p25 - p10)),
      band_p25_p50: Math.max(0, Math.round(p50 - p25)),
      band_p50_p75: Math.max(0, Math.round(p75 - p50)),
      band_p75_p90: Math.max(0, Math.round(p90 - p75)),
      p10,
      p25,
      p50,
      p75,
      p90,
      count: b.count,
    };
  });
}
// --- Custom tooltip ---
function AgpTooltipContent({
  active,
  payload,
  unit ="mgdl",
}: {
  active?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: Array<{ payload: any }>;
  unit?: GlucoseUnit;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as AgpChartPoint | undefined;
  if (!d) return null;
  if (d.count === 0) {
    return (
      <div className="bg-surface-secondary border border-border-hover rounded-lg px-3 py-2 font_metric_caption shadow-lg">
        <p className="font_header_4 text-foreground-primary mb-1">{d.label}</p>
        <p className="text-foreground-secondary">No data for this hour</p>
      </div>
    );
  }
  const label = unitLabel(unit);
  return (
    <div className="bg-surface-secondary border border-border-hover rounded-lg px-3 py-2 font_metric_caption shadow-lg">
      <p className="font_header_4 text-foreground-primary mb-1">{d.label}</p>
      <p className="text-signal-info-text">Median: {formatGlucose(d.p50, unit)} {label}</p>
      <p className="text-foreground-secondary">25th-75th: {formatGlucose(d.p25, unit)}-{formatGlucose(d.p75, unit)} {label}</p>
      <p className="text-foreground-secondary">10th-90th: {formatGlucose(d.p10, unit)}-{formatGlucose(d.p90, unit)} {label}</p>
      <p className="text-foreground-secondary mt-1">{d.count} readings</p>
    </div>
  );
}
// --- Period selector ---
function PeriodSelector({
  period,
  onPeriodChange,
}: {
  period: AgpPeriod;
  onPeriodChange: (p: AgpPeriod) => void;
}) {
  const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const len = AGP_PERIODS.length;
  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    let newIndex: number | null = null;
    if (e.key ==="ArrowRight" || e.key ==="ArrowDown") {
      e.preventDefault();
      newIndex = (index + 1) % len;
    } else if (e.key ==="ArrowLeft" || e.key ==="ArrowUp") {
      e.preventDefault();
      newIndex = (index - 1 + len) % len;
    } else if (e.key ==="Home") {
      e.preventDefault();
      newIndex = 0;
    } else if (e.key ==="End") {
      e.preventDefault();
      newIndex = len - 1;
    }
    if (newIndex != null) {
      onPeriodChange(AGP_PERIODS[newIndex].value);
      buttonsRef.current[newIndex]?.focus();
    }
  };
  return (
    <div
      role="radiogroup"
      aria-label="AGP time period"
      className="flex gap-1"
    >
      {AGP_PERIODS.map((p, index) => (
        <button
          key={p.value}
          ref={(el) => { buttonsRef.current[index] = el; }}
          type="button"
          role="radio"
          aria-checked={period === p.value}
          aria-label={AGP_PERIOD_LABELS[p.value]}
          tabIndex={period === p.value ? 0 : -1}
          onClick={() => onPeriodChange(p.value)}
          onKeyDown={(e) => handleKeyDown(e, index)}
          className={clsx("px-3 py-1 font_metric_caption rounded-md transition-colors outline-hidden focus-visible:ring-2 focus-visible:ring-signal-info-fill focus-visible:ring-offset-2 focus-visible:ring-offset-surface-primary",
            period === p.value
              ?"bg-signal-info-fill/20 text-signal-info-text border border-signal-info-fill/40"
              :"text-foreground-secondary hover:text-foreground-secondary border border-transparent"
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
// --- Main component ---
export function AgpChart({ className, thresholds, unit ="mgdl" }: AgpChartProps) {
  const dashboardTimeRange = useOptionalDashboardTimeRange();
  const {
    data,
    isLoading,
    error,
    period,
    setPeriod,
    refetch,
  } = useGlucosePercentiles("14d");

  useEffect(() => {
    if (!dashboardTimeRange?.currentWindow) {
      return;
    }

    setPeriod(getAgpPeriodForWindow(dashboardTimeRange.currentWindow));
  }, [dashboardTimeRange?.currentWindow, setPeriod]);
  const low = clampMgdl(thresholds?.low ?? 70);
  const high = clampMgdl(thresholds?.high ?? 180);
  const chartData = useMemo(() => {
    if (!data?.buckets?.length) return [];
    return transformBuckets(data.buckets);
  }, [data]);
  // Calculate Y-axis domain: default [40, 300], expand if data exceeds
  const yDomain = useMemo((): [number, number] => {
    if (!chartData.length) return [40, 300];
    let min = 40;
    let max = 300;
    for (const p of chartData) {
      if (p.p10 < min) min = p.p10;
      if (p.p90 > max) max = p.p90;
    }
    return [Math.max(0, Math.floor(min / 10) * 10), Math.ceil(max / 10) * 10];
  }, [chartData]);
  // Loading state
  if (isLoading && !data) {
    return (
      <section
        data-testid="agp-chart"
        aria-label="Loading AGP chart"
        aria-busy="true"
        className={clsx("bg-surface-primary rounded-xl p-6 border border-border-default",
          className
        )}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="h-6 w-48 bg-surface-secondary rounded-sm animate-pulse" />
          <div className="flex gap-1">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-7 w-10 bg-surface-secondary rounded-sm animate-pulse" />
            ))}
          </div>
        </div>
        <div className="h-64 bg-surface-secondary rounded-sm animate-pulse" />
      </section>
    );
  }
  // Error state
  if (error && !data) {
    return (
      <section
        data-testid="agp-chart"
        aria-label="AGP chart error"
        className={clsx("bg-surface-primary rounded-xl p-6 border border-border-default",
          className
        )}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font_header_4 text-foreground-primary">
            Ambulatory Glucose Profile
          </h2>
          {dashboardTimeRange ? null : <PeriodSelector period={period} onPeriodChange={setPeriod} />}
        </div>
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <p className="text-signal-error-text mb-2">Unable to load AGP data</p>
          <p className="text-foreground-secondary font_metric_caption mb-2">{error}</p>
          <button
            type="button"
            onClick={refetch}
            className="text-signal-info-text hover:text-signal-info-text font_body_3 underline outline-hidden focus-visible:ring-2 focus-visible:ring-signal-info-fill focus-visible:ring-offset-2 focus-visible:ring-offset-surface-primary rounded-sm"
          >
            Retry
          </button>
        </div>
      </section>
    );
  }
  // No data state
  if (!chartData.length) {
    return (
      <section
        data-testid="agp-chart"
        aria-label="AGP chart empty"
        className={clsx("bg-surface-primary rounded-xl p-6 border border-border-default",
          className
        )}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font_header_4 text-foreground-primary">
            Ambulatory Glucose Profile
          </h2>
          {dashboardTimeRange ? null : <PeriodSelector period={period} onPeriodChange={setPeriod} />}
        </div>
        <div className="flex items-center justify-center h-64">
          <p className="text-foreground-secondary">
            Not enough glucose data for AGP analysis (minimum 7 days needed)
          </p>
        </div>
      </section>
    );
  }
  // Data state
  return (
    <section
      data-testid="agp-chart"
      aria-label={`Ambulatory Glucose Profile, ${AGP_PERIOD_LABELS[period]} view`}
      className={clsx("bg-surface-primary rounded-xl p-6 border border-border-default",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font_header_4 text-foreground-primary">
            Ambulatory Glucose Profile
          </h2>
          <p className="font_metric_caption text-foreground-secondary" aria-live="polite">
            {data?.readings_count?.toLocaleString() ?? 0} readings
            {data?.is_truncated && (
              <span className="text-signal-warning-text ml-1" data-testid="agp-truncation-warning">
                (data truncated to available range)
              </span>
            )}
          </p>
        </div>
        {dashboardTimeRange ? null : <PeriodSelector period={period} onPeriodChange={setPeriod} />}
      </div>
      {/* Chart */}
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} vertical={false} />
            <XAxis
              dataKey="hour"
              type="number"
              domain={[0, 23]}
              ticks={[0, 3, 6, 9, 12, 15, 18, 21]}
              tickFormatter={formatHour}
              tick={{ fill: CHART_TICK_COLOR, fontSize: 11 }}
              axisLine={{ stroke: CHART_AXIS_COLOR }}
              tickLine={{ stroke: CHART_AXIS_COLOR }}
            />
            <YAxis
              domain={yDomain}
              // Domain stays mg/dL; only the tick LABEL converts.
              tickFormatter={(v: number) => formatGlucose(v, unit)}
              tick={{ fill: CHART_TICK_COLOR, fontSize: 11 }}
              axisLine={{ stroke: CHART_AXIS_COLOR }}
              tickLine={{ stroke: CHART_AXIS_COLOR }}
              label={{
                value: unitLabel(unit),
                angle: -90,
                position:"insideLeft",
                style: { fill: CHART_TICK_COLOR, fontSize: 11 },
              }}
            />
            <Tooltip content={<AgpTooltipContent unit={unit} />} />
            {/* Target range reference lines */}
            <ReferenceLine
              y={low}
              stroke={AGP_TARGET_COLOR}
              strokeDasharray="4 4"
              strokeWidth={1}
            />
            <ReferenceLine
              y={high}
              stroke={AGP_TARGET_COLOR}
              strokeDasharray="4 4"
              strokeWidth={1}
            />
            {/* Stacked bands: transparent base lifts to p10 */}
            <Area
              type="monotone"
              dataKey="base"
              stackId="agp"
              stroke="none"
              fill="transparent"
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="band_p10_p25"
              stackId="agp"
              stroke="none"
              fill={AGP_OUTER_FILL}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="band_p25_p50"
              stackId="agp"
              stroke="none"
              fill={AGP_INNER_FILL}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="band_p50_p75"
              stackId="agp"
              stroke="none"
              fill={AGP_INNER_FILL}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="band_p75_p90"
              stackId="agp"
              stroke="none"
              fill={AGP_OUTER_FILL}
              isAnimationActive={false}
            />
            {/* Median line (non-stacked, rendered on top) */}
            <Area
              type="monotone"
              dataKey="p50"
              stroke={AGP_MEDIAN_COLOR}
              strokeWidth={2}
              fill="none"
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 mt-3 font_metric_caption text-foreground-secondary" aria-label="Chart legend">
        <span className="flex items-center gap-1.5">
          <span className="w-5 h-0.5 rounded-sm" style={{ backgroundColor: AGP_MEDIAN_COLOR }} aria-hidden="true" />
          Median
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-3 rounded-xs" style={{ backgroundColor: AGP_INNER_FILL }} aria-hidden="true" />
          25th-75th pctl
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-3 rounded-xs" style={{ backgroundColor: AGP_OUTER_FILL }} aria-hidden="true" />
          10th-90th pctl
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-5 h-0 border-t border-dashed border-signal-check-fill" aria-hidden="true" />
          Target range
        </span>
      </div>
    </section>
  );
}
