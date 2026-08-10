export const GLUCOSE_THRESHOLDS = {
  URGENT_LOW: 55,
  LOW: 70,
  HIGH: 180,
  URGENT_HIGH: 250,
} as const;

export interface GlucoseThresholds {
  urgentLow: number;
  low: number;
  high: number;
  urgentHigh: number;
}

export type GlucoseRange =
  "urgentLow" | "low" | "inRange" | "high" | "urgentHigh";

export const DEFAULT_GLUCOSE_THRESHOLDS = {
  urgentLow: GLUCOSE_THRESHOLDS.URGENT_LOW,
  low: GLUCOSE_THRESHOLDS.LOW,
  high: GLUCOSE_THRESHOLDS.HIGH,
  urgentHigh: GLUCOSE_THRESHOLDS.URGENT_HIGH,
} as const satisfies GlucoseThresholds;

export const GLUCOSE_VALID_RANGE_MGDL = {
  min: 20,
  max: 500,
} as const;

export function classifyGlucose(
  value: number | null,
  thresholds: GlucoseThresholds = DEFAULT_GLUCOSE_THRESHOLDS,
): GlucoseRange {
  if (value === null || !Number.isFinite(value)) return "inRange";
  if (value < thresholds.urgentLow) return "urgentLow";
  if (value < thresholds.low) return "low";
  if (value <= thresholds.high) return "inRange";
  if (value <= thresholds.urgentHigh) return "high";
  return "urgentHigh";
}

export function isValidGlucoseMgdl(value: number): boolean {
  return (
    Number.isFinite(value) &&
    value >= GLUCOSE_VALID_RANGE_MGDL.min &&
    value <= GLUCOSE_VALID_RANGE_MGDL.max
  );
}

export function clampGlucoseMgdl(value: number): number {
  return Math.max(
    GLUCOSE_VALID_RANGE_MGDL.min,
    Math.min(GLUCOSE_VALID_RANGE_MGDL.max, value),
  );
}
