import type { FoodRecord } from "./api";

function grams(value: number): string {
  return String(Math.round(value));
}

export interface CarbRange {
  low: number;
  high: number;
  corrected: boolean;
}

export function effectiveCarbRange(record: FoodRecord): CarbRange {
  if (
    record.corrected_carbs_low != null &&
    record.corrected_carbs_high != null
  ) {
    return {
      low: record.corrected_carbs_low,
      high: record.corrected_carbs_high,
      corrected: true,
    };
  }

  return { low: record.carbs_low, high: record.carbs_high, corrected: false };
}

export function formatCarbRange(low: number, high: number): string {
  const lowLabel = grams(low);
  const highLabel = grams(high);
  return lowLabel === highLabel
    ? `≈ ${lowLabel} g carbs`
    : `≈ ${lowLabel}–${highLabel} g carbs`;
}

export function confidenceLabel(confidence: string | null): string {
  switch ((confidence ?? "").toLowerCase()) {
    case "low":
      return "Low confidence";
    case "medium":
      return "Medium confidence";
    case "high":
      return "High confidence";
    default:
      return "Confidence unavailable";
  }
}

export function formatCoefficientOfVariation(
  coefficient: number | null | undefined,
): string | null {
  if (coefficient == null || !Number.isFinite(coefficient)) return null;
  return `${Math.round(coefficient * 100)}%`;
}

export function mealTitle(record: FoodRecord): string {
  return (
    record.confirmed_food_name?.trim() ||
    record.food_description?.trim() ||
    "Unidentified meal"
  );
}

export function formatMacroValue(value: number, unit: string): string {
  return `${Math.round(value)} ${unit}`.trim();
}

export function formatNetCarbs(low: number, high: number): string {
  const lowLabel = grams(low);
  const highLabel = grams(high);
  return lowLabel === highLabel
    ? `≈ ${lowLabel} g`
    : `≈ ${lowLabel}–${highLabel} g`;
}

export const CARB_GRAMS_MIN = 0;
export const CARB_GRAMS_MAX = 1000;

export type CarbInputResult =
  | { ok: true; low: number; high: number }
  | { ok: false; reason: string };

export function validateCarbBounds(low: number, high: number): string | null {
  if (Number.isNaN(low) || Number.isNaN(high)) {
    return "Enter a number of carbs in grams.";
  }
  if (low < CARB_GRAMS_MIN || high < CARB_GRAMS_MIN) {
    return "Carbs can't be negative.";
  }
  if (low > CARB_GRAMS_MAX || high > CARB_GRAMS_MAX) {
    return `Carbs can't exceed ${CARB_GRAMS_MAX} g.`;
  }
  if (low > high) {
    return "The low value must not exceed the high value.";
  }
  return null;
}

export function parseCarbInputs(
  lowText: string,
  highText: string,
): CarbInputResult {
  const low = Number(lowText.trim());
  const high = Number(highText.trim());

  if (
    lowText.trim() === "" ||
    highText.trim() === "" ||
    Number.isNaN(low) ||
    Number.isNaN(high)
  ) {
    return { ok: false, reason: "Enter both carb values in grams." };
  }

  const reason = validateCarbBounds(low, high);
  if (reason) return { ok: false, reason };
  return { ok: true, low, high };
}

export function prefillIdentity(record: FoodRecord): string {
  return (
    record.suggested_identity?.trim() ||
    record.confirmed_food_name?.trim() ||
    record.food_description?.trim() ||
    ""
  );
}

export function isGrounded(record: FoodRecord): boolean {
  return record.identity_confirmed && Boolean(record.grounding_source?.trim());
}

export function isSafeHttpUrl(url: string | null | undefined): boolean {
  if (!url) return false;

  try {
    const { protocol } = new URL(url);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}
