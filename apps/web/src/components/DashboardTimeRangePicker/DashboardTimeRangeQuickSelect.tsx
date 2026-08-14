"use client";

import { TimeRangeQuickSelect } from "@/components/TimeRangeQuickSelect";
import {
  resolveRawTimeRange,
  type RawTimeRangeInput,
} from "@/lib/glucose/time-range-expressions";
import type { HistorySelection } from "@/lib/glucose/history-selection";
import type {
  DashboardTimeRangeQuickSelectProps,
  QuickTimeRange,
} from "./DashboardTimeRangePicker.types";

interface QuickTimeRangeOption {
  key: QuickTimeRange;
  label: string;
  accessibleLabel: string;
}

const QUICK_TIME_RANGES: QuickTimeRangeOption[] = [
  { key: "3h", label: "3h", accessibleLabel: "Last 3 hours" },
  { key: "6h", label: "6h", accessibleLabel: "Last 6 hours" },
  { key: "12h", label: "12h", accessibleLabel: "Last 12 hours" },
  { key: "24h", label: "24h", accessibleLabel: "Last 24 hours" },
  { key: "3d", label: "3d", accessibleLabel: "Last 3 days" },
  { key: "7d", label: "7d", accessibleLabel: "Last 7 days" },
  { key: "14d", label: "14d", accessibleLabel: "Last 14 days" },
  { key: "30d", label: "30d", accessibleLabel: "Last 30 days" },
  { key: "90d", label: "90d", accessibleLabel: "Last 90 days" },
];

function getActiveRange(
  selection: HistorySelection,
): QuickTimeRange | null {
  if (selection.kind === "preset") {
    return selection.range;
  }

  return (
    selection.raw?.from === "now-90d" &&
    selection.raw.to === "now"
      ? "90d"
      : null
  );
}

export function DashboardTimeRangeQuickSelect({
  ranges,
  selection,
  timeZone,
  onChange,
}: DashboardTimeRangeQuickSelectProps) {
  const options = ranges
    ? QUICK_TIME_RANGES.filter((option) => ranges.includes(option.key))
    : QUICK_TIME_RANGES;

  function selectRange(range: QuickTimeRange) {
    if (range !== "90d") {
      onChange({ kind: "preset", range });
      return;
    }

    const option = QUICK_TIME_RANGES.find(({ key }) => key === range);
    const raw: RawTimeRangeInput = { from: "now-90d", to: "now" };
    const resolved = resolveRawTimeRange(raw, {
      display: option?.accessibleLabel ?? "Last 90 days",
      timeZone,
    });

    if (!resolved) {
      return;
    }

    onChange({
      kind: "custom",
      label: resolved.display,
      raw,
      window: resolved.window,
    });
  }

  return (
    <TimeRangeQuickSelect
      className={options.length === 4 ? "grid-cols-4" : "grid-cols-5"}
      onChange={selectRange}
      options={options.map((option) => ({
        accessibleLabel: option.accessibleLabel,
        label: option.label,
        value: option.key,
      }))}
      value={getActiveRange(selection)}
    />
  );
}
