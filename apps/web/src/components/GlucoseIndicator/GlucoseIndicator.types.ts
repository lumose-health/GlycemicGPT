import type { CSSProperties } from "react";
import type { GlucoseUnit } from "@/lib/glucose-units";
import type { GlucoseThresholds } from "@/lib/glucose-classification";

export type GlucoseIndicatorSize = "sm" | "md" | "lg";

export type GlucoseIndicatorTrend =
  | "RisingFast"
  | "Rising"
  | "Stable"
  | "Falling"
  | "FallingFast"
  | "Unknown"
  | string;

export type GlucoseIndicatorThresholds = GlucoseThresholds;

export interface GlucoseIndicatorProps {
  value: number | null;
  trend: GlucoseIndicatorTrend;
  ariaLabel?: string;
  ariaLive?: "off" | "polite" | "assertive";
  className?: string;
  displayValue?: string;
  fitPlacement?: CSSProperties["placeItems"];
  fitToContainer?: boolean;
  isDelayed?: boolean;
  isStale?: boolean;
  showAge?: boolean;
  showUnit?: boolean;
  size?: GlucoseIndicatorSize;
  thresholds?: GlucoseIndicatorThresholds;
  timestamp?: string | null;
  unit?: GlucoseUnit;
}
