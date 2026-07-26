"use client";
/**
 * Insulin Summary Stats Panel
 *
 * Story 30.7: Displays aggregate insulin delivery statistics including
 * TDD, basal/bolus split, correction counts. Period-selectable.
 */
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { AlertCircle, Hash } from "lucide-react";
import { Button } from "@/base";
import { Panel } from "@/components/Panel";
import {
  useInsulinSummary,
  type InsulinPeriod,
  INSULIN_PERIOD_LABELS,
} from "@/hooks/use-insulin-summary";
import { twMerge } from "@/lib/ui/twMerge";
import { useOptionalDashboardTimeRange } from "@/components/DashboardTimeRangeProvider";
import type { InsulinSummaryStatsProps } from "./InsulinSummaryStats.types";
const PERIOD_OPTIONS: { value: InsulinPeriod; label: string }[] = [
  { value: "24h", label: "24H" },
  { value: "3d", label: "3D" },
  { value: "7d", label: "7D" },
  { value: "14d", label: "14D" },
  { value: "30d", label: "30D" },
  { value: "90d", label: "90D" },
];
type RingMetricKey = "basal" | "bolus" | "corrections";
const MAX_DOSE_DISPLAY = 200;
function safeFixed1(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "--";
  if (value > MAX_DOSE_DISPLAY) return `>${MAX_DOSE_DISPLAY}`;
  return value.toFixed(1);
}
function safeCount(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "--";
  return Math.round(value).toLocaleString();
}
function StatSkeleton() {
  return (
    <div className="animate-pulse border-b border-border-default px-3 py-3">
      <div className="h-4 w-24 rounded-sm bg-surface-tertiary" />
      <div className="mt-3 h-7 w-20 rounded-sm bg-surface-tertiary" />
      <div className="mt-2 h-3 w-28 rounded-sm bg-surface-secondary" />
    </div>
  );
}
interface SummaryMetricProps {
  activeMetricKey: RingMetricKey | null;
  label: string;
  metricKey: RingMetricKey;
  onHoverChange: (metricKey: RingMetricKey | null) => void;
  value: string;
  detail: ReactNode;
  colorClassName: string;
  ariaLabel: string;
}
function SummaryMetric({
  activeMetricKey,
  label,
  metricKey,
  onHoverChange,
  value,
  detail,
  colorClassName,
  ariaLabel,
}: SummaryMetricProps) {
  const isHighlighted = activeMetricKey === metricKey;
  const isDimmed = activeMetricKey !== null && !isHighlighted;

  return (
    <div
      className={twMerge(
        "min-w-0 px-3 py-3 transition-[box-shadow,filter,background-color] duration-200 md:hover:bg-surface-primary",
        isHighlighted
          ? "md:bg-surface-primary md:ring-1 md:ring-inset md:ring-border-active"
          : null,
        isDimmed ? "md:brightness-75 md:saturate-50" : null,
      )}
      role="group"
      aria-label={ariaLabel}
      onMouseEnter={() => onHoverChange(metricKey)}
      onMouseLeave={() => onHoverChange(null)}
    >
      <div className="flex items-center gap-2">
        <span
          className={twMerge("h-3 w-3 shrink-0 rounded-full", colorClassName)}
          aria-hidden="true"
        />
        <span className="text-foreground-secondary font_metric_caption">
          {label}
        </span>
      </div>
      <p className="mt-2 font_header_3 text-foreground-primary">{value}</p>
      <div className="mt-1 font_metric_caption text-foreground-secondary">
        {detail}
      </div>
    </div>
  );
}
interface CountMetricProps {
  label: string;
  value: string;
  detail: string;
  ariaLabel: string;
}
function CountMetric({ label, value, detail, ariaLabel }: CountMetricProps) {
  return (
    <div className="min-w-0 px-3 py-3" role="group" aria-label={ariaLabel}>
      <div className="flex min-w-0 items-center gap-2">
        <Hash
          className="h-4 w-4 shrink-0 text-signal-warning-text"
          aria-hidden="true"
        />
        <span className="min-w-0 font_metric_caption text-foreground-secondary">
          {label}
        </span>
      </div>
      <p className="mt-2 font_header_4 text-foreground-primary">{value}</p>
      <p className="mt-1 font_metric_caption text-foreground-secondary">
        {detail}
      </p>
    </div>
  );
}
interface RingMetric {
  key: RingMetricKey;
  label: string;
  value: number;
  strokeClassName: string;
}
interface RingSegment extends RingMetric {
  dash: number;
  offset: number;
}
// With the current ring radius and desktop size, 0.7 path units is about 4px.
const RING_GAP_PATH_UNITS = 0.7;
function buildRingSegments(metrics: RingMetric[]): RingSegment[] {
  const visible = metrics.filter(
    (metric) => Number.isFinite(metric.value) && metric.value > 0,
  );
  const total = visible.reduce((sum, metric) => sum + metric.value, 0);

  if (total <= 0) {
    return [];
  }

  const gap = visible.length > 1 ? RING_GAP_PATH_UNITS : 0;
  const available = 100 - gap * visible.length;
  let offset = 0;

  return visible.map((metric) => {
    const dash = Math.max(0, (metric.value / total) * available);
    const segment = { ...metric, dash, offset };
    offset += dash + gap;
    return segment;
  });
}
function InsulinDoseRing({
  activeMetricKey,
  metrics,
  onHoverChange,
  tdd,
}: {
  activeMetricKey: RingMetricKey | null;
  metrics: RingMetric[];
  onHoverChange: (metricKey: RingMetricKey | null) => void;
  tdd: number;
}) {
  const segments = buildRingSegments(metrics);
  const description = metrics
    .map(
      (metric) => `${metric.label}: ${safeFixed1(metric.value)} units per day`,
    )
    .join(", ");

  return (
    <div
      className="relative mx-auto flex size-48 items-center justify-center"
      role="img"
      aria-label={`Total daily dose ${safeFixed1(tdd)} units per day. ${description}`}
    >
      <svg
        className="absolute inset-0 size-full"
        viewBox="0 0 120 120"
        aria-hidden="true"
      >
        <circle
          className="text-border-default"
          cx="60"
          cy="60"
          fill="none"
          opacity="0.55"
          r="44"
          stroke="currentColor"
          strokeWidth="14"
        />
        {segments.map((segment) => (
          <circle
            className={twMerge(
              "stroke-current transition-[filter,opacity,stroke-width] duration-200 md:cursor-pointer",
              segment.strokeClassName,
              activeMetricKey && activeMetricKey !== segment.key
                ? "md:opacity-25 md:saturate-50"
                : null,
              activeMetricKey === segment.key ? "md:drop-shadow-sm" : null,
            )}
            cx="60"
            cy="60"
            fill="none"
            key={segment.key}
            pathLength="100"
            r="44"
            stroke="currentColor"
            strokeDasharray={`${segment.dash} ${100 - segment.dash}`}
            strokeDashoffset={-segment.offset}
            strokeLinecap="butt"
            strokeWidth={activeMetricKey === segment.key ? "16" : "14"}
            transform="rotate(-90 60 60)"
            onMouseEnter={() => onHoverChange(segment.key)}
            onMouseLeave={() => onHoverChange(null)}
          />
        ))}
      </svg>
      <div className="pointer-events-none relative flex size-28 flex-col items-center justify-center rounded-full bg-surface-elevated text-center shadow-sm ring-1 ring-border-default">
        <span className="font_header_2 text-foreground-primary">
          {safeFixed1(tdd)}
        </span>
        <span className="font_metric_caption text-foreground-secondary">
          U/day
        </span>
      </div>
    </div>
  );
}
export function InsulinSummaryStats({ className }: InsulinSummaryStatsProps) {
  const dashboardTimeRange = useOptionalDashboardTimeRange();
  const [activeMetricKey, setActiveMetricKey] = useState<RingMetricKey | null>(
    null,
  );
  const { data, isLoading, error, period, setPeriod, refetch } =
    useInsulinSummary("14d", dashboardTimeRange?.currentWindow);
  const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const handlePeriodKeyDown = (e: KeyboardEvent, index: number) => {
    let newIndex = index;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      newIndex = (index + 1) % PERIOD_OPTIONS.length;
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      newIndex = (index - 1 + PERIOD_OPTIONS.length) % PERIOD_OPTIONS.length;
    } else if (e.key === "Home") {
      e.preventDefault();
      newIndex = 0;
    } else if (e.key === "End") {
      e.preventDefault();
      newIndex = PERIOD_OPTIONS.length - 1;
    } else {
      return;
    }
    setPeriod(PERIOD_OPTIONS[newIndex].value);
    buttonsRef.current[newIndex]?.focus();
  };
  const noData =
    !data ||
    !Number.isFinite(data.tdd) ||
    data.tdd <= 0 ||
    !Number.isFinite(data.period_days) ||
    data.period_days <= 0;
  const periodSelector = (
    <div
      className="flex gap-1"
      role="radiogroup"
      aria-label="Insulin summary time period"
    >
      {PERIOD_OPTIONS.map((opt, i) => (
        <Button
          key={opt.value}
          ref={(el) => {
            buttonsRef.current[i] = el;
          }}
          role="radio"
          aria-checked={period === opt.value}
          aria-label={INSULIN_PERIOD_LABELS[opt.value]}
          tabIndex={period === opt.value ? 0 : -1}
          onClick={() => setPeriod(opt.value)}
          onKeyDown={(e) => handlePeriodKeyDown(e, i)}
          className={`px-2.5 py-1 font_metric_caption rounded-button transition-colors outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-primary ${
            period === opt.value
              ? "bg-accent text-accent-foreground"
              : "text-foreground-secondary hover:text-foreground-primary hover:bg-surface-secondary"
          }`}
        >
          {opt.label}
        </Button>
      ))}
    </div>
  );
  return (
    <Panel
      aria-busy={isLoading}
      bodyClassName="space-y-5"
      className={twMerge("h-full min-w-0", className)}
      data-testid="insulin-summary"
      heading="Insulin Summary"
      headingId="insulin-summary-heading"
    >
      {dashboardTimeRange ? null : (
        <div className="flex justify-end">{periodSelector}</div>
      )}
      {isLoading ? (
        <div className="grid grid-cols-1 border-t border-border-default sm:grid-cols-3 sm:divide-x sm:divide-border-default">
          {Array.from({ length: 3 }).map((_, i) => (
            <StatSkeleton key={i} />
          ))}
        </div>
      ) : error ? (
        <div className="text-center py-4">
          <div
            className="flex items-center gap-2 text-signal-error-text font_body_3 justify-center mb-3"
            role="alert"
          >
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            <p>Failed to load insulin summary.</p>
          </div>
          <p className="text-foreground-secondary font_metric_caption mb-3 max-w-md truncate">
            {error}
          </p>
          <Button
            type="button"
            onClick={refetch}
            className="text-signal-partial-text hover:text-signal-partial-text font_body_3 outline-hidden focus-visible:ring-2 focus-visible:ring-signal-partial-fill focus-visible:ring-offset-2 focus-visible:ring-offset-surface-primary rounded-sm"
          >
            Retry
          </Button>
        </div>
      ) : noData ? (
        <p className="text-foreground-secondary font_body_3 text-center py-4">
          No insulin delivery data available for this period.
        </p>
      ) : (
        <div className="space-y-5">
          <section
            aria-labelledby="insulin-dose-mix-heading"
            className="space-y-3"
          >
            <h3
              className="font_header_4 text-foreground-primary"
              id="insulin-dose-mix-heading"
            >
              Daily dose mix
            </h3>
            <p className="min-h-5 font_metric_caption text-foreground-secondary">
              {data.period_days === 1
                ? "1 day of delivery data"
                : `${safeCount(data.period_days)} days of delivery data`}
            </p>
            <div className="flex min-h-[15.25rem] items-start justify-center">
              <InsulinDoseRing
                activeMetricKey={activeMetricKey}
                onHoverChange={setActiveMetricKey}
                tdd={data.tdd}
                metrics={[
                  {
                    key: "basal",
                    label: "Basal",
                    value:
                      (data.basal_units ?? 0) +
                      (data.basal_injection_units ?? 0),
                    strokeClassName: "text-signal-info-fill",
                  },
                  {
                    key: "bolus",
                    label: "Bolus",
                    value: data.bolus_units,
                    strokeClassName: "text-accent",
                  },
                  {
                    key: "corrections",
                    label: "Corrections",
                    value: data.correction_units,
                    strokeClassName: "text-signal-warning-fill",
                  },
                ]}
              />
            </div>
          </section>
          <div className="border-t border-border-default">
            <div className="grid grid-cols-1 divide-y divide-border-default border-b border-border-default md:grid-cols-3 md:divide-x md:divide-y-0">
              <SummaryMetric
                activeMetricKey={activeMetricKey}
                ariaLabel={`Basal: ${safeFixed1((data.basal_units ?? 0) + (data.basal_injection_units ?? 0))} units per day`}
                colorClassName="bg-signal-info-fill"
                detail={
                  (data.basal_injection_units ?? 0) > 0
                    ? `Includes ${safeFixed1(data.basal_injection_units ?? 0)} U injection`
                    : "Daily average"
                }
                label="Basal"
                metricKey="basal"
                onHoverChange={setActiveMetricKey}
                value={`${safeFixed1((data.basal_units ?? 0) + (data.basal_injection_units ?? 0))} U`}
              />
              <SummaryMetric
                activeMetricKey={activeMetricKey}
                ariaLabel={`Bolus: ${safeFixed1(data.bolus_units)} units per day`}
                colorClassName="bg-accent"
                detail="Daily average"
                label="Bolus"
                metricKey="bolus"
                onHoverChange={setActiveMetricKey}
                value={`${safeFixed1(data.bolus_units)} U`}
              />
              <SummaryMetric
                activeMetricKey={activeMetricKey}
                ariaLabel={`Corrections: ${safeFixed1(data.correction_units)} units per day`}
                colorClassName="bg-signal-warning-fill"
                detail="Daily average"
                label="Corrections"
                metricKey="corrections"
                onHoverChange={setActiveMetricKey}
                value={`${safeFixed1(data.correction_units)} U`}
              />
            </div>
            <div className="grid grid-cols-1 divide-y divide-border-default border-b border-border-default md:grid-cols-2 md:divide-x md:divide-y-0">
              <CountMetric
                ariaLabel={`Bolus count: ${safeFixed1(data.bolus_count / data.period_days)} per day average, ${safeCount(data.bolus_count)} total`}
                detail={`Total count: ${safeCount(data.bolus_count)}`}
                label="Bolus Count"
                value={`${safeFixed1(data.bolus_count / data.period_days)}/day`}
              />
              <CountMetric
                ariaLabel={`Correction count: ${safeFixed1(data.correction_count / data.period_days)} per day average, ${safeCount(data.correction_count)} total`}
                detail={`Total count: ${safeCount(data.correction_count)}`}
                label="Correction Count"
                value={`${safeFixed1(data.correction_count / data.period_days)}/day`}
              />
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}
