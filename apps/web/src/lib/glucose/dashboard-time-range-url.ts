import {
  resolveRawTimeRange,
  type RawTimeRangeInput,
} from "@/lib/glucose/time-range-expressions";
import type {
  HistorySelection,
  HistoryWindow,
} from "@/lib/glucose/history-selection";
import {
  GLUCOSE_TIME_RANGES,
  getTimeRangeHours,
  type TimeRange,
} from "@/lib/glucose/time-ranges";

export const DASHBOARD_BROWSER_TIME_ZONE = "browser";

interface SearchParamsReader {
  get(name: string): string | null;
  toString(): string;
}

export function getPresetRawTimeRange(range: TimeRange): RawTimeRangeInput {
  const hours = getTimeRangeHours(range) ?? 24;

  return {
    from: `now-${hours}h`,
    to: "now",
  };
}

export function getRawTimeRangeForSelection(
  selection: HistorySelection,
): RawTimeRangeInput {
  if (selection.kind === "preset") {
    return getPresetRawTimeRange(selection.range);
  }

  return selection.raw ?? selection.window;
}

function getPresetForRawRange(raw: RawTimeRangeInput): TimeRange | null {
  if (raw.to !== "now") return null;

  return (
    GLUCOSE_TIME_RANGES.find(({ hours }) => raw.from === `now-${hours}h`)
      ?.key ?? null
  );
}

export function parseDashboardTimeRangeParams(
  searchParams: SearchParamsReader,
  timeZone: string,
): HistorySelection | null {
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const requestedTimeZone = searchParams.get("timezone");

  if (!from || !to) return null;
  if (
    requestedTimeZone !== null &&
    requestedTimeZone !== DASHBOARD_BROWSER_TIME_ZONE
  ) {
    return null;
  }

  const raw = { from, to };
  const preset = getPresetForRawRange(raw);
  if (preset) {
    return { kind: "preset", range: preset };
  }

  const resolved = resolveRawTimeRange(raw, { timeZone });
  if (!resolved || resolved.exceedsSafetyCap) return null;

  return {
    kind: "custom",
    label: resolved.display,
    raw,
    window: resolved.window,
  };
}

export function serializeDashboardTimeRangeParams(
  currentSearchParams: SearchParamsReader,
  selection: HistorySelection,
): string {
  const params = new URLSearchParams(currentSearchParams.toString());
  const raw = getRawTimeRangeForSelection(selection);

  params.set("from", raw.from);
  params.set("to", raw.to);
  params.set("timezone", DASHBOARD_BROWSER_TIME_ZONE);

  return params.toString();
}

export function windowsMatch(
  first?: HistoryWindow | null,
  second?: HistoryWindow | null,
): boolean {
  return Boolean(
    first &&
    second &&
    new Date(first.from).getTime() === new Date(second.from).getTime() &&
    new Date(first.to).getTime() === new Date(second.to).getTime(),
  );
}
