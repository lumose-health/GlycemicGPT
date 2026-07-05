"use client";
/**
 * CGM Summary Stats Panel
 *
 * Story 30.3: Displays aggregate CGM statistics including average glucose,
 * standard deviation, min/max glucose, CV%, GMI, and CGM active time.
 */
import { useRef, type KeyboardEvent, type ReactNode } from"react";
import { AlertCircle, BarChart3, TrendingDown, TrendingUp, Percent, Heart, Radio } from"lucide-react";
import { Panel } from"@/components/Panel";
import type { GlucoseStats } from"@/lib/api";
import type { StatsPeriod } from"@/hooks/use-glucose-stats";
import { formatGlucose, unitLabel, type GlucoseUnit } from"@/lib/glucose-units";
import { twMerge } from"@/lib/ui/twMerge";
export interface CgmSummaryStatsProps {
  stats: GlucoseStats | null;
  isLoading: boolean;
  error?: string | null;
  period: StatsPeriod;
  onPeriodChange?: (p: StatsPeriod) => void;
  className?: string;
  /** Active glucose display unit (default mgdl). Stats stay mg/dL internally. */
  unit?: GlucoseUnit;
}
const PERIOD_OPTIONS: { value: StatsPeriod; label: string }[] = [
  { value:"24h", label:"24H" },
  { value:"3d", label:"3D" },
  { value:"7d", label:"7D" },
  { value:"14d", label:"14D" },
  { value:"30d", label:"30D" },
];
function getCvAssessment(cv: number): { label: string; color: string } {
  if (cv <= 36) return { label:"Stable", color:"text-signal-check-text" };
  if (cv <= 50) return { label:"Moderate", color:"text-signal-warning-text" };
  return { label:"High variability", color:"text-signal-error-text" };
}
function getCgmActiveAssessment(pct: number): { label: string; color: string } {
  if (pct >= 70) return { label:"Good coverage", color:"text-signal-check-text" };
  if (pct >= 50) return { label:"Partial coverage", color:"text-signal-warning-text" };
  return { label:"Low coverage", color:"text-signal-error-text" };
}
/** Check if a glucose value is within reasonable physiological range. */
function isReasonableGlucose(value: number): boolean {
  return Number.isFinite(value) && value >= 20 && value <= 500;
}
/** Check if a standard deviation value is valid (finite and non-negative). */
function isValidStdDev(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}
/** Safely format a number, returning"--" for NaN/Infinity. */
function safeRound(value: number): string {
  if (!Number.isFinite(value)) return"--";
  return String(Math.round(value));
}
/** Safely format to 1 decimal place, returning"--" for NaN/Infinity. */
function safeFixed1(value: number): string {
  if (!Number.isFinite(value)) return"--";
  return value.toFixed(1);
}
/** Safely format a percentage with 1 decimal, returning"--" for NaN/Infinity. */
function safePercent1(value: number): string {
  if (!Number.isFinite(value)) return"--";
  return `${value.toFixed(1)}%`;
}
/** Safely format a percentage (rounded), returning"--" for NaN/Infinity. */
function safePercent0(value: number): string {
  if (!Number.isFinite(value)) return"--";
  return `${Math.round(value)}%`;
}
function StatSkeleton() {
  return (
    <div className="animate-pulse rounded-button border border-border-default bg-surface-primary p-3">
      <div className="flex items-center justify-between gap-4">
        <div className="h-4 w-28 rounded-sm bg-surface-tertiary" />
        <div className="h-5 w-16 rounded-sm bg-surface-tertiary" />
      </div>
      <div className="mt-2 ml-auto h-3 w-24 rounded-sm bg-surface-secondary" />
    </div>
  );
}
interface StatRowProps {
  icon: ReactNode;
  label: string;
  value: string;
  detail?: ReactNode;
  ariaLabel: string;
}
function StatRow({ icon, label, value, detail, ariaLabel }: StatRowProps) {
  return (
    <div
      className="rounded-button border border-border-default bg-surface-primary p-3"
      role="group"
      aria-label={ariaLabel}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {icon}
          <span className="min-w-0 font_metric_caption text-foreground-secondary">
            {label}
          </span>
        </div>
        <p className="shrink-0 text-right font_header_4 text-foreground-primary">
          {value}
        </p>
      </div>
      {detail ? (
        <div className="mt-1 text-right font_metric_caption text-foreground-secondary">
          {detail}
        </div>
      ) : null}
    </div>
  );
}
interface GlucoseMetric {
  icon: ReactNode;
  label: string;
  value: string;
  unit: string;
  ariaLabel: string;
}
function GlucoseMetricGroup({ metrics }: { metrics: GlucoseMetric[] }) {
  return (
    <div
      className="rounded-button border border-border-default bg-surface-primary p-3 sm:col-span-2"
      role="group"
      aria-label="Glucose summary values"
    >
      <div className="grid grid-cols-1 divide-y divide-border-default sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {metrics.map((metric) => (
          <div
            aria-label={metric.ariaLabel}
            className="py-3 first:pt-0 last:pb-0 sm:px-3 sm:py-0 sm:first:pl-0 sm:last:pr-0"
            key={metric.label}
            role="group"
          >
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                {metric.icon}
                <span className="min-w-0 font_metric_caption text-foreground-secondary">
                  {metric.label}
                </span>
              </div>
              <p className="shrink-0 text-right font_header_4 text-foreground-primary">
                {metric.value}
              </p>
            </div>
            <div className="mt-1 text-right font_metric_caption text-foreground-secondary">
              {metric.unit}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
function StatusDetail({
  target,
  status,
  statusClassName,
}: {
  target: string;
  status?: string;
  statusClassName?: string;
}) {
  if (!status) {
    return <span>{target}</span>;
  }

  return (
    <>
      <span>{target}</span>
      <span aria-hidden="true"> | </span>
      <span className={twMerge(statusClassName)}>{status}</span>
    </>
  );
}
export function CgmSummaryStats({
  className,
  stats,
  isLoading,
  error,
  period,
  onPeriodChange,
  unit ="mgdl",
}: CgmSummaryStatsProps) {
  const noData = !stats || !Number.isFinite(stats.readings_count) || stats.readings_count <= 0;
  const cvAssessment = stats && Number.isFinite(stats.cv_pct) ? getCvAssessment(stats.cv_pct) : null;
  const cgmAssessment = stats && Number.isFinite(stats.cgm_active_pct) ? getCgmActiveAssessment(stats.cgm_active_pct) : null;
  const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const handlePeriodKeyDown = (e: KeyboardEvent, index: number) => {
    if (!onPeriodChange) {
      return;
    }

    let newIndex = index;
    if (e.key ==="ArrowRight" || e.key ==="ArrowDown") {
      e.preventDefault();
      newIndex = (index + 1) % PERIOD_OPTIONS.length;
    } else if (e.key ==="ArrowLeft" || e.key ==="ArrowUp") {
      e.preventDefault();
      newIndex = (index - 1 + PERIOD_OPTIONS.length) % PERIOD_OPTIONS.length;
    } else if (e.key ==="Home") {
      e.preventDefault();
      newIndex = 0;
    } else if (e.key ==="End") {
      e.preventDefault();
      newIndex = PERIOD_OPTIONS.length - 1;
    } else {
      return;
    }
    onPeriodChange(PERIOD_OPTIONS[newIndex].value);
    buttonsRef.current[newIndex]?.focus();
  };
  return (
    <Panel
      aria-busy={isLoading}
      bodyClassName="space-y-4"
      className={twMerge("h-full min-w-0", className)}
      headerClassName="flex flex-wrap items-center justify-between gap-3"
      heading="CGM Summary"
      headingId="cgm-stats-heading"
      headingClassName="min-w-0"
    >
      {onPeriodChange ? (
        <div className="flex gap-1" role="radiogroup" aria-label="Statistics time period">
          {PERIOD_OPTIONS.map((opt, i) => (
            <button
              key={opt.value}
              ref={(el) => { buttonsRef.current[i] = el; }}
              role="radio"
              aria-checked={period === opt.value}
              tabIndex={period === opt.value ? 0 : -1}
              onClick={() => onPeriodChange(opt.value)}
              onKeyDown={(e) => handlePeriodKeyDown(e, i)}
              className={`rounded-button px-2.5 py-1 font_metric_caption transition-colors ${
                period === opt.value
                  ?"bg-accent text-accent-foreground"
                  :"text-foreground-secondary hover:bg-surface-secondary hover:text-foreground-primary"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      ) : null}
      {/* Stats grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <StatSkeleton key={i} />
          ))}
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-signal-error-text font_body_3 py-4 justify-center" role="alert">
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          <p>Failed to load CGM stats. Try again later.</p>
        </div>
      ) : noData ? (
        <p className="text-foreground-secondary font_body_3 text-center py-4">
          No CGM data available for this period.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <GlucoseMetricGroup
            metrics={[
              {
                icon:<TrendingUp className="h-4 w-4 text-accent" aria-hidden="true" />,
                label:"Avg Glucose",
                value:isReasonableGlucose(stats.mean_glucose) ? formatGlucose(stats.mean_glucose, unit) :"--",
                unit:unitLabel(unit),
                ariaLabel:`Average glucose: ${isReasonableGlucose(stats.mean_glucose) ? `${formatGlucose(stats.mean_glucose, unit)} ${unitLabel(unit)}` :"unavailable"}`,
              },
              {
                icon:<TrendingDown className="h-4 w-4 text-signal-check-text" aria-hidden="true" />,
                label:"Min Glucose",
                value:isReasonableGlucose(stats.min_glucose) ? formatGlucose(stats.min_glucose, unit) :"--",
                unit:unitLabel(unit),
                ariaLabel:`Minimum glucose: ${isReasonableGlucose(stats.min_glucose) ? `${formatGlucose(stats.min_glucose, unit)} ${unitLabel(unit)}` :"unavailable"}`,
              },
              {
                icon:<TrendingUp className="h-4 w-4 text-signal-error-text" aria-hidden="true" />,
                label:"Max Glucose",
                value:isReasonableGlucose(stats.max_glucose) ? formatGlucose(stats.max_glucose, unit) :"--",
                unit:unitLabel(unit),
                ariaLabel:`Maximum glucose: ${isReasonableGlucose(stats.max_glucose) ? `${formatGlucose(stats.max_glucose, unit)} ${unitLabel(unit)}` :"unavailable"}`,
              },
            ]}
          />
          <StatRow
            icon={<BarChart3 className="h-4 w-4 text-signal-partial-text" aria-hidden="true" />}
            label="Std Dev"
            // SD is a spread: scaled by /18.0156 like a value (mmol keeps 1 decimal).
            value={isValidStdDev(stats.std_dev) ? formatGlucose(stats.std_dev, unit) :"--"}
            detail={unitLabel(unit)}
            ariaLabel={`Standard deviation: ${isValidStdDev(stats.std_dev) ? `${formatGlucose(stats.std_dev, unit)} ${unitLabel(unit)}` :"unavailable"}`}
          />
          <StatRow
            icon={<Percent className="h-4 w-4 text-signal-warning-text" aria-hidden="true" />}
            label="CV%"
            value={safePercent1(stats.cv_pct)}
            detail={
              <StatusDetail
                status={cvAssessment?.label}
                statusClassName={cvAssessment?.color}
                target="Target <36%"
              />
            }
            ariaLabel={`Coefficient of variation: ${safeFixed1(stats.cv_pct)} percent. ${cvAssessment?.label ??""}`}
          />
          <StatRow
            icon={<Heart className="h-4 w-4 text-signal-error-text" aria-hidden="true" />}
            label="GMI (est. A1C)"
            value={safePercent1(stats.gmi)}
            detail="Glucose Management Indicator"
            ariaLabel={`Glucose Management Indicator: ${safeFixed1(stats.gmi)} percent estimated A1C`}
          />
          <StatRow
            icon={<Radio className="h-4 w-4 text-signal-check-text" aria-hidden="true" />}
            label="CGM Active"
            value={safePercent0(stats.cgm_active_pct)}
            detail={
              <StatusDetail
                status={cgmAssessment?.label}
                statusClassName={cgmAssessment?.color}
                target="Target >70%"
              />
            }
            ariaLabel={`CGM active time: ${safeRound(stats.cgm_active_pct)} percent. ${cgmAssessment?.label ??""}`}
          />
        </div>
      )}
    </Panel>
  );
}
