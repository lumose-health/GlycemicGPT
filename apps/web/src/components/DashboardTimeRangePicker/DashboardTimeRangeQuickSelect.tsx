"use client";

import { Button } from "@/base/Button";
import {
  resolveRawTimeRange,
  type RawTimeRangeInput,
} from "@/lib/glucose/time-range-expressions";
import type { HistorySelection } from "@/lib/glucose/history-selection";
import { twMerge } from "@/lib/ui/twMerge";
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

function isActiveRange(
  selection: HistorySelection,
  range: QuickTimeRange,
): boolean {
  if (selection.kind === "preset") {
    return selection.range === range;
  }

  return (
    range === "90d" &&
    selection.raw?.from === "now-90d" &&
    selection.raw.to === "now"
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

  function selectRange(option: QuickTimeRangeOption) {
    if (option.key !== "90d") {
      onChange({ kind: "preset", range: option.key });
      return;
    }

    const raw: RawTimeRangeInput = { from: "now-90d", to: "now" };
    const resolved = resolveRawTimeRange(raw, {
      display: option.accessibleLabel,
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
    <div
      aria-label="Quick time range"
      className={twMerge(
        "grid w-full gap-2",
        options.length === 4 ? "grid-cols-4" : "grid-cols-5",
      )}
      role="group"
    >
      {options.map((option) => {
        const isActive = isActiveRange(selection, option.key);

        return (
          <Button
            aria-label={option.accessibleLabel}
            aria-pressed={isActive}
            className={twMerge(
              "font_metric_caption min-h-11 rounded-button border px-2 transition-colors focus-visible:ring-2 focus-visible:ring-border-active",
              isActive
                ? "border-accent bg-accent text-accent-foreground"
                : "border-border-default bg-surface-primary text-foreground-secondary hover:bg-surface-secondary hover:text-foreground-primary",
            )}
            key={option.key}
            onClick={() => selectRange(option)}
          >
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}
