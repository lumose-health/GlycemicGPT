"use client";
/**
 * GlucoseHero Component
 *
 * Story 4.2: GlucoseHero Component
 * Story 4.6: Dashboard Accessibility
 * Prominently displays current glucose with trend arrow so users
 * can understand their status in under 2 seconds.
 *
 * Accessibility features:
 * - Screen reader announcements with value, trend, and range status
 * - Dynamic aria-live (assertive for urgent, polite for normal)
 * - Keyboard focusable with visible focus ring
 * - Accessible labels for pump status metrics
 */
import { useEffect, useState } from"react";
import { twMerge } from "@/lib/ui/twMerge";
import { Icon } from"@/base/Icon";
import { GlucoseIndicator } from"@/components/GlucoseIndicator";
import {
  formatGlucose,
  spokenUnit,
  unitLabel,
  type GlucoseUnit,
} from"@/lib/glucose-units";
import {
  TREND_DESCRIPTIONS,
} from"@/components/TrendArrow";
import { formatUpdatedAgo } from "@/lib/format-updated-ago";
import {
  formatOverrideRemaining,
  prettySourceName,
} from "@/lib/pump/closed-loop-status";
import type {
  GlucoseHeroProps,
  GlucoseRange,
  LoopState,
  LoopStatusInfo,
  OverrideInfo,
} from "./GlucoseHero.types";
/** Default glucose range thresholds in mg/dL */
export const GLUCOSE_THRESHOLDS = {
  URGENT_LOW: 55,
  LOW: 70,
  HIGH: 180,
  URGENT_HIGH: 250,
} as const;
/**
 * Story 43.12 PR 6 -- closed-loop runtime state surfaces.
 *
 * These come from the backend's `/api/integrations/pump/status` and are
 * sourced from the latest Nightscout devicestatus snapshot. All three
 * are independently nullable -- absence means the underlying data
 * isn't present (no NS integration, no active override, no carbs
 * absorbing, snapshot stale, etc.) and we render nothing.
 */
/**
 * Classify glucose value into range category.
 * Accepts optional dynamic thresholds; falls back to GLUCOSE_THRESHOLDS.
 */
export function classifyGlucose(
  value: number | null,
  thresholds?: { urgentLow: number; low: number; high: number; urgentHigh: number }
): GlucoseRange {
  if (value === null) return"inRange";
  const t = thresholds ?? {
    urgentLow: GLUCOSE_THRESHOLDS.URGENT_LOW,
    low: GLUCOSE_THRESHOLDS.LOW,
    high: GLUCOSE_THRESHOLDS.HIGH,
    urgentHigh: GLUCOSE_THRESHOLDS.URGENT_HIGH,
  };
  if (value < t.urgentLow) return"urgentLow";
  if (value < t.low) return"low";
  if (value <= t.high) return"inRange";
  if (value <= t.urgentHigh) return"high";
  return"urgentHigh";
}
// Accessible range status descriptions
type RangeStatus ="in-range" |"low" |"high" |"urgent-low" |"urgent-high";
const RANGE_STATUS_TEXT: Record<RangeStatus, string> = {"in-range":"in target range","low":"below target","high":"above target","urgent-low":"dangerously low","urgent-high":"dangerously high",
};
const GLUCOSE_SHAPE_CENTER_X = 76 / 184;
const GLUCOSE_SHAPE_CENTER_Y = 76 / 153;
/**
 * Get accessible range status text for screen readers.
 */
export function getRangeStatus(range: GlucoseRange): RangeStatus {
  const mapping: Record<GlucoseRange, RangeStatus> = {
    inRange:"in-range",
    low:"low",
    high:"high",
    urgentLow:"urgent-low",
    urgentHigh:"urgent-high",
  };
  return mapping[range];
}
/**
 * Build accessible announcement for screen readers.
 * Format:"Glucose 142 milligrams per deciliter, falling slowly, in target range"
 * (mmol users hear e.g."Glucose 7.9 millimoles per litre, ...").
 */
export function buildGlucoseAnnouncement(
  value: number | null,
  trendDescription: string,
  rangeStatus: RangeStatus,
  unit: GlucoseUnit ="mgdl"
): string {
  if (value === null) {
    return"Glucose reading unavailable";
  }
  const rangeText = RANGE_STATUS_TEXT[rangeStatus];
  return `Glucose ${formatGlucose(value, unit)} ${spokenUnit(unit)}, ${trendDescription}, ${rangeText}`;
}
/**
 * Determine if glucose state is urgent (requires assertive announcement).
 */
