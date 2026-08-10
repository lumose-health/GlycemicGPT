"use client";
/**
 * TrendArrow Component
 *
 * Story 4.3: Trend Arrow Component
 * Reusable component that displays glucose trend direction as an arrow.
 * Can be used standalone or embedded in other components.
 */
import { twMerge } from "@/lib/ui/twMerge";
import { useReducedMotion } from"@/hooks/use-reduced-motion";
import type {
  TrendArrowProps,
  TrendArrowSize,
  TrendDirection,
} from "./TrendArrow.types";
/**
 * Trend direction enum matching CGM API values.
 *
 * These bucket thresholds are ALWAYS evaluated in mg/dL/min internally and are independent of the user's display unit — only
 * the displayed trend RATE relabels to mmol/L/min (see `formatTrendRate`).
 * - RisingFast: Glucose increasing > 3 mg/dL/min
 * - Rising: Glucose increasing 1-3 mg/dL/min
 * - Stable: Glucose change -1 to +1 mg/dL/min
 * - Falling: Glucose decreasing 1-3 mg/dL/min
 * - FallingFast: Glucose decreasing > 3 mg/dL/min
 * - Unknown: Trend data unavailable
 */
/** Arrow symbols for each trend direction */
export const TREND_ARROWS: Record<TrendDirection, string> = {
  RisingFast:"↑↑",
  Rising:"↗",
  Stable:"→",
  Falling:"↘",
  FallingFast:"↓↓",
  Unknown:"?",
};
/** Human-readable descriptions for screen readers */
export const TREND_DESCRIPTIONS: Record<TrendDirection, string> = {
  RisingFast:"rising fast",
  Rising:"rising",
  Stable:"stable",
  Falling:"falling",
  FallingFast:"falling fast",
  Unknown:"unknown trend",
};
/** Trend-based color classes (for when useTrendColor is true) */
const TREND_COLORS: Record<TrendDirection, string> = {
  RisingFast:"text-signal-error-text",
  Rising:"text-signal-warning-text",
  Stable:"text-signal-check-text",
  Falling:"text-signal-warning-text",
  FallingFast:"text-signal-error-text",
  Unknown:"text-foreground-secondary",
};
/** Size classes for different arrow sizes */
const SIZE_CLASSES: Record<TrendArrowSize, string> = {
  sm:"font_body_1",
  md:"font_header_3",
  lg:"font_header_1",
  xl:"font_header_1",
};
/** CSS animation classes for trend arrow bounce (keyframes in globals.css) */
const ARROW_ANIM_CLASS: Partial<Record<TrendDirection, string>> = {
  RisingFast:"animate-trend-bounce-up-fast",
  Rising:"animate-trend-bounce-up",
  Falling:"animate-trend-bounce-down",
  FallingFast:"animate-trend-bounce-down-fast",
};
/**
 * Get the arrow symbol for a given trend direction.
 */
export function getTrendArrow(direction: TrendDirection): string {
  return TREND_ARROWS[direction];
}
/**
 * Get the human-readable description for a trend direction.
 */
export function getTrendDescription(direction: TrendDirection): string {
  return TREND_DESCRIPTIONS[direction];
}
/**
 * Check if a trend direction indicates rising glucose.
 */
export function isRising(direction: TrendDirection): boolean {
  return direction ==="RisingFast" || direction ==="Rising";
}
/**
 * Check if a trend direction indicates falling glucose.
 */
export function isFalling(direction: TrendDirection): boolean {
  return direction ==="FallingFast" || direction ==="Falling";
}
/**
 * Check if a trend direction indicates rapid change (either direction).
 */
export function isRapidChange(direction: TrendDirection): boolean {
  return direction ==="RisingFast" || direction ==="FallingFast";
}
/**
 * Check if a trend direction indicates stable glucose.
 */
export function isStable(direction: TrendDirection): boolean {
  return direction ==="Stable";
}
/**
 * Check if a trend direction is unknown.
 */
export function isUnknown(direction: TrendDirection): boolean {
  return direction ==="Unknown";
}
export function TrendArrow({
  direction,
  size ="md",
  colorClass,
  useTrendColor = false,
  decorative = true,
  animated = false,
  className,
}: TrendArrowProps) {
  const prefersReducedMotion = useReducedMotion();
  const arrow = TREND_ARROWS[direction];
  const description = TREND_DESCRIPTIONS[direction];
  // Determine color class
  const color = colorClass ?? (useTrendColor ? TREND_COLORS[direction] :"");
  // Should we animate?
  const animClass = animated && !prefersReducedMotion ? ARROW_ANIM_CLASS[direction] : undefined;
  // Build common props
  const ariaProps = decorative
    ? {"aria-hidden":"true" as const }
    : { role:"img" as const,"aria-label": `Glucose trend: ${description}` };
  const commonProps = {"data-testid":"trend-arrow","data-direction": direction,
    ...ariaProps,
  };
  return (
    <span
      className={twMerge(SIZE_CLASSES[size], color, className, animClass &&"inline-block", animClass)}
      {...commonProps}
    >
      {arrow}
    </span>
  );
}
export default TrendArrow;
