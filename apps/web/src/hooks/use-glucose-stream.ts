"use client";

/**
 * useGlucoseStream Hook
 *
 * Story 4.5: Real-Time Updates via SSE
 * Custom hook for consuming Server-Sent Events from the glucose stream endpoint.
 * Implements exponential backoff reconnection and connection state tracking.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { getApiBaseUrl } from "@/lib/api";
import type { Schemas } from "@/lib/wire-types";

/** Backend trend direction values, as published on `SseGlucosePayload.trend`. */
export type BackendTrendDirection = Schemas["SseGlucosePayload"]["trend"];

/**
 * Frontend trend direction (UI format).
 * These are the values used by TrendArrow and GlucoseHero components.
 */
export type FrontendTrendDirection =
  | "RisingFast"
  | "Rising"
  | "Stable"
  | "Falling"
  | "FallingFast"
  | "Unknown";

/**
 * Maps backend Dexcom-style trend names to frontend UI trend names.
 * Issue 2 & 3 fix: Proper trend direction mapping.
 */
export function mapBackendTrendToFrontend(
  trend: BackendTrendDirection | string
): FrontendTrendDirection {
  const mapping: Record<string, FrontendTrendDirection> = {
    double_up: "RisingFast",
    single_up: "Rising",
    forty_five_up: "Rising",
    flat: "Stable",
    forty_five_down: "Falling",
    single_down: "Falling",
    double_down: "FallingFast",
    not_computable: "Unknown",
    rate_out_of_range: "Unknown",
    Unknown: "Unknown",
  };
  return mapping[trend] ?? "Unknown";
}

/** Raw glucose data received from SSE (the `glucose` event on `/api/v1/glucose/stream`) */
type RawGlucoseData = Schemas["SseGlucosePayload"];

/**
 * Alert event data received from SSE (the `alert` event on
 * `/api/v1/glucose/stream`, Story 6.3).
 *  - `severity` is narrowed to the values the backend actually emits -- the
 *    wire schema publishes it as a free-form string, not an enum, so this
 *    narrowing is a frontend convention the generated type can't enforce.
 *  - `event` (the SSE discriminator) stays required, matching the generated
 *    shape: the docs on SseGlucoseAlertPayload call it "redundant for a
 *    hand-written client that reads the `event:` line", but this hook still
 *    receives it on every real payload, and the type should say so.
 */
export type AlertEventData = Omit<
  Schemas["SseGlucoseAlertPayload"],
  "severity"
> & {
  severity: "info" | "warning" | "urgent" | "emergency";
};

/** Options for the useGlucoseStream hook */
export interface GlucoseStreamOptions {
  /** Callback fired when a new alert event is received via SSE */
  onAlertReceived?: (alert: AlertEventData) => void;
}

/** Glucose data with frontend-friendly trend (used by components) */
export interface GlucoseData {
  /** Current glucose value in mg/dL */
  value: number;
  /** Trend direction (frontend format for UI components) */
  trend: FrontendTrendDirection;
  /** Original backend trend direction */
  rawTrend: BackendTrendDirection;
  /** Rate of change in mg/dL/min (optional) */
  trend_rate: number | null;
  /** ISO timestamp of the reading */
  reading_timestamp: string;
  /** Minutes since the reading was taken */
  minutes_ago: number;
  /** Whether the reading is stale (>10 minutes old) */
  is_stale: boolean;
  /** Insulin on board data (if available) */
  iob: Schemas["SseIobPayload"] | null;
  /** ISO timestamp of when this event was sent */
  timestamp: string;
}

/** Connection state for the SSE stream */
export type ConnectionState = "connecting" | "connected" | "reconnecting" | "error" | "closed";

/** State returned by the useGlucoseStream hook */
export interface GlucoseStreamState {
  /** Current glucose data (null if not yet received) */
  data: GlucoseData | null;
  /** Current connection state */
  connectionState: ConnectionState;
  /** Whether the stream is connected and receiving data */
  isConnected: boolean;
  /** Whether the stream is attempting to reconnect */
  isReconnecting: boolean;
  /** Last error that occurred (if any) */
  error: Error | null;
  /** Timestamp of the last successful data update */
  lastUpdated: Date | null;
  /** Manually reconnect the stream */
  reconnect: () => void;
  /** Manually disconnect the stream */
  disconnect: () => void;
}

/** Physiological glucose bounds (mg/dL) for input validation */
const GLUCOSE_MIN = 20;
const GLUCOSE_MAX = 500;

/** Reconnection configuration */
const RECONNECT_CONFIG = {
  /** Initial delay before first reconnect attempt (ms) */
  initialDelay: 1000,
  /** Maximum delay between reconnect attempts (ms) */
  maxDelay: 30000,
  /** Multiplier for exponential backoff */
  backoffMultiplier: 2,
  /** Maximum number of reconnect attempts before giving up */
  maxAttempts: 10,
};

/**
 * Transform raw backend glucose data to frontend-friendly format.
 * Returns null if the glucose value is outside physiological bounds (20-500 mg/dL).
 */
function transformGlucoseData(raw: RawGlucoseData): GlucoseData | null {
  if (raw.value < GLUCOSE_MIN || raw.value > GLUCOSE_MAX) {
    return null;
  }
  return {
    ...raw,
    trend: mapBackendTrendToFrontend(raw.trend),
    rawTrend: raw.trend,
  };
}

