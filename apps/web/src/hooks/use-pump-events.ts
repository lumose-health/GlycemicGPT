"use client";

/**
 * usePumpEvents Hook
 *
 * Fetches pump event history (bolus, basal, etc.) for chart overlays.
 * Mirrors the useGlucoseHistory pattern with generation-counter fetch.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { getPumpEventHistory, type PumpEventReading } from "@/lib/api";
import { type ChartTimePeriod, PERIOD_TO_MINUTES } from "@/lib/chart-periods";
import type { HistoryWindow } from "@/lib/glucose/history-selection";

const MINUTE_MS = 60 * 1000;
// Recorded pump intervals can outlive the two hour fallback used when duration
// is missing. A day of context covers those confirmed intervals without
// turning every chart request into a full history fetch.
const BASAL_CONTINUITY_LOOKBACK_MINUTES = 24 * 60;
const API_MIN_MINUTES = 5;
const API_MAX_MINUTES = 30 * 24 * 60;
const API_MAX_EVENTS = 5000;

// Scale limit to period -- pump events are sparser than glucose but
// Control-IQ basal adjustments can generate ~288/day
const PERIOD_TO_LIMIT: Record<ChartTimePeriod, number> = {
  "3h": 200,
  "6h": 400,
  "12h": 600,
  "24h": 1000,
  "3d": 2000,
  "7d": 3500,
  "14d": 5000,
  "30d": 5000,
};

export interface PumpEventsRequest {
  minutes: number;
  limit: number;
  isRangeLimited: boolean;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function getLimitForMinutes(minutes: number): number {
  const period = (
    Object.entries(PERIOD_TO_MINUTES) as [ChartTimePeriod, number][]
  ).find(([, periodMinutes]) => minutes <= periodMinutes)?.[0];

  return period ? PERIOD_TO_LIMIT[period] : API_MAX_EVENTS;
}

/**
 * Calculates a minutes based request for the existing pump history API.
 * Historical windows must be measured back from now because the endpoint does
 * not accept explicit start and end timestamps.
 */
export function calculatePumpEventsRequest(
  period: ChartTimePeriod,
  window?: HistoryWindow | null,
  nowMs: number = Date.now(),
): PumpEventsRequest {
  if (!window) {
    const requestedMinutes =
      PERIOD_TO_MINUTES[period] + BASAL_CONTINUITY_LOOKBACK_MINUTES;
    const minutes = clamp(requestedMinutes, API_MIN_MINUTES, API_MAX_MINUTES);

    return {
      minutes,
      limit: Math.min(API_MAX_EVENTS, getLimitForMinutes(minutes)),
      isRangeLimited: minutes !== requestedMinutes,
    };
  }

  const fromMs = new Date(window.from).getTime();
  const toMs = new Date(window.to).getTime();
  if (
    !Number.isFinite(fromMs) ||
    !Number.isFinite(toMs) ||
    toMs < fromMs ||
    !Number.isFinite(nowMs)
  ) {
    return calculatePumpEventsRequest(period, null, nowMs);
  }

  const lookbackStartMs =
    fromMs - BASAL_CONTINUITY_LOOKBACK_MINUTES * MINUTE_MS;
  const rawRequestedMinutes = Math.ceil((nowMs - lookbackStartMs) / MINUTE_MS);
  const requestedMinutes = clamp(
    rawRequestedMinutes,
    API_MIN_MINUTES,
    API_MAX_MINUTES,
  );

  return {
    minutes: requestedMinutes,
    limit: Math.min(API_MAX_EVENTS, getLimitForMinutes(requestedMinutes)),
    isRangeLimited: requestedMinutes !== rawRequestedMinutes,
  };
}

function isPumpDeliveryHistory(event: PumpEventReading): boolean {
  return (
    event.event_type === "basal" ||
    event.event_type === "suspend" ||
    event.event_type === "resume"
  );
}

/** Retains the selected window plus the basal continuity lookback. */
export function filterPumpEventsForWindow(
  events: PumpEventReading[],
  window?: HistoryWindow | null,
): PumpEventReading[] {
  if (!window) {
    return events;
  }

  const fromMs = new Date(window.from).getTime();
  const toMs = new Date(window.to).getTime();
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs < fromMs) {
    return events;
  }

  const lookbackStartMs =
    fromMs - BASAL_CONTINUITY_LOOKBACK_MINUTES * MINUTE_MS;

  return events.filter((event) => {
    const eventMs = new Date(event.event_timestamp).getTime();
    return (
      Number.isFinite(eventMs) && eventMs >= lookbackStartMs && eventMs <= toMs
    );
  });
}

export interface UsePumpEventsReturn {
  events: PumpEventReading[];
  count: number;
  hasPumpHistory: boolean;
  isPossiblyTruncated: boolean;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function usePumpEvents(
  period: ChartTimePeriod,
  window?: HistoryWindow | null,
): UsePumpEventsReturn {
  const [events, setEvents] = useState<PumpEventReading[]>([]);
  const [count, setCount] = useState(0);
  const [hasPumpHistory, setHasPumpHistory] = useState(false);
  const [isPossiblyTruncated, setIsPossiblyTruncated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchGenRef = useRef(0);

  const fetchData = useCallback(async () => {
    const gen = ++fetchGenRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const { minutes, limit, isRangeLimited } = calculatePumpEventsRequest(
        period,
        window,
      );
      const data = await getPumpEventHistory(minutes, limit);
      if (gen === fetchGenRef.current) {
        const filteredEvents = filterPumpEventsForWindow(data.events, window);
        setEvents(filteredEvents);
        setCount(filteredEvents.length);
        setHasPumpHistory(data.events.some(isPumpDeliveryHistory));
        // TODO: Add real pagination or a date range API. The newest first 5,000
        // event cap cannot guarantee complete basal history for long ranges.
        setIsPossiblyTruncated(isRangeLimited || data.count >= limit);
      }
    } catch (err) {
      if (gen === fetchGenRef.current) {
        setError(
          err instanceof Error ? err.message : "Failed to load pump events",
        );
      }
    } finally {
      if (gen === fetchGenRef.current) {
        setIsLoading(false);
      }
    }
  }, [period, window]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    events,
    count,
    hasPumpHistory,
    isPossiblyTruncated,
    isLoading,
    error,
    refetch: fetchData,
  };
}
