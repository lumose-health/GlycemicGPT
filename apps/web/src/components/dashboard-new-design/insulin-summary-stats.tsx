"use client";
/**
 * Insulin Summary Stats Panel
 *
 * Story 30.7: Displays aggregate insulin delivery statistics including
 * TDD, basal/bolus split, correction counts. Period-selectable.
 */
import { useRef } from"react";
import { AlertCircle, Syringe, Droplets, Zap, Hash, Activity } from"lucide-react";
import {
  useInsulinSummary,
  type InsulinPeriod,
  INSULIN_PERIOD_LABELS,
} from"@/hooks/use-insulin-summary";
import { useOptionalDashboardTimeRange } from"./dashboard-time-range-context";
export interface InsulinSummaryStatsProps {
  className?: string;
}
const PERIOD_OPTIONS: { value: InsulinPeriod; label: string }[] = [
  { value:"24h", label:"24H" },
  { value:"3d", label:"3D" },
  { value:"7d", label:"7D" },
  { value:"14d", label:"14D" },
  { value:"30d", label:"30D" },
  { value:"90d", label:"90D" },
];
function getBasalSplitAssessment(basalPct: number): { label: string; color: string } {
  if (basalPct >= 40 && basalPct <= 60) return { label:"Balanced", color:"text-signal-check-text" };
  if ((basalPct >= 30 && basalPct < 40) || (basalPct > 60 && basalPct <= 70))
    return { label:"Moderate", color:"text-signal-warning-text" };
  return { label:"Review", color:"text-signal-error-text" };
}
const MAX_DOSE_DISPLAY = 200;
function safeFixed1(value: number): string {
  if (!Number.isFinite(value) || value < 0) return"--";
  if (value > MAX_DOSE_DISPLAY) return `>${MAX_DOSE_DISPLAY}`;
  return value.toFixed(1);
}
function safeRound(value: number): string {
  if (!Number.isFinite(value) || value < 0) return"--";
  if (value > MAX_DOSE_DISPLAY) return `>${MAX_DOSE_DISPLAY}`;
  return String(Math.round(value));
}
function safeCount(value: number): string {
  if (!Number.isFinite(value) || value < 0) return"--";
  return Math.round(value).toLocaleString();
}
function StatSkeleton() {
  return (
    <div className="animate-pulse space-y-2">
      <div className="h-4 w-20 bg-surface-tertiary rounded-sm" />
      <div className="h-8 w-16 bg-surface-tertiary rounded-sm" />
      <div className="h-3 w-24 bg-surface-secondary rounded-sm" />
    </div>
  );
}
interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle: string;
  subtitleColor?: string;
  // Optional second subtitle line (e.g. a distinct basal-injection breakdown).
  subtitle2?: string;
  ariaLabel: string;
}
function StatCard({
  icon,
  label,
  value,
  subtitle,
  subtitleColor ="text-foreground-secondary",
  subtitle2,
  ariaLabel,
}: StatCardProps) {
  return (
    <div className="space-y-1" role="group" aria-label={ariaLabel}>
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-foreground-secondary font_metric_caption">{label}</span>
      </div>
      <p className="font_header_3 text-foreground-primary">{value}</p>
      <p className={`font_metric_caption ${subtitleColor}`}>{subtitle}</p>
      {subtitle2 ? (
        <p className="font_metric_caption text-foreground-secondary">{subtitle2}</p>
      ) : null}
    </div>
  );
}
export function InsulinSummaryStats({ className }: InsulinSummaryStatsProps) {
  const dashboardTimeRange = useOptionalDashboardTimeRange();
  const { data, isLoading, error, period, setPeriod, refetch } = useInsulinSummary(
    "14d",
    dashboardTimeRange?.currentWindow
  );
  const periodLabel = dashboardTimeRange?.label ?? INSULIN_PERIOD_LABELS[period] ?? period;
  const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const handlePeriodKeyDown = (e: React.KeyboardEvent, index: number) => {
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
    setPeriod(PERIOD_OPTIONS[newIndex].value);
    buttonsRef.current[newIndex]?.focus();
  };
  const noData = !data || !Number.isFinite(data.tdd) || data.tdd <= 0 || !Number.isFinite(data.period_days) || data.period_days <= 0;
  const splitAssessment = data && Number.isFinite(data.basal_pct)
    ? getBasalSplitAssessment(data.basal_pct)
    : null;
  const periodSelector = (
    <div className="flex gap-1" role="radiogroup" aria-label="Insulin summary time period">
      {PERIOD_OPTIONS.map((opt, i) => (
        <button
          key={opt.value}
          ref={(el) => { buttonsRef.current[i] = el; }}
          role="radio"
          aria-checked={period === opt.value}
          aria-label={INSULIN_PERIOD_LABELS[opt.value]}
          tabIndex={period === opt.value ? 0 : -1}
          onClick={() => setPeriod(opt.value)}
          onKeyDown={(e) => handlePeriodKeyDown(e, i)}
          className={`px-2.5 py-1 font_metric_caption rounded-md transition-colors outline-hidden focus-visible:ring-2 focus-visible:ring-signal-partial-fill focus-visible:ring-offset-2 focus-visible:ring-offset-surface-primary ${
            period === opt.value
              ?"bg-signal-partial-fill text-foreground-inverse"
              :"text-foreground-secondary hover:text-foreground-primary hover:bg-surface-secondary"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
  return (
    <section
      aria-labelledby="insulin-summary-heading"
      aria-busy={isLoading}
      data-testid="insulin-summary"
      className={`bg-surface-primary rounded-xl p-6 border border-border-default ${className ??""}`}
    >
      {/* Header with period selector */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-signal-partial-fill/10 rounded-lg">
            <Syringe className="h-5 w-5 text-signal-partial-text" aria-hidden="true" />
          </div>
          <h2 id="insulin-summary-heading" className="text-foreground-primary font_header_4">
            Insulin Summary
            <span className="text-foreground-secondary font_body_3 font_body_3 ml-2">
              {periodLabel}
            </span>
          </h2>
        </div>
        {dashboardTimeRange ? null : periodSelector}
      </div>
      {/* Stats grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <StatSkeleton key={i} />
          ))}
        </div>
      ) : error ? (
        <div className="text-center py-4">
          <div className="flex items-center gap-2 text-signal-error-text font_body_3 justify-center mb-3" role="alert">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            <p>Failed to load insulin summary.</p>
          </div>
          <p className="text-foreground-secondary font_metric_caption mb-3 max-w-md truncate">{error}</p>
          <button
            type="button"
            onClick={refetch}
            className="text-signal-partial-text hover:text-signal-partial-text font_body_3 outline-hidden focus-visible:ring-2 focus-visible:ring-signal-partial-fill focus-visible:ring-offset-2 focus-visible:ring-offset-surface-primary rounded-sm"
          >
            Retry
          </button>
        </div>
      ) : noData ? (
        <p className="text-foreground-secondary font_body_3 text-center py-4">
          No insulin delivery data available for this period.
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-6">
          <StatCard
            icon={<Activity className="h-4 w-4 text-signal-partial-text" aria-hidden="true" />}
            label="TDD"
            value={safeFixed1(data.tdd)}
            subtitle="U/day"
            ariaLabel={`Total daily dose: ${safeFixed1(data.tdd)} units per day`}
          />
          <StatCard
            icon={<Droplets className="h-4 w-4 text-signal-info-text" aria-hidden="true" />}
            label="Basal"
            // Basal therapy = pump basal rate + any long-acting (MDI) injection.
            value={`${safeFixed1((data.basal_units ?? 0) + (data.basal_injection_units ?? 0))} U`}
            subtitle={`${safeRound(data.basal_pct)}% of TDD`}
            subtitleColor={splitAssessment?.color ??"text-foreground-secondary"}
            subtitle2={
              (data.basal_injection_units ?? 0) > 0
                ? `incl. ${safeFixed1(data.basal_injection_units ?? 0)} U injection`
                : undefined
            }
            ariaLabel={`Basal: ${safeFixed1((data.basal_units ?? 0) + (data.basal_injection_units ?? 0))} units per day, ${safeRound(data.basal_pct)} percent of TDD${
              (data.basal_injection_units ?? 0) > 0
                ? `, including ${safeFixed1(data.basal_injection_units ?? 0)} units long-acting injection`
                :""
            }`}
          />
          <StatCard
            icon={<Syringe className="h-4 w-4 text-signal-partial-text" aria-hidden="true" />}
            label="Bolus"
            value={`${safeFixed1(data.bolus_units)} U`}
            subtitle={`${safeRound(data.bolus_pct)}% of TDD${splitAssessment ? ` | ${splitAssessment.label}` :""}`}
            subtitleColor={splitAssessment?.color ??"text-foreground-secondary"}
            ariaLabel={`Bolus: ${safeFixed1(data.bolus_units)} units per day, ${safeRound(data.bolus_pct)} percent of TDD`}
          />
          <StatCard
            icon={<Zap className="h-4 w-4 text-signal-warning-text" aria-hidden="true" />}
            label="Corrections"
            value={`${safeFixed1(data.correction_units)} U`}
            subtitle="U/day avg"
            ariaLabel={`Corrections: ${safeFixed1(data.correction_units)} units per day`}
          />
          <StatCard
            icon={<Hash className="h-4 w-4 text-signal-partial-text" aria-hidden="true" />}
            label="Bolus Count"
            value={safeCount(data.bolus_count)}
            subtitle={`${safeFixed1(data.bolus_count / data.period_days)}/day avg`}
            ariaLabel={`Bolus count: ${safeCount(data.bolus_count)} total, ${safeFixed1(data.bolus_count / data.period_days)} per day average`}
          />
          <StatCard
            icon={<Hash className="h-4 w-4 text-signal-warning-text" aria-hidden="true" />}
            label="Correction Count"
            value={safeCount(data.correction_count)}
            subtitle={`${safeFixed1(data.correction_count / data.period_days)}/day avg`}
            ariaLabel={`Correction count: ${safeCount(data.correction_count)} total, ${safeFixed1(data.correction_count / data.period_days)} per day average`}
          />
        </div>
      )}
    </section>
  );
}
