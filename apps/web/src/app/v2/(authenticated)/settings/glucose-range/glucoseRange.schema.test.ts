import { createGlucoseRangeSchema } from "./glucoseRange.schema";

describe("glucose range validation", () => {
  const schema = createGlucoseRangeSchema({
    highTarget: { max: 250, min: 90 },
    lowTarget: { max: 180, min: 60 },
    urgentHigh: { max: 400, min: 120 },
    urgentLow: { max: 100, min: 40 },
  });

  it("requires ordered thresholds within their display bounds", () => {
    expect(
      schema.safeParse({
        urgentLow: "55",
        lowTarget: "70",
        highTarget: "180",
        urgentHigh: "250",
      }).success,
    ).toBe(true);
    expect(
      schema.safeParse({
        urgentLow: "80",
        lowTarget: "70",
        highTarget: "180",
        urgentHigh: "250",
      }).success,
    ).toBe(false);
  });
});
