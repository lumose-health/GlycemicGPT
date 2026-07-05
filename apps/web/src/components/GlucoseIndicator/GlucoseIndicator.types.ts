import type { CSSProperties } from "react";
import type { GlucoseUnit } from "@/lib/glucose-units";

export type GlucoseIndicatorSize = "sm" | "md" | "lg";

export type GlucoseIndicatorTrend =
  | "RisingFast"
  | "Rising"
  | "Stable"
  | "Falling"
  | "FallingFast"
  | "Unknown"
  | string;

export interface GlucoseIndicatorThresholds {
  urgentLow: number;
  low: number;
  high: number;
  urgentHigh: number;
}

export interface GlucoseIndicatorProps {
  value: number | null;
  trend: GlucoseIndicatorTrend;
  ariaLabel?: string;
  ariaLive?: "off" | "polite" | "assertive";
  className?: string;
  displayValue?: string;
  fitPlacement?: CSSProperties["placeItems"];
  fitToContainer?: boolean;
  showAge?: boolean;
  showUnit?: boolean;
  size?: GlucoseIndicatorSize;
  thresholds?: GlucoseIndicatorThresholds;
  timestamp?: string | null;
  unit?: GlucoseUnit;
}
