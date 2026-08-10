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

/** Return whether a glucose value is finite and inside the canonical mg/dL domain. */
export function isValidGlucoseMgdl(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= GLUCOSE_VALID_RANGE_MGDL.min &&
    value <= GLUCOSE_VALID_RANGE_MGDL.max
  );
}

/**
 * Accept only finite, ordered thresholds in the canonical mg/dL domain.
 * Invalid external configuration falls back to the shared clinical defaults.
 */
export function normalizeGlucoseThresholds(
  thresholds?: GlucoseThresholds | null,
): GlucoseThresholds {
  if (
    thresholds &&
    isValidGlucoseMgdl(thresholds.urgentLow) &&
    isValidGlucoseMgdl(thresholds.low) &&
    isValidGlucoseMgdl(thresholds.high) &&
    isValidGlucoseMgdl(thresholds.urgentHigh) &&
    thresholds.urgentLow <= thresholds.low &&
    thresholds.low <= thresholds.high &&
    thresholds.high <= thresholds.urgentHigh
  ) {
    return thresholds;
  }

  return DEFAULT_GLUCOSE_THRESHOLDS;
}

/** Classify a valid canonical mg/dL reading into the configured glucose bands. */
export function classifyGlucose(
  value: number | null,
  thresholds: GlucoseThresholds = DEFAULT_GLUCOSE_THRESHOLDS,
): GlucoseRange {
  if (value === null || !isValidGlucoseMgdl(value)) return "inRange";
  const normalizedThresholds = normalizeGlucoseThresholds(thresholds);
  if (value < normalizedThresholds.urgentLow) return "urgentLow";
  if (value < normalizedThresholds.low) return "low";
  if (value <= normalizedThresholds.high) return "inRange";
  if (value <= normalizedThresholds.urgentHigh) return "high";
  return "urgentHigh";
}

/** Clamp a finite glucose value to the canonical mg/dL domain. */
export function clampGlucoseMgdl(value: number): number {
  if (!Number.isFinite(value)) {
    throw new RangeError("Glucose value must be finite");
  }
  return Math.max(
    GLUCOSE_VALID_RANGE_MGDL.min,
    Math.min(GLUCOSE_VALID_RANGE_MGDL.max, value),
  );
}
