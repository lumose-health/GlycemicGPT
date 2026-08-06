import {
  dataRetentionSchema,
  dayBoundarySchema,
  displayLabelsSchema,
  purgeConfirmationSchema,
} from "./dataSettings.schema";

describe("data settings schemas", () => {
  it("validates retention and display labels", () => {
    expect(
      dataRetentionSchema.safeParse({
        analysisDays: 365,
        auditDays: 730,
        glucoseDays: 365,
      }).success,
    ).toBe(true);
    expect(
      displayLabelsSchema.safeParse([
        {
          computation_role: null,
          id: "manual",
          label: "",
          pump_source: null,
          sort_order: 0,
        },
      ]).success,
    ).toBe(false);
  });

  it("accepts only exact DELETE purge confirmation", () => {
    expect(
      purgeConfirmationSchema.safeParse({ confirmation: "DELETE" }).success,
    ).toBe(true);
    for (const confirmation of ["delete", "DELETE ", ""]) {
      expect(purgeConfirmationSchema.safeParse({ confirmation }).success).toBe(
        false,
      );
    }
  });

  it("accepts only day boundary hours from 0 through 23", () => {
    expect(dayBoundarySchema.safeParse(0).success).toBe(true);
    expect(dayBoundarySchema.safeParse(23).success).toBe(true);
    expect(dayBoundarySchema.safeParse(-1).success).toBe(false);
    expect(dayBoundarySchema.safeParse(24).success).toBe(false);
  });
});
