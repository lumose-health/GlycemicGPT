import {
  dataRetentionSchema,
  dayBoundarySchema,
  displayLabelsSchema,
  purgeConfirmationSchema,
} from "./dataSettings.schema";

describe("data settings schemas", () => {
  it("validates retention, boundary, labels, and purge confirmation", () => {
    expect(
      dataRetentionSchema.safeParse({
        analysisDays: 365,
        auditDays: 730,
        glucoseDays: 365,
      }).success,
    ).toBe(true);
    expect(dayBoundarySchema.safeParse(24).success).toBe(false);
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
    expect(
      purgeConfirmationSchema.safeParse({ confirmation: "DELETE" }).success,
    ).toBe(true);
  });
});
