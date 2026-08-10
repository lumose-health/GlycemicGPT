import type { FoodRecord } from "./api";
import {
  effectiveCarbRange,
  formatCarbRange,
  isSafeHttpUrl,
  parseCarbInputs,
} from "./meal-display";

const record = {
  carbs_low: 20,
  carbs_high: 30,
  corrected_carbs_low: null,
  corrected_carbs_high: null,
} as FoodRecord;

describe("meal display helpers", () => {
  it("preserves the effective carbohydrate range contract", () => {
    expect(effectiveCarbRange(record)).toEqual({
      corrected: false,
      high: 30,
      low: 20,
    });
    expect(formatCarbRange(20, 30)).toBe("≈ 20–30 g carbs");
  });

  it("validates carbohydrate input before requests", () => {
    expect(parseCarbInputs("20", "30")).toEqual({ ok: true, low: 20, high: 30 });
    expect(parseCarbInputs("", "30")).toEqual({
      ok: false,
      reason: "Enter both carb values in grams.",
    });
  });

  it("accepts only http and https links", () => {
    expect(isSafeHttpUrl("https://example.com")).toBe(true);
    expect(isSafeHttpUrl("javascript:alert(1)")).toBe(false);
  });
});
