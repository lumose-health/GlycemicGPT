"use client";

import { formatGlucose, type GlucoseUnit } from "@/lib/glucose-units";
import type { BolusReviewItem } from "@/lib/api";
import { INSULIN_DOSE_LIMITS, MAX_DISPLAY_IOB_UNITS } from "@/lib/insulin";
import {
  isKnownBolusReviewEventType,
  warnUnknownBolusReviewEventType,
} from "@/components/InsulinTimeline/insulin-timeline-data";

function filterKnownBoluses(
  boluses: readonly BolusReviewItem[],
): BolusReviewItem[] {
  return boluses.filter((bolus) => {
    if (isKnownBolusReviewEventType(bolus.event_type)) {
      return true;
    }
    warnUnknownBolusReviewEventType(bolus.event_type, "ClinicalReportBolusTable");
    return false;
  });
}

const BG_MIN = 20;
const BG_MAX = 500;

// Matches the display-only sanity clamps in dashboard/bolus-review-table.tsx
// and BolusReviewTable.tsx: cap implausible/unit-confused values rather than
// render them as a real dose or reading in a clinician-facing report.
function formatUnits(value: number, maxDisplay: number): string {
  if (!Number.isFinite(value) || value < 0) return "---";
  if (value > maxDisplay) return `>${maxDisplay} U`;
  return `${value.toFixed(2)} U`;
}

function formatBg(value: number, unit: GlucoseUnit): string {
  const clamped = Math.min(BG_MAX, Math.max(BG_MIN, value));
  return formatGlucose(clamped, unit);
}

function formatIob(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "---";
  if (value > MAX_DISPLAY_IOB_UNITS) return `>${MAX_DISPLAY_IOB_UNITS} U`;
  return `${value.toFixed(1)} U`;
}

export function BolusTable({
  boluses,
  totalCount,
  unit = "mgdl",
}: {
  boluses: BolusReviewItem[];
  totalCount: number;
  unit?: GlucoseUnit;
}) {
  const knownBoluses = filterKnownBoluses(boluses);
  const skippedCount = boluses.length - knownBoluses.length;

  if (knownBoluses.length === 0) {
    // A clinician must never read an all-filtered result as "took no
    // insulin" -- that's a different clinical fact than "every event this
    // period had an unrecognized type and was withheld from the report".
    return (
      <p className="text-sm text-slate-500">
        {boluses.length > 0
          ? `${boluses.length} bolus event${boluses.length === 1 ? "" : "s"} could not be displayed.`
          : "No bolus events for this period."}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-slate-300 dark:border-slate-600 print:border-slate-400">
              <th className="py-1.5 px-2 text-left text-xs font-semibold text-slate-500 print:text-slate-600 uppercase tracking-wider">
                Date/Time
              </th>
              <th className="py-1.5 px-2 text-right text-xs font-semibold text-slate-500 print:text-slate-600 uppercase tracking-wider">
                Units
              </th>
              <th className="py-1.5 px-2 text-center text-xs font-semibold text-slate-500 print:text-slate-600 uppercase tracking-wider">
                Type
              </th>
              <th className="py-1.5 px-2 text-left text-xs font-semibold text-slate-500 print:text-slate-600 uppercase tracking-wider">
                Reason
              </th>
              <th className="py-1.5 px-2 text-right text-xs font-semibold text-slate-500 print:text-slate-600 uppercase tracking-wider">
                BG
              </th>
              <th className="py-1.5 px-2 text-right text-xs font-semibold text-slate-500 print:text-slate-600 uppercase tracking-wider">
                IoB
              </th>
            </tr>
          </thead>
          <tbody>
            {knownBoluses.map((b, i) => {
              const modeLabel: Record<string, string> = {
                SLEEP: "Sleep Mode",
                EXERCISE: "Exercise Mode",
              };
              const reasonLabel = b.is_automated
                ? (b.control_iq_reason || "Auto-correction")
                : (b.pump_activity_mode && b.pump_activity_mode !== "NONE"
                    ? modeLabel[b.pump_activity_mode] ?? b.pump_activity_mode
                    : "Manual");
              return (
                <tr
                  key={`${b.event_timestamp}-${i}`}
                  className="border-b border-slate-200 dark:border-slate-700 print:border-slate-300"
                >
                  <td className="py-1.5 px-2 text-slate-600 dark:text-slate-300 print:text-slate-700 whitespace-nowrap">
                    {new Date(b.event_timestamp).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="py-1.5 px-2 text-right font-medium text-slate-900 dark:text-white print:text-black">
                    {formatUnits(
                      b.units,
                      b.event_type === "basal_injection"
                        ? INSULIN_DOSE_LIMITS.maxBasalInjectionUnits
                        : INSULIN_DOSE_LIMITS.maxBolusUnits,
                    )}
                  </td>
                  <td className="py-1.5 px-2 text-center">
                    {b.is_automated ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-xs font-medium bg-violet-100 text-violet-700 print:bg-violet-50 print:text-violet-800">
                        Auto
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-xs font-medium bg-slate-100 text-slate-600 print:bg-slate-50 print:text-slate-700">
                        Manual
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 px-2 text-left text-xs text-slate-500 dark:text-slate-400 print:text-slate-600">
                    {reasonLabel}
                  </td>
                  <td className="py-1.5 px-2 text-right text-slate-600 dark:text-slate-300 print:text-slate-700">
                    {b.bg_at_event != null
                      ? formatBg(b.bg_at_event, unit)
                      : "---"}
                  </td>
                  <td className="py-1.5 px-2 text-right text-slate-600 dark:text-slate-300 print:text-slate-700">
                    {b.iob_at_event != null
                      ? formatIob(b.iob_at_event)
                      : "---"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {skippedCount > 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-300 print:text-amber-800">
          {skippedCount} bolus event{skippedCount === 1 ? "" : "s"} could not
          be displayed because the event type is unrecognized.
        </p>
      )}
      {totalCount > boluses.length && (
        <p className="text-xs text-slate-400 print:text-slate-500">
          This response shows {knownBoluses.length} recognized bolus events
          from {totalCount} total bolus events.
        </p>
      )}
    </div>
  );
}
