"use client";

/**
 * useInsulinSummary Hook
 *
 * Story 30.7: Fetches insulin delivery summary statistics from the API.
 * Manages time period selection and data refreshing with
 * generation counter for race-condition safety.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  getInsulinSummary,
  getInsulinSummaryByDateRange,
  type InsulinSummaryResponse,
} from "@/lib/api";
import type { HistoryWindow } from "@/lib/glucose/history-selection";

export type InsulinPeriod = "24h" | "3d" | "7d" | "14d" | "30d" | "90d";

const PERIOD_TO_DAYS: Record<InsulinPeriod, number> = {
  "24h": 1,
  "3d": 3,
  "7d": 7,
  "14d": 14,
  "30d": 30,
  "90d": 90,
};

export const INSULIN_PERIOD_LABELS: Record<InsulinPeriod, string> = {
  "24h": "24 Hours",
  "3d": "3 Days",
  "7d": "7 Days",
  "14d": "14 Days",
  "30d": "30 Days",
  "90d": "90 Days",
};

export interface UseInsulinSummaryReturn {
  data: InsulinSummaryResponse | null;
  isLoading: boolean;
  error: string | null;
  period: InsulinPeriod;
  setPeriod: (p: InsulinPeriod) => void;
  refetch: () => void;
}

/** An explicit date window takes precedence over the selected period. */
export function useInsulinSummary(
  initialPeriod: InsulinPeriod = "14d",
  dateWindow?: HistoryWindow | null,
): UseInsulinSummaryReturn {
  const [data, setData] = useState<InsulinSummaryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<InsulinPeriod>(initialPeriod);
  const fetchGenRef = useRef(0);

  const fetchData = useCallback(async () => {
    const gen = ++fetchGenRef.current;
    setIsLoading(true);
    setError(null);
    setData(null);
    try {
      const result = dateWindow
        ? await getInsulinSummaryByDateRange(dateWindow.from, dateWindow.to)
        : await getInsulinSummary(PERIOD_TO_DAYS[period]);
      if (gen === fetchGenRef.current) {
        setData(result);
      }
    } catch (err) {
      if (gen === fetchGenRef.current) {
        setError(
          err instanceof Error ? err.message : "Failed to load insulin summary",
        );
      }
    } finally {
      if (gen === fetchGenRef.current) {
        setIsLoading(false);
      }
    }
  }, [dateWindow, period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, period, setPeriod, refetch: fetchData };
}
