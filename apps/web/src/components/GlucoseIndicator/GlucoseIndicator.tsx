"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { Icon } from "@/base/Icon";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { formatGlucose, unitLabel } from "@/lib/glucose-units";
import {
  classifyGlucose,
  isValidGlucoseMgdl,
  type GlucoseRange,
} from "@/lib/glucose-classification";
import { twMerge } from "@/lib/ui/twMerge";
import type {
  GlucoseIndicatorProps,
  GlucoseIndicatorTrend,
} from "./GlucoseIndicator.types";

type TrendDirection =
  | "up"
  | "up-slight"
  | "stable"
  | "down-slight"
  | "down"
  | "unknown";

type FitContainerStyles = CSSProperties & {
  "--glucose-indicator-size": string;
  "--glucose-indicator-value-font-size": string;
  "--glucose-indicator-gap": string;
  "--glucose-indicator-unit-font-size": string;
};

const STALE_MS = 15 * 60 * 1000;

const SIZE_CONFIG = {
  sm: {
    outer: 112,
    fontSize: 20,
    unitClassName: "font_metric_caption",
    ageClassName: "font_metric_caption",
  },
  md: {
    outer: 146,
    fontSize: 28,
    unitClassName: "font_metric_caption",
    ageClassName: "font_metric_caption",
  },
  lg: {
    outer: 184,
    fontSize: 40,
    unitClassName: "font_metric_label",
    ageClassName: "font_metric_caption",
  },
} as const;

const RANGE_STYLE: Record<GlucoseRange, { color: string; pulse: "subtle" | "strong" | null }> = {
  urgentLow: { color: "text-signal-error-fill", pulse: "strong" },
  low: { color: "text-signal-warning-fill", pulse: "subtle" },
  inRange: { color: "text-signal-check-fill", pulse: null },
  high: { color: "text-signal-warning-fill", pulse: "subtle" },
  urgentHigh: { color: "text-signal-error-fill", pulse: "strong" },
};

const FIT_CONTAINER_STYLES: FitContainerStyles = {
  "--glucose-indicator-size":
    "clamp(4rem, min(72cqw, calc((100cqh - 1.35rem) * 0.84)), 40rem)",
  "--glucose-indicator-value-font-size":
    "clamp(1.1rem, min(15cqw, 16cqh), 10rem)",
  "--glucose-indicator-gap": "clamp(0.35rem, 2.5cqh, 1.5rem)",
  "--glucose-indicator-unit-font-size":
    "clamp(0.58rem, min(4.8cqw, 4.8cqh), 1.8rem)",
  containerType: "size",
  display: "grid",
  height: "100%",
  minHeight: 0,
  minWidth: 0,
  overflow: "hidden",
  placeItems: "center",
  width: "100%",
};

const FIT_CONTAINER_COMPACT_LABEL_STYLES = {
  "--glucose-indicator-size": "clamp(4rem, min(92cqw, 92cqh), 40rem)",
  "--glucose-indicator-value-font-size":
    "clamp(1.1rem, min(18cqw, 19cqh), 10rem)",
} satisfies Pick<
  FitContainerStyles,
  "--glucose-indicator-size" | "--glucose-indicator-value-font-size"
>;

const TREND_ROTATION: Record<TrendDirection, number> = {
  up: -90,
  "up-slight": -45,
  stable: 0,
  "down-slight": 45,
  down: 90,
  unknown: 0,
};

const CIRCLE_CENTER_X = 76 / 184;
const CIRCLE_CENTER_Y = 76 / 153;

function normalizeTrend(trend: GlucoseIndicatorTrend): TrendDirection {
  const normalized = trend.toLowerCase().replace(/[^a-z]/g, "");
  if (normalized === "unknown" || normalized === "notcomputable") {
    return "unknown";
  }
  if (
    normalized.includes("risingfast") ||
    normalized.includes("doubleup") ||
    normalized === "risingquickly"
  ) {
    return "up";
  }
  if (
    normalized.includes("rising") ||
    normalized.includes("singleup") ||
    normalized === "up" ||
    normalized === "fortyfiveup"
  ) {
    return "up-slight";
  }
  if (
    normalized.includes("fallingfast") ||
    normalized.includes("doubledown") ||
    normalized === "fallingquickly"
  ) {
    return "down";
  }
  if (
    normalized.includes("falling") ||
    normalized.includes("singledown") ||
    normalized === "down" ||
    normalized === "fortyfivedown"
  ) {
    return "down-slight";
  }
  return normalized === "stable" || normalized === "flat"
    ? "stable"
    : "unknown";
}

function formatAge(timestamp: string, nowMs: number): string | null {
  const timestampMs = new Date(timestamp).getTime();
  if (Number.isNaN(timestampMs)) return null;
  const ageMs = Math.max(0, nowMs - timestampMs);
  const minutes = Math.round(ageMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes === 1) return "1m ago";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes === 0
    ? `${hours}h ago`
    : `${hours}h ${remainingMinutes}m ago`;
}

function isReadingStale(timestamp: string | null | undefined, nowMs: number) {
  if (!timestamp) return false;
  const timestampMs = new Date(timestamp).getTime();
  if (Number.isNaN(timestampMs)) return false;
  return nowMs - timestampMs > STALE_MS;
}

