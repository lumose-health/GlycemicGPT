import { getMealSourceLabel } from "./meal-source";

describe("getMealSourceLabel", () => {
  it.each([
    ["ai_estimate", "AI estimate"],
    ["external_grounded", "Grounded"],
    ["user_corrected", "You corrected this"],
    ["unknown", "unknown"],
  ])("maps %s to %s", (source, expected) => {
    expect(getMealSourceLabel(source)).toBe(expected);
  });
});
