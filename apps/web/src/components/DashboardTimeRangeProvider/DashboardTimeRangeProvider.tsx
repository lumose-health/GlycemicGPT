"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  createContext,
  useEffect,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  formatTimeRangeLabel,
  resolveRawTimeRange,
} from "@/lib/glucose/time-range-expressions";
import type {
  HistorySelection,
  HistoryWindow,
} from "@/lib/glucose/history-selection";
import {
  getPresetRawTimeRange,
  getRawTimeRangeForSelection,
  parseDashboardTimeRangeParams,
  serializeDashboardTimeRangeParams,
} from "@/lib/glucose/dashboard-time-range-url";
import { GLUCOSE_TIME_RANGES } from "@/lib/glucose/time-ranges";
import type {
  DashboardTimeRangeContextValue,
  DashboardTimeRangeProviderProps,
} from "./DashboardTimeRangeProvider.types";

const DashboardTimeRangeContext =
  createContext<DashboardTimeRangeContextValue | null>(null);

function getTimeZone(): string {
  if (typeof Intl === "undefined") {
    return "UTC";
  }

  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export { getPresetRawTimeRange };

export function getSelectionLabel(
  selection: HistorySelection,
  timeZone: string,
): string {
  if (selection.kind === "preset") {
    const preset = GLUCOSE_TIME_RANGES.find(
      (range) => range.key === selection.range,
    );
    return preset ? `Last ${preset.label}` : "Time range";
  }

  return selection.label ?? formatTimeRangeLabel(selection.window, timeZone);
}

function resolveSelectionWindow(
  selection: HistorySelection,
  timeZone: string,
): HistoryWindow | null {
  if (selection.kind === "custom") {
    return selection.window;
  }

  return (
    resolveRawTimeRange(getPresetRawTimeRange(selection.range), { timeZone })
      ?.window ?? null
  );
}

export function DashboardTimeRangeProvider({
  children,
  defaultRange = "24h",
}: DashboardTimeRangeProviderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [timeZone] = useState(getTimeZone);
  const isDashboardPath =
    pathname === "/dashboard" || pathname === "/v2/dashboard";
  const [selection, setSelectionState] = useState<HistorySelection>(() =>
    isDashboardPath
      ? (parseDashboardTimeRangeParams(searchParams, timeZone) ?? {
          kind: "preset",
          range: defaultRange,
        })
      : { kind: "preset", range: defaultRange },
  );
  const pendingUrlRangeRef = useRef<string | null>(null);
  const searchParamsString = searchParams.toString();

  const setSelection = useCallback(
    (nextSelection: HistorySelection) => {
      setSelectionState(nextSelection);
      if (!isDashboardPath) return;

      const raw = getRawTimeRangeForSelection(nextSelection);
      pendingUrlRangeRef.current = `${raw.from}\u0000${raw.to}`;
      const nextSearchParams = serializeDashboardTimeRangeParams(
        searchParams,
        nextSelection,
      );
      router.replace(`${pathname}?${nextSearchParams}`, { scroll: false });
    },
    [isDashboardPath, pathname, router, searchParams],
  );

  useEffect(() => {
    if (!isDashboardPath) {
      pendingUrlRangeRef.current = null;
      return;
    }

    const currentSearchParams = new URLSearchParams(searchParamsString);
    const urlSelection = parseDashboardTimeRangeParams(
      currentSearchParams,
      timeZone,
    );
    const pendingUrlRange = pendingUrlRangeRef.current;
    if (pendingUrlRange) {
      if (!urlSelection) return;
      const pendingRaw = getRawTimeRangeForSelection(urlSelection);
      if (`${pendingRaw.from}\u0000${pendingRaw.to}` !== pendingUrlRange)
        return;
      pendingUrlRangeRef.current = null;
    }

    if (!urlSelection) {
      const canonicalSearchParams = serializeDashboardTimeRangeParams(
        currentSearchParams,
        selection,
      );
      if (canonicalSearchParams === searchParamsString) return;
      router.replace(`${pathname}?${canonicalSearchParams}`, { scroll: false });
      return;
    }

    const currentRaw = getRawTimeRangeForSelection(selection);
    const urlRaw = getRawTimeRangeForSelection(urlSelection);
    if (currentRaw.from !== urlRaw.from || currentRaw.to !== urlRaw.to) {
      setSelectionState(urlSelection);
    }
  }, [
    isDashboardPath,
    pathname,
    router,
    searchParamsString,
    selection,
    timeZone,
  ]);

  const value = useMemo<DashboardTimeRangeContextValue>(
    () => ({
      selection,
      currentWindow: resolveSelectionWindow(selection, timeZone),
      label: getSelectionLabel(selection, timeZone),
      timeZone,
      setSelection,
    }),
    [selection, setSelection, timeZone],
  );

  return (
    <DashboardTimeRangeContext.Provider value={value}>
      {children}
    </DashboardTimeRangeContext.Provider>
  );
}

export function useDashboardTimeRange(): DashboardTimeRangeContextValue {
  const context = useContext(DashboardTimeRangeContext);

  if (!context) {
    throw new Error(
      "useDashboardTimeRange must be used inside DashboardTimeRangeProvider",
    );
  }

  return context;
}

export function useOptionalDashboardTimeRange(): DashboardTimeRangeContextValue | null {
  return useContext(DashboardTimeRangeContext);
}
