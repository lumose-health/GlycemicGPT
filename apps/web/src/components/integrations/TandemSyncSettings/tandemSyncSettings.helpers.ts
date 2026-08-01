import type { HistorySelection } from "@/lib/glucose/history-selection";
import type { QuickRangeOption } from "@/lib/glucose/time-range-expressions";
import type { TimeRange } from "@/lib/glucose/time-ranges";

export const MIN_SYNC_INTERVAL = 15;
export const MAX_SYNC_INTERVAL = 1440;
export const MAX_IMPORT_DAYS = 31;

export type TandemImportRange = "7" | "14" | "30";

export const TANDEM_IMPORT_PRESET_RANGES = [
  "7d",
  "14d",
  "30d",
] as const satisfies readonly TimeRange[];

export const TANDEM_IMPORT_QUICK_RANGES = [
  { display: "Last 7 days", from: "now-6d/d", to: "now" },
  { display: "Last 14 days", from: "now-13d/d", to: "now" },
  { display: "Last 30 days", from: "now-29d/d", to: "now" },
] as const satisfies readonly QuickRangeOption[];

const IMPORT_PRESET_TO_RANGE: Partial<Record<TimeRange, TandemImportRange>> = {
  "7d": "7",
  "14d": "14",
  "30d": "30",
};

export function getTandemImportRange(
  preset: TimeRange,
): TandemImportRange | null {
  return IMPORT_PRESET_TO_RANGE[preset] ?? null;
}

export function getImportHistorySelection(
  start: string,
  end: string,
  now = new Date(),
): HistorySelection {
  if (!start || !end) {
    return {
      kind: "custom",
      label: "Select time range",
      raw: { from: "now-29d/d", to: "now" },
      window: {
        from: new Date(now.getTime() - 29 * 86_400_000).toISOString(),
        to: now.toISOString(),
      },
    };
  }

  return {
    kind: "custom",
    label: `${start} to ${end}`,
    raw: { from: start, to: end },
    window: {
      from: `${start}T00:00:00.000Z`,
      to: `${end}T23:59:59.000Z`,
    },
  };
}

export function toDay(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

export function getImportDateRange(
  range: TandemImportRange,
  latest: string | null,
  earliest: string | null,
  now = new Date(),
): { start: string; end: string } {
  const end = toDay(latest) || now.toISOString().slice(0, 10);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  const dayCount = Number(range);
  let start = new Date(endMs - (dayCount - 1) * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const earliestDay = toDay(earliest);

  if (earliestDay && start < earliestDay) {
    start = earliestDay;
  }

  return { start, end };
}
