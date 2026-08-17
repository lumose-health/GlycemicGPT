"use client";
/**
 * Bolus Review Table
 *
 * Story 30.7: Displays a scrollable table of recent bolus events with
 * type badges, BG/IoB context, and Control-IQ reason. Period-selectable.
 */
import { useRef } from "react";
import { Button, Icon } from "@/base";
import {
  useBolusReview,
  type BolusReviewPeriod,
  BOLUS_PERIOD_LABELS,
} from "@/hooks/use-bolus-review";
import type { BolusReviewItem } from "@/lib/api";
import {
  formatGlucose,
  unitLabel,
  type GlucoseUnit,
} from "@/lib/glucose-units";
import { useOptionalDashboardTimeRange } from "@/components/DashboardTimeRangeProvider";
import { twMerge } from "@/lib/ui/twMerge";
import {
  isKnownBolusReviewEventType,
  warnUnknownBolusReviewEventType,
} from "@/components/InsulinTimeline/insulin-timeline-data";
import type { BolusReviewTableProps } from "./BolusReviewTable.types";
function filterKnownBoluses(
  boluses: readonly BolusReviewItem[]
): BolusReviewItem[] {
  return boluses.filter((bolus) => {
    if (isKnownBolusReviewEventType(bolus.event_type)) {
      return true;
    }
    warnUnknownBolusReviewEventType(bolus.event_type, "BolusReviewTable");
    return false;
  });
}
const PERIOD_OPTIONS: { value: BolusReviewPeriod; label: string }[] = [
  { value: "24h", label: "24H" },
  { value: "3d", label: "3D" },
  { value: "7d", label: "7D" },
  { value: "14d", label: "14D" },
  { value: "30d", label: "30D" },
];
function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "---";
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "---";
  }
}
function SkeletonRow() {
  return (
    <tr className="border-b border-border-default/50">
      {Array.from({ length: 6 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="animate-pulse h-4 bg-surface-tertiary rounded-panel w-16" />
        </td>
      ))}
    </tr>
  );
}
const MAX_BOLUS_DISPLAY = 50;
// Long-acting (basal) injections run higher than boluses (Tresiba U-200 max
// single injection = 160U), so they get a wider display ceiling.
const MAX_BASAL_INJECTION_DISPLAY = 160;
const BG_MIN = 20;
const BG_MAX = 500;
function formatUnits(
  value: number | null | undefined,
  decimals: number,
  maxDisplay: number = MAX_BOLUS_DISPLAY,
): string {
  if (value == null || !Number.isFinite(value) || value < 0) return "---";
  if (value > maxDisplay) return `>${maxDisplay}`;
  return `${value.toFixed(decimals)} U`;
}
function isBasalInjection(item: BolusReviewItem): boolean {
  return item.event_type === "basal_injection";
}
function formatBg(value: number | null | undefined, unit: GlucoseUnit): string {
  if (value == null || !Number.isFinite(value)) return "---";
  // Clamp the 20-500 mg/dL invariant FIRST (canonical units), then convert
  // for display so mmol precision is correct.
  const clamped = Math.min(BG_MAX, Math.max(BG_MIN, value));
  return `${formatGlucose(clamped, unit)} ${unitLabel(unit)}`;
}
function BolusRow({
  bolus,
  unit,
}: {
  bolus: BolusReviewItem;
  unit: GlucoseUnit;
}) {
  const basalInjection = isBasalInjection(bolus);
  const unitsMax = basalInjection
    ? MAX_BASAL_INJECTION_DISPLAY
    : MAX_BOLUS_DISPLAY;
  const typeLabel = basalInjection
    ? "basal injection"
    : bolus.is_automated
      ? "automated"
      : "manual";
  return (
    <tr
      className="border-b border-border-default/50 hover:bg-surface-secondary/30 transition-colors"
      aria-label={`Insulin at ${formatDateTime(bolus.event_timestamp)}, ${formatUnits(bolus.units, 2, unitsMax)}, ${typeLabel}`}
    >
      <td className="px-4 py-3 font_body_3 text-foreground-secondary whitespace-nowrap">
        {formatDateTime(bolus.event_timestamp)}
      </td>
      <td className="px-4 py-3 font_body_3 text-foreground-primary font_metric_label whitespace-nowrap">
        {formatUnits(bolus.units, 2, unitsMax)}
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        {basalInjection ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded-panel font_metric_caption bg-signal-info-fill/20 text-signal-info-text">
            Basal injection
          </span>
        ) : bolus.is_automated ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded-panel font_metric_caption bg-signal-partial-fill/20 text-signal-partial-text">
            Auto
          </span>
        ) : (
          <span className="inline-flex items-center px-2 py-0.5 rounded-panel font_metric_caption bg-surface-secondary/50 text-foreground-primary">
            Manual
          </span>
        )}
      </td>
      <td className="px-4 py-3 font_body_3 text-foreground-secondary whitespace-nowrap">
        {basalInjection ? "---" : formatBg(bolus.bg_at_event, unit)}
      </td>
      <td className="px-4 py-3 font_body_3 text-foreground-secondary whitespace-nowrap">
        {basalInjection ? "---" : formatUnits(bolus.iob_at_event, 1)}
      </td>
      <td className="px-4 py-3 font_body_3 text-foreground-secondary whitespace-nowrap max-w-[200px] truncate">
        {basalInjection
          ? "Long-acting (basal)"
          : bolus.is_automated
            ? bolus.control_iq_reason || "Automated correction"
            : ""}
      </td>
    </tr>
  );
}
export function BolusReviewTable({
  className,
  unit = "mgdl",
}: BolusReviewTableProps) {
  const dashboardTimeRange = useOptionalDashboardTimeRange();
  const { data, isLoading, error, period, setPeriod, refetch } = useBolusReview(
    "7d",
    dashboardTimeRange?.currentWindow,
  );
  const periodLabel =
    dashboardTimeRange?.label ?? BOLUS_PERIOD_LABELS[period] ?? period;
  const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const handlePeriodKeyDown = (e: React.KeyboardEvent, index: number) => {
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
  const knownBoluses = data ? filterKnownBoluses(data.boluses) : [];
  const noData = !data || !data.boluses || knownBoluses.length === 0;
  const periodSelector = (
    <div
      className="flex gap-1"
      role="radiogroup"
      aria-label="Insulin review time period"
    >
      {PERIOD_OPTIONS.map((opt, i) => (
        <Button
          key={opt.value}
          ref={(el) => {
            buttonsRef.current[i] = el;
          }}
          role="radio"
          aria-checked={period === opt.value}
          aria-label={BOLUS_PERIOD_LABELS[opt.value]}
          tabIndex={period === opt.value ? 0 : -1}
          onClick={() => setPeriod(opt.value)}
          onKeyDown={(e) => handlePeriodKeyDown(e, i)}
          className={twMerge(
            "px-2.5 py-1 font_metric_caption rounded-panel transition-colors outline-hidden focus-visible:ring-2 focus-visible:ring-signal-partial-fill focus-visible:ring-offset-2 focus-visible:ring-offset-surface-primary",
            period === opt.value
              ? "bg-signal-partial-fill text-foreground-inverse"
              : "text-foreground-secondary hover:text-foreground-primary hover:bg-surface-secondary",
          )}
        >
          {opt.label}
        </Button>
      ))}
    </div>
  );
  return (
    <section
      aria-labelledby="bolus-review-heading"
      aria-busy={isLoading}
      data-testid="bolus-review"
      className={twMerge(
        "bg-surface-primary rounded-panel p-6 border border-border-default",
        className,
      )}
    >
      {/* Header with period selector */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-signal-partial-fill/10 rounded-panel">
            <Icon
              decorative
              icon="list-ordered"
              className="h-5 w-5 text-signal-partial-text"
            />
          </div>
          <h2
            id="bolus-review-heading"
            className="text-foreground-primary font_header_4"
          >
            Recent Insulin
            <span className="text-foreground-secondary font_body_3 font_body_3 ml-2">
              {periodLabel}
            </span>
          </h2>
        </div>
        {dashboardTimeRange ? null : periodSelector}
      </div>
      {/* Table content */}
      {isLoading ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border-hover">
                <th
                  scope="col"
                  className="px-4 py-2 font_metric_caption text-foreground-secondary"
                >
                  Time
                </th>
                <th
                  scope="col"
                  className="px-4 py-2 font_metric_caption text-foreground-secondary"
                >
                  Units
                </th>
                <th
                  scope="col"
                  className="px-4 py-2 font_metric_caption text-foreground-secondary"
                >
                  Type
                </th>
                <th
                  scope="col"
                  className="px-4 py-2 font_metric_caption text-foreground-secondary"
                >
                  BG
                </th>
                <th
                  scope="col"
                  className="px-4 py-2 font_metric_caption text-foreground-secondary"
                >
                  IoB
                </th>
                <th
                  scope="col"
                  className="px-4 py-2 font_metric_caption text-foreground-secondary"
                >
                  Reason
                </th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }).map((_, i) => (
                <SkeletonRow key={i} />
              ))}
            </tbody>
          </table>
        </div>
      ) : error ? (
        <div className="text-center py-4">
          <div
            className="flex items-center gap-2 text-signal-error-text font_body_3 justify-center mb-3"
            role="alert"
          >
            <Icon decorative icon="alert" className="h-4 w-4" />
            <p>Failed to load bolus data.</p>
          </div>
          <p className="text-foreground-secondary font_metric_caption mb-3 max-w-md truncate">
            {error}
          </p>
          <Button
            type="button"
            onClick={refetch}
            className="text-signal-partial-text hover:text-signal-partial-text font_body_3 outline-hidden focus-visible:ring-2 focus-visible:ring-signal-partial-fill focus-visible:ring-offset-2 focus-visible:ring-offset-surface-primary rounded-panel"
          >
            Retry
          </Button>
        </div>
      ) : noData ? (
        <p className="text-foreground-secondary font_body_3 text-center py-4">
          No insulin events recorded for this period.
        </p>
      ) : (
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-surface-primary">
              <tr className="border-b border-border-hover">
                <th
                  scope="col"
                  className="px-4 py-2 font_metric_caption text-foreground-secondary"
                >
                  Time
                </th>
                <th
                  scope="col"
                  className="px-4 py-2 font_metric_caption text-foreground-secondary"
                >
                  Units
                </th>
                <th
                  scope="col"
                  className="px-4 py-2 font_metric_caption text-foreground-secondary"
                >
                  Type
                </th>
                <th
                  scope="col"
                  className="px-4 py-2 font_metric_caption text-foreground-secondary"
                >
                  BG
                </th>
                <th
                  scope="col"
                  className="px-4 py-2 font_metric_caption text-foreground-secondary"
                >
                  IoB
                </th>
                <th
                  scope="col"
                  className="px-4 py-2 font_metric_caption text-foreground-secondary"
                >
                  Reason
                </th>
              </tr>
            </thead>
            <tbody>
              {knownBoluses.map((bolus, i) => (
                <BolusRow
                  key={`${bolus.event_timestamp}-${i}`}
                  bolus={bolus}
                  unit={unit}
                />
              ))}
            </tbody>
          </table>
          {data.total_count > knownBoluses.length && (
            <p className="text-foreground-secondary font_metric_caption text-center mt-3">
              Showing {knownBoluses.length} of {data.total_count} bolus events
            </p>
          )}
        </div>
      )}
    </section>
  );
}