export function GlucoseIndicator({
  ariaLabel,
  ariaLive = "polite",
  className,
  displayValue,
  fitPlacement = "center",
  fitToContainer = false,
  isDelayed = false,
  isStale = false,
  showAge = true,
  showUnit = true,
  size = "lg",
  thresholds,
  timestamp,
  trend,
  unit = "mgdl",
  value,
}: GlucoseIndicatorProps) {
  const prefersReducedMotion = useReducedMotion();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const safeValue = isValidGlucoseMgdl(value) ? value : null;
  const stale = isReadingStale(timestamp, nowMs);
  const range = classifyGlucose(safeValue, thresholds);
  const rangeStyle = RANGE_STYLE[range];
  const isUntrusted = isDelayed || isStale;
  const colorClass = isUntrusted
    ? "text-foreground-primary"
    : stale
      ? "text-foreground-secondary"
      : rangeStyle.color;
  const pulseClass =
    !isUntrusted &&
    !stale &&
    !prefersReducedMotion &&
    rangeStyle.pulse === "strong"
      ? "animate-glucose-pulse-strong"
      : !isUntrusted &&
          !stale &&
          !prefersReducedMotion &&
          rangeStyle.pulse === "subtle"
        ? "animate-glucose-pulse-subtle"
        : undefined;
  const cfg = SIZE_CONFIG[size];
  const direction = normalizeTrend(trend);
  const unknownTrend = safeValue !== null && direction === "unknown";
  const rotation = TREND_ROTATION[direction];
  const indicatorSize = fitToContainer
    ? "var(--glucose-indicator-size)"
    : cfg.outer;
  const indicatorFontSize = fitToContainer
    ? "var(--glucose-indicator-value-font-size)"
    : cfg.fontSize;
  const fitContainerStyles =
    fitToContainer && !showUnit && !showAge
      ? {
          ...FIT_CONTAINER_STYLES,
          ...FIT_CONTAINER_COMPACT_LABEL_STYLES,
        }
      : FIT_CONTAINER_STYLES;
  const renderedValue =
    stale || safeValue === null
      ? "--"
      : displayValue ?? formatGlucose(safeValue, unit);
  const ageLabel = timestamp ? formatAge(timestamp, nowMs) : null;

  useEffect(() => {
    if (!timestamp) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [timestamp]);

  return (
    <div
      className={twMerge("inline-flex flex-col items-center gap-2", className)}
      data-freshness={isStale ? "stale" : isDelayed ? "delayed" : "current"}
      data-testid="glucose-indicator"
      style={
        fitToContainer
          ? {
              ...fitContainerStyles,
              placeItems: fitPlacement,
            }
          : undefined
      }
    >
      <div
        className="inline-flex max-h-full max-w-full min-w-0 flex-col items-center"
        style={{
          gap: fitToContainer ? "var(--glucose-indicator-gap)" : 10,
        }}
      >
        <div
          className={twMerge("relative max-h-full max-w-full", pulseClass)}
          style={{
            height: indicatorSize,
            width: indicatorSize,
          }}
        >
          <Icon
            className={twMerge(
              "block h-full w-full transition-transform duration-300",
              colorClass,
            )}
            data-testid="glucose-indicator-shape"
            decorative
            icon="glucose"
            style={{
              opacity: stale ? 0.45 : unknownTrend ? 0.55 : 1,
              transform: `rotate(${rotation}deg)`,
              transformOrigin: `${CIRCLE_CENTER_X * 100}% ${CIRCLE_CENTER_Y * 100}%`,
            }}
          />
          {unknownTrend && !stale ? (
            <>
              <span className="sr-only">Trend unavailable</span>
              <span
                aria-hidden="true"
                className="font_metric_caption absolute right-1 top-1 rounded-pill border border-border-default bg-surface-primary px-1 text-foreground-primary"
                data-testid="glucose-indicator-unknown-trend"
              >
                ?
              </span>
            </>
          ) : null}
          <span
            aria-label={ariaLabel}
            aria-live={ariaLive}
            className={twMerge(
              "font_ui_mono_value absolute whitespace-nowrap",
              "text-foreground-primary",
            )}
            data-testid="glucose-indicator-value"
            style={{
              fontSize: indicatorFontSize,
              left: `${CIRCLE_CENTER_X * 100}%`,
              top: `${CIRCLE_CENTER_Y * 100}%`,
              transform: "translate(-50%, -50%)",
            }}
          >
            {renderedValue}
          </span>
        </div>
        {showUnit ? (
          <span
            className={twMerge(cfg.unitClassName, "text-foreground-secondary")}
            data-testid="glucose-indicator-unit"
            style={
              fitToContainer
                ? {
                    fontSize: "var(--glucose-indicator-unit-font-size)",
                    lineHeight: 1,
                  }
                : undefined
            }
          >
            {unitLabel(unit)}
          </span>
        ) : null}
        {showAge && timestamp && ageLabel ? (
          <span
            className={twMerge(cfg.ageClassName, "text-foreground-secondary")}
            data-testid="glucose-indicator-age"
          >
            {ageLabel}
          </span>
        ) : null}
      </div>
    </div>
  );
}