export function isUrgentState(range: GlucoseRange): boolean {
  return range ==="urgentLow" || range ==="urgentHigh";
}
// Color configuration per glucose range
const rangeColors: Record<GlucoseRange, { text: string; bg: string }> = {
  urgentLow: { text:"text-signal-error-text", bg:"bg-signal-error-fill/10" },
  low: { text:"text-signal-warning-text", bg:"bg-signal-warning-fill/10" },
  inRange: { text:"text-signal-check-text", bg:"bg-signal-check-fill/10" },
  high: { text:"text-signal-warning-text", bg:"bg-signal-warning-fill/10" },
  urgentHigh: { text:"text-signal-error-text", bg:"bg-signal-error-fill/10" },
};
/**
 * Determine if pulse animation should be shown.
 */
export function shouldPulse(range: GlucoseRange):"strong" |"subtle" | null {
  if (range ==="urgentLow" || range ==="urgentHigh") return"strong";
  if (range ==="low" || range ==="high") return"subtle";
  return null;
}
/**
 * Validate and sanitize numeric value.
 * Returns null for invalid values (NaN, Infinity, negative).
 */
function sanitizeValue(value: number | null, allowNegative = false): number | null {
  if (value === null) return null;
  if (typeof value !=="number") return null;
  if (!Number.isFinite(value)) return null;
  if (!allowNegative && value < 0) return null;
  return value;
}
// ---------------------------------------------------------------------------
// Story 43.12 PR 6 helpers
// ---------------------------------------------------------------------------
const LOOP_STATE_STYLE: Record<
  LoopState,
  { label: string; pill: string; ariaLabel: (source: string) => string }
