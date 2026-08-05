import { createSafetyLimitsSchema } from "./safetyLimits.schema";

describe("safety limits validation", () => {
  const mgdlSchema = createSafetyLimitsSchema({
    allowGlucoseDecimals: false,
    maxGlucoseBound: { max: 400, min: 120 },
    minGlucoseBound: { max: 100, min: 40 },
  });

  it("requires ordered whole number mg/dL limits and positive dose limits", () => {
    expect(
      mgdlSchema.safeParse({
        minGlucose: "55",
        maxGlucose: "250",
        maxBasal: "5",
        maxBolus: "12",
      }).success,
    ).toBe(true);
    expect(
      mgdlSchema.safeParse({
        minGlucose: "55.5",
        maxGlucose: "250",
        maxBasal: "5",
        maxBolus: "12",
      }).success,
    ).toBe(false);
    expect(
      mgdlSchema.safeParse({
        minGlucose: "90",
        maxGlucose: "80",
        maxBasal: "5",
        maxBolus: "12",
      }).success,
    ).toBe(false);

    for (const maxBasal of ["0", "-1"]) {
      expect(
        mgdlSchema.safeParse({
          minGlucose: "55",
          maxGlucose: "250",
          maxBasal,
          maxBolus: "12",
        }).success,
      ).toBe(false);
    }

    for (const maxBolus of ["0", "-1"]) {
      expect(
        mgdlSchema.safeParse({
          minGlucose: "55",
          maxGlucose: "250",
          maxBasal: "5",
          maxBolus,
        }).success,
      ).toBe(false);
    }
  });
});