/**
 * Custom hook for consuming glucose data via Server-Sent Events.
 *
 * @param enabled - Whether the SSE connection should be active (default: true)
 * @returns GlucoseStreamState with data, connection state, and control functions
 */
export function useGlucoseStream(
  enabled: boolean = true,
  options?: GlucoseStreamOptions,
): GlucoseStreamState {
  const [data, setData] = useState<GlucoseData | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("closed");
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Refs for managing reconnection
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptRef = useRef(0);
  const isMountedRef = useRef(true);

  // Ref for alert callback to avoid reconnection on callback change
  const onAlertReceivedRef = useRef(options?.onAlertReceived);
  useEffect(() => {
    onAlertReceivedRef.current = options?.onAlertReceived;
  }, [options?.onAlertReceived]);

  /**
   * Calculate the delay for the next reconnect attempt using exponential backoff.
   */
  const getReconnectDelay = useCallback((): number => {
    const delay = Math.min(
      RECONNECT_CONFIG.initialDelay *
        Math.pow(RECONNECT_CONFIG.backoffMultiplier, reconnectAttemptRef.current),
      RECONNECT_CONFIG.maxDelay
    );
    return delay;
  }, []);

  /**
   * Clean up resources (event source, timeouts).
   */
  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  /**
   * Connect to the SSE endpoint.
   */
  const connect = useCallback(() => {
    if (!isMountedRef.current) return;

    // Clean up any existing connection
    cleanup();

    setConnectionState("connecting");
    setError(null);

    try {
      // Same-origin request via Next.js rewrite proxy (see next.config.ts)
      const sseEndpoint = `${getApiBaseUrl()}/api/v1/glucose/stream`;
      const eventSource = new EventSource(sseEndpoint);

      eventSource.onopen = () => {
        if (!isMountedRef.current) return;
        setConnectionState("connected");
        setError(null);
        reconnectAttemptRef.current = 0; // Reset on successful connection
      };

      eventSource.addEventListener("glucose", (event: MessageEvent) => {
        if (!isMountedRef.current) return;
        try {
          const rawData: RawGlucoseData = JSON.parse(event.data);
          const glucoseData = transformGlucoseData(rawData);
          if (glucoseData) {
            setData(glucoseData);
            setLastUpdated(new Date());
          }
          setConnectionState("connected");
        } catch {
          // Issue 8 fix: Remove console.log, silently handle parse errors
          // Parse errors for glucose events are non-fatal
        }
      });

      eventSource.addEventListener("heartbeat", () => {
        if (!isMountedRef.current) return;
        // Heartbeat received - connection is alive
        setConnectionState("connected");
      });

      eventSource.addEventListener("no_data", () => {
        if (!isMountedRef.current) return;
        // Issue 8 fix: Remove console.log for no_data events
        // No action needed - UI will show "no data" state
      });

      // Story 6.3: Listen for alert events
      eventSource.addEventListener("alert", (event: MessageEvent) => {
        if (!isMountedRef.current) return;
        try {
          const alertData: AlertEventData = JSON.parse(event.data);
          onAlertReceivedRef.current?.(alertData);
        } catch {
          // Silently handle parse errors for alert events
        }
      });

      eventSource.addEventListener("error", () => {
        if (!isMountedRef.current) return;
        // Issue 8 fix: Remove console.error for SSE error events
        // These are handled by the onerror handler
      });

      eventSource.onerror = () => {
        if (!isMountedRef.current) return;

        // Close the current connection
        eventSource.close();
        eventSourceRef.current = null;

        // Check if we should attempt to reconnect
        if (reconnectAttemptRef.current < RECONNECT_CONFIG.maxAttempts) {
          setConnectionState("reconnecting");
          const delay = getReconnectDelay();
          reconnectAttemptRef.current += 1;

          // Issue 8 fix: Remove console.log for reconnection attempts
          // The UI shows reconnection state via ConnectionStatusBanner

          reconnectTimeoutRef.current = setTimeout(() => {
            if (isMountedRef.current) {
              connect();
            }
          }, delay);
        } else {
          // Max attempts reached
          setConnectionState("error");
          setError(new Error("Failed to connect to glucose stream after maximum retry attempts"));
        }
      };

      eventSourceRef.current = eventSource;
    } catch (err) {
      setConnectionState("error");
      setError(err instanceof Error ? err : new Error("Failed to create EventSource"));
    }
  }, [cleanup, getReconnectDelay]);

  /**
   * Manually trigger a reconnection.
   */
  const reconnect = useCallback(() => {
    reconnectAttemptRef.current = 0; // Reset attempt counter
    connect();
  }, [connect]);

  /**
   * Manually disconnect the stream.
   */
  const disconnect = useCallback(() => {
    cleanup();
    setConnectionState("closed");
  }, [cleanup]);

  // Effect to manage connection lifecycle
  useEffect(() => {
    isMountedRef.current = true;

    if (enabled) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      isMountedRef.current = false;
      cleanup();
    };
  }, [enabled, connect, disconnect, cleanup]);

  return {
    data,
    connectionState,
    isConnected: connectionState === "connected",
    isReconnecting: connectionState === "reconnecting",
    error,
    lastUpdated,
    reconnect,
    disconnect,
  };
}

export default useGlucoseStream;