> = {
  looping: {
    label:"Looping",
    pill:"bg-signal-check-fill/15 text-signal-check-text border-signal-check-fill/30",
    ariaLabel: (source) => `${prettySourceName(source)} is actively looping`,
  },
  not_looping: {
    label:"Not looping",
    pill:"bg-signal-warning-fill/15 text-signal-warning-text border-signal-warning-fill/30",
    ariaLabel: (source) =>
      `${prettySourceName(source)} is not currently looping`,
  },
  failed: {
    label:"Loop failed",
    pill:"bg-signal-error-fill/15 text-signal-error-text border-signal-error-fill/30",
    ariaLabel: (source) =>
      `${prettySourceName(source)} reported a loop cycle failure`,
  },
};
function GlucoseIndicatorLoadingSkeleton({
  embedded,
  showPumpStats,
  unit,
}: {
  embedded: boolean;
  showPumpStats: boolean;
  unit: GlucoseUnit;
}) {
  return (
    <>
      {embedded && (
        <div
          className="absolute left-4 top-4 font_metric_caption text-foreground-primary/70"
          data-testid="glucose-hero-loading-unit"
        >
          <span>[{unitLabel(unit)}]</span>
        </div>
      )}
      <div
        className={twMerge(
          "flex flex-col items-center justify-center text-center",
          embedded &&"lg:w-full lg:flex-row lg:justify-evenly lg:gap-8 lg:text-left"
        )}
        data-testid="glucose-hero-loading-content"
      >
        <div
          className={twMerge(
            "flex flex-col items-center",
            embedded &&"lg:shrink-0"
          )}
        >
          <div
            className={twMerge(
              "relative h-[11.5rem] w-[11.5rem] max-h-full max-w-full",
              embedded &&"lg:scale-[1.18] lg:origin-center"
            )}
            data-testid="glucose-hero-loading-indicator"
          >
            <Icon
              className="block h-full w-full text-surface-tertiary"
              data-testid="glucose-hero-loading-shape"
              decorative
              icon="glucose"
              style={{
                opacity: 0.65,
                transformOrigin: `${GLUCOSE_SHAPE_CENTER_X * 100}% ${GLUCOSE_SHAPE_CENTER_Y * 100}%`,
              }}
            />
            <span
              className="absolute h-10 w-20 rounded-panel bg-surface-tertiary"
              data-testid="glucose-hero-loading-value"
              style={{
                left: `${GLUCOSE_SHAPE_CENTER_X * 100}%`,
                top: `${GLUCOSE_SHAPE_CENTER_Y * 100}%`,
                transform: "translate(-50%, -50%)",
              }}
            />
          </div>
          {!embedded && (
            <div className="mt-2 h-4 w-16 rounded-panel bg-surface-tertiary" />
          )}
        </div>
        {showPumpStats && (
          <>
            <div
              className={twMerge(
                "hidden sm:block w-px h-6 bg-surface-tertiary",
                embedded &&"lg:hidden"
              )}
            />
            <div
              className={twMerge(
                "mt-6 grid grid-cols-3 gap-4 sm:flex sm:items-center sm:gap-6",
                embedded &&"lg:mt-0 lg:grid lg:grid-cols-1 lg:gap-4"
              )}
              data-testid="glucose-hero-loading-metrics"
            >
              {[0, 1, 2].map((index) => (
                <div
                  className="flex flex-col items-center gap-2"
                  key={index}
                >
                  <span className="h-4 w-10 rounded-panel bg-surface-tertiary" />
                  <span className="h-3 w-14 rounded-panel bg-surface-tertiary" />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
interface LoopStatusBadgeProps {
  status: LoopStatusInfo;
  secondaryTextClassName?: string;
}
function LoopStatusBadge({
  secondaryTextClassName ="text-foreground-secondary",
  status,
}: LoopStatusBadgeProps) {
  const style = LOOP_STATE_STYLE[status.state];
  const sourceName = prettySourceName(status.source);
  // Tooltip carries the failure reason when present; absent for the
  // happy path. Source is always shown so users with multiple closed
  // loops (rare) can tell which one the badge belongs to.
  const tooltip =
    status.state ==="failed" && status.failureReason
      ? `${sourceName}: ${status.failureReason}`
      : sourceName;
  return (
    <div
      className={twMerge("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full","font_metric_caption border",
        style.pill
      )}
      role="status"
      aria-label={style.ariaLabel(status.source)}
      title={tooltip}
      data-testid="loop-status-badge"
      data-state={status.state}
    >
      <span
        className="inline-block w-1.5 h-1.5 rounded-full bg-current"
        aria-hidden="true"
      />
      <span>{style.label}</span>
      <span
        className={twMerge(secondaryTextClassName, "font_body_3 border-l border-border-hover pl-1.5 ml-0.5")}
        aria-hidden="true"
      >
        {sourceName}
      </span>
    </div>
  );
}
interface OverrideRowProps {
  override: OverrideInfo;
  secondaryTextClassName?: string;
}
function OverrideRow({
  override,
  secondaryTextClassName ="text-foreground-secondary",
}: OverrideRowProps) {
  const remaining = formatOverrideRemaining(override.endsAt);
  // Indefinite overrides show"ongoing" instead of computing a
  // phantom end time. Past-end overrides are filtered out by the
  // backend's `active: true` guard, but the formatter is the second
  // line of defense (returns null for past timestamps).
  const detail = remaining ? `ends in ${remaining}` :"ongoing";
  return (
    <div
      className="mt-3 flex items-center justify-center gap-2 font_metric_caption text-foreground-primary"
      role="status"
      aria-label={`Override active: ${override.name}, ${detail}`}
      data-testid="override-row"
    >
      <span
        className="inline-block w-2 h-2 rounded-full bg-signal-partial-fill"
        aria-hidden="true"
      />
      <span className="font_metric_label">Override: {override.name}</span>
      <span className={secondaryTextClassName} aria-hidden="true">
        &middot;
      </span>
      <span className={secondaryTextClassName}>{detail}</span>
    </div>
  );
}
export function GlucoseHero({
  value,
  trend,
  iob,
  basalRate,
  batteryPct,
  reservoirUnits,
  cobGrams,
  loopStatus,
  override,
  unit ="mgdl",
  timestamp,
  readingAgeNow: controlledReadingAgeNow,
  minutesAgo,
  isStale = false,
  isLoading = false,
  embedded = false,
  showPumpStats = true,
  thresholds,
}: GlucoseHeroProps) {
  const [readingAgeNow, setReadingAgeNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (!embedded || !timestamp || controlledReadingAgeNow !== undefined) return;
    setReadingAgeNow(Date.now());
    const interval = setInterval(() => setReadingAgeNow(Date.now()), 1_000);
    return () => clearInterval(interval);
  }, [controlledReadingAgeNow, embedded, timestamp]);
  const secondaryTextClassName = embedded
    ?"text-foreground-primary"
    :"text-foreground-secondary";
  // Loading skeleton state
  if (isLoading) {
    return (
      <div
        className={twMerge(
          "p-4 sm:p-6 md:p-8 animate-pulse",
          !embedded &&"rounded-xl border border-border-default bg-surface-primary",
        )}
        role="region"
        aria-label="Loading glucose reading"
        aria-busy="true"
      >
        <GlucoseIndicatorLoadingSkeleton
          embedded={embedded}
          showPumpStats={showPumpStats}
          unit={unit}
        />
      </div>
    );
  }
  // Defensive: sanitize numeric values
  const safeValue = sanitizeValue(value);
  const safeIob = sanitizeValue(iob, true); // IoB can be negative (rare but possible)
  const safeBasal = sanitizeValue(basalRate);
  const safeBattery = sanitizeValue(batteryPct);
  const safeReservoir = sanitizeValue(reservoirUnits);
  // PR 6: COB is a one-way pass-through (already validated server-side
  // by the staleness + numeric checks). Negative is impossible
  // (carbs grams aren't negative); reuse the default sanitizer.
  const safeCob = sanitizeValue(cobGrams ?? null);
  const range = classifyGlucose(safeValue, thresholds);
  const colors = rangeColors[range];
  const trendDescription = TREND_DESCRIPTIONS[trend];
  // Format display value (mg/dL integer, mmol 1-decimal); value stays mg/dL.
  const displayValue = safeValue !== null ? formatGlucose(safeValue, unit) :"--";
  const readingAgeLabel = formatUpdatedAgo(
    timestamp,
    controlledReadingAgeNow ?? readingAgeNow
  );
  // Accessibility: Build announcement and determine aria-live priority
  const rangeStatus = getRangeStatus(range);
  const announcement = buildGlucoseAnnouncement(
    safeValue,
    trendDescription,
    rangeStatus,
    unit
  );
  const isUrgent = isUrgentState(range);
  const ariaLivePriority = isUrgent ?"assertive" :"polite";
  const metricItemClassName = twMerge(
    "flex flex-col items-center",
    embedded &&"lg:items-start"
  );
  const metricSeparatorClassName = twMerge(
    "hidden sm:block w-px h-6 bg-surface-tertiary",
    embedded &&"lg:hidden"
  );
  return (
    <div
      className={twMerge(
        "relative p-4 sm:p-6 md:p-8 overflow-hidden focus:outline-hidden focus-visible:ring-2 focus-visible:ring-border-active",
        embedded
          ?"focus-visible:ring-offset-0"
          :"rounded-xl border border-border-default focus-visible:ring-offset-2 focus-visible:ring-offset-surface-primary",
        !embedded && colors.bg
      )}
      role="region"
      aria-label="Current glucose reading"
      tabIndex={0}
    >
      {embedded && (
        <>
          <div
            className="absolute left-4 top-4 font_metric_caption text-foreground-primary/70"
            data-testid="glucose-hero-unit"
          >
            <span>[{unitLabel(unit)}]</span>
          </div>
          {readingAgeLabel && (
            <div
              className="absolute right-4 top-4 max-w-[calc(100%-8rem)] text-right font_metric_caption text-foreground-primary/70"
              data-testid="glucose-hero-updated-at"
            >
              {readingAgeLabel}
            </div>
          )}
        </>
      )}
      {/* PR 6: closed-loop badge in the top-right. Absent when the user
          has no NS-sourced closed loop or the snapshot is stale. */}
      {loopStatus && (
        <div className="flex justify-end -mt-2 mb-2">
          <LoopStatusBadge
            secondaryTextClassName={secondaryTextClassName}
            status={loopStatus}
          />
        </div>
      )}
      <div
        className={twMerge(
          "flex flex-col items-center justify-center text-center",
          embedded &&"lg:w-full lg:flex-row lg:justify-evenly lg:gap-8 lg:text-left"
        )}
        data-testid="glucose-hero-content"
      >
        <div
          className={twMerge(
            "flex flex-col items-center",
            embedded &&"lg:shrink-0"
          )}
        >
          <GlucoseIndicator
            ariaLabel={announcement}
            ariaLive={ariaLivePriority}
            className={embedded ?"lg:scale-[1.18] lg:origin-center" : undefined}
            displayValue={displayValue}
            showAge={false}
            showUnit={!embedded}
            thresholds={thresholds}
            timestamp={timestamp}
            trend={trend}
            unit={unit}
            value={safeValue}
          />
          {/* Stale data warning */}
          {isStale && (
            <p
              className="text-signal-warning-text font_body_3 mt-2 flex items-center gap-1"
              data-testid="stale-warning"
              role="alert"
            >
              <span aria-hidden="true">⏱️</span>
              <span>Data is {minutesAgo ??"10"}+ minutes old</span>
            </p>
          )}
          {/* PR 6: active override pill row. Absent when no override. */}
          {override && (
            <OverrideRow
              override={override}
              secondaryTextClassName={secondaryTextClassName}
            />
          )}
        </div>
        {showPumpStats && (
          <div
            className={twMerge(
              "grid w-full grid-cols-2 gap-3 mt-4 font_metric_caption sm:flex sm:w-auto sm:items-center sm:gap-4 sm:font_body_3",
              embedded &&"lg:mt-0 lg:grid lg:w-auto lg:grid-cols-1 lg:items-stretch lg:gap-4"
            )}
            role="group"
            aria-label="Pump status metrics"
            data-testid="secondary-metrics"
          >
            <div
              className={metricItemClassName}
              aria-label={safeIob !== null ? `Insulin on board: ${safeIob.toFixed(2)} units` :"Insulin on board: unavailable"}
            >
              <span className={twMerge(secondaryTextClassName, "font_metric_caption uppercase")} aria-hidden="true">
                IoB
              </span>
              <span className="sr-only">Insulin on board</span>
              <span
                className="text-foreground-primary font_metric_label"
                data-testid="iob-value"
                aria-hidden="true"
              >
                {safeIob !== null ? `${safeIob.toFixed(2)}u` :"--"}
              </span>
            </div>
            <div className={metricSeparatorClassName} aria-hidden="true" />
            <div
              className={metricItemClassName}
              aria-label={safeBasal !== null ? `Basal rate: ${safeBasal.toFixed(2)} units per hour` :"Basal rate: unavailable"}
            >
              <span className={twMerge(secondaryTextClassName, "font_metric_caption uppercase")} aria-hidden="true">
                Basal
              </span>
              <span className="sr-only">Basal rate</span>
              <span
                className="text-foreground-primary font_metric_label"
                data-testid="basal-value"
                aria-hidden="true"
              >
                {safeBasal !== null ? `${safeBasal.toFixed(2)} u/hr` :"--"}
              </span>
            </div>
            <div className={metricSeparatorClassName} aria-hidden="true" />
            <div
              className={metricItemClassName}
              aria-label={safeBattery !== null ? `Battery: ${Math.round(safeBattery)} percent` :"Battery: unavailable"}
            >
              <span className={twMerge(secondaryTextClassName, "font_metric_caption uppercase")} aria-hidden="true">
                Battery
              </span>
              <span className="sr-only">Battery level</span>
              <span
                className="text-foreground-primary font_metric_label"
                data-testid="battery-value"
                aria-hidden="true"
              >
                {safeBattery !== null ? `${Math.round(safeBattery)}%` :"--"}
              </span>
            </div>
            <div className={metricSeparatorClassName} aria-hidden="true" />
            <div
              className={metricItemClassName}
              aria-label={safeReservoir !== null ? `Reservoir: ${safeReservoir.toFixed(0)} units remaining` :"Reservoir: unavailable"}
            >
              <span className={twMerge(secondaryTextClassName, "font_metric_caption uppercase")} aria-hidden="true">
                Reservoir
              </span>
              <span className="sr-only">Reservoir level</span>
              <span
                className="text-foreground-primary font_metric_label"
                data-testid="reservoir-value"
                aria-hidden="true"
              >
                {safeReservoir !== null ? `${Math.round(safeReservoir)}u` :"--"}
              </span>
            </div>
            {/* PR 6: COB column. Only renders when present so the row
                stays the same width for users without active carbs. */}
            {safeCob !== null && (
              <>
                <div className={metricSeparatorClassName} aria-hidden="true" />
                <div
                  className={metricItemClassName}
                  aria-label={`Carbs on board: ${Math.round(safeCob)} grams`}
                >
                  <span
                    className={twMerge(secondaryTextClassName, "font_metric_caption uppercase")}
                    aria-hidden="true"
                  >
                    COB
                  </span>
                  <span className="sr-only">Carbs on board</span>
                  <span
                    className="text-foreground-primary font_metric_label"
                    data-testid="cob-value"
                    aria-hidden="true"
                  >
                    {Math.round(safeCob)}g
                  </span>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
// Re-export TrendDirection for backwards compatibility
// Primary source is now trend-arrow.tsx
export { type TrendDirection } from"@/components/TrendArrow";
export default GlucoseHero;
