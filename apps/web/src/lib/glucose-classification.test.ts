import {
  DEFAULT_GLUCOSE_THRESHOLDS,
  GLUCOSE_THRESHOLDS,
  GLUCOSE_VALID_RANGE_MGDL,
  clampGlucoseMgdl,
  classifyGlucose,
  isValidGlucoseMgdl,
  normalizeGlucoseThresholds,
} from "./glucose-classification";

describe("glucose classification", () => {
  it("owns the default glucose bands in mg/dL", () => {
    expect(DEFAULT_GLUCOSE_THRESHOLDS).toEqual({
      urgentLow: 55,
      low: 70,
      high: 180,
      urgentHigh: 250,
    });
    expect(GLUCOSE_THRESHOLDS).toEqual({
      URGENT_LOW: 55,
      LOW: 70,
      HIGH: 180,
      URGENT_HIGH: 250,
    });
  });

  it.each([
    [54, "urgentLow"],
    [55, "low"],
    [69, "low"],
    [70, "inRange"],
    [180, "inRange"],
    [181, "high"],
    [250, "high"],
    [251, "urgentHigh"],
  ] as const)("classifies %d mg/dL as %s", (value, expected) => {
    expect(classifyGlucose(value)).toBe(expected);
  });

  it("supports patient specific thresholds", () => {
    const thresholds = {
      urgentLow: 60,
      low: 80,
      high: 160,
      urgentHigh: 220,
    };

    expect(classifyGlucose(70, thresholds)).toBe("low");
    expect(classifyGlucose(170, thresholds)).toBe("high");
  });

  it("treats absent and invalid readings as the neutral range", () => {
    expect(classifyGlucose(null)).toBe("inRange");
    expect(classifyGlucose(Number.NaN)).toBe("inRange");
    expect(classifyGlucose(Number.POSITIVE_INFINITY)).toBe("inRange");
    expect(classifyGlucose(19)).toBe("inRange");
    expect(classifyGlucose(501)).toBe("inRange");
  });

  it.each([
    {
      urgentLow: Number.NaN,
      low: 70,
      high: 180,
      urgentHigh: 250,
    },
    { urgentLow: 19, low: 70, high: 180, urgentHigh: 250 },
    { urgentLow: 55, low: 181, high: 180, urgentHigh: 250 },
    { urgentLow: 55, low: 70, high: 180, urgentHigh: 501 },
  ])("falls back for invalid threshold configuration", (thresholds) => {
    expect(normalizeGlucoseThresholds(thresholds)).toBe(
      DEFAULT_GLUCOSE_THRESHOLDS,
    );
    expect(classifyGlucose(60, thresholds)).toBe("low");
  });

  it("preserves valid ordered thresholds at the canonical boundaries", () => {
    const thresholds = { urgentLow: 20, low: 20, high: 500, urgentHigh: 500 };

    expect(normalizeGlucoseThresholds(thresholds)).toBe(thresholds);
  });
});

describe("glucose validity range", () => {
  it("owns the inclusive 20 through 500 mg/dL range", () => {
    expect(GLUCOSE_VALID_RANGE_MGDL).toEqual({ min: 20, max: 500 });
    expect(isValidGlucoseMgdl(20)).toBe(true);
    expect(isValidGlucoseMgdl(500)).toBe(true);
    expect(isValidGlucoseMgdl(19)).toBe(false);
    expect(isValidGlucoseMgdl(501)).toBe(false);
    expect(isValidGlucoseMgdl(Number.NaN)).toBe(false);
  });

  it("clamps values to the shared validity range", () => {
    expect(clampGlucoseMgdl(19)).toBe(20);
    expect(clampGlucoseMgdl(120)).toBe(120);
    expect(clampGlucoseMgdl(501)).toBe(500);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects non-finite clamp input %s",
    (value) => {
      expect(() => clampGlucoseMgdl(value)).toThrow(
        new RangeError("Glucose value must be finite"),
      );
    },
  );
});
