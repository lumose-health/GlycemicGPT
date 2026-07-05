"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  formatTimeRangeLabel,
  resolveRawTimeRange,
  type RawTimeRangeInput,
} from "@/lib/glucose/time-range-expressions";
import type { HistorySelection, HistoryWindow } from "@/lib/glucose/history-selection";
import { GLUCOSE_TIME_RANGES, getTimeRangeHours, type TimeRange } from "@/lib/glucose/time-ranges";

interface DashboardTimeRangeContextValue {
  selection: HistorySelection;
  currentWindow: HistoryWindow | null;
  label: string;
  timeZone: string;
  setSelection: (selection: HistorySelection) => void;
}

interface DashboardTimeRangeProviderProps {
  children: ReactNode;
  defaultRange?: TimeRange;
}

const DashboardTimeRangeContext = createContext<DashboardTimeRangeContextValue | null>(null);

function getTimeZone(): string {
  if (typeof Intl === "undefined") {
    return "UTC";
  }

  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function getPresetRawTimeRange(range: TimeRange): RawTimeRangeInput {
  const hours = getTimeRangeHours(range) ?? 24;

  return {
    from: `now-${hours}h`,
    to: "now",
  };
}

export function getSelectionLabel(selection: HistorySelection, timeZone: string): string {
  if (selection.kind === "preset") {
    const preset = GLUCOSE_TIME_RANGES.find((range) => range.key === selection.range);
    return preset ? `Last ${preset.label}` : "Time range";
  }

  return selection.label ?? formatTimeRangeLabel(selection.window, timeZone);
}

function resolveSelectionWindow(selection: HistorySelection, timeZone: string): HistoryWindow | null {
  if (selection.kind === "custom") {
    return selection.window;
  }

  return resolveRawTimeRange(getPresetRawTimeRange(selection.range), { timeZone })?.window ?? null;
}

export function DashboardTimeRangeProvider({
  children,
  defaultRange = "24h",
}: DashboardTimeRangeProviderProps) {
  const [selection, setSelection] = useState<HistorySelection>({
    kind: "preset",
    range: defaultRange,
  });
  const [timeZone] = useState(getTimeZone);

  const value = useMemo<DashboardTimeRangeContextValue>(() => ({
    selection,
    currentWindow: resolveSelectionWindow(selection, timeZone),
    label: getSelectionLabel(selection, timeZone),
    timeZone,
    setSelection,
  }), [selection, timeZone]);

  return (
    <DashboardTimeRangeContext.Provider value={value}>
      {children}
    </DashboardTimeRangeContext.Provider>
  );
}

export function useDashboardTimeRange(): DashboardTimeRangeContextValue {
  const context = useContext(DashboardTimeRangeContext);

  if (!context) {
    throw new Error("useDashboardTimeRange must be used inside DashboardTimeRangeProvider");
  }

  return context;
}

export function useOptionalDashboardTimeRange(): DashboardTimeRangeContextValue | null {
  return useContext(DashboardTimeRangeContext);
}
