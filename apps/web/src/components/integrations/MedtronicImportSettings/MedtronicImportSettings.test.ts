import {
  createMedtronicImportRangeSchema,
  medtronicTokenSchema,
} from "./medtronicImportSettings.schema";

describe("Medtronic import validation", () => {
  const schema = createMedtronicImportRangeSchema({
    earliest: "2026-07-01",
    latest: "2026-07-31",
    maxDays: 31,
  });

  it("requires a pasted CareLink code", () => {
    expect(medtronicTokenSchema.safeParse(" ").success).toBe(false);
    expect(medtronicTokenSchema.parse(" token ")).toBe("token");
  });

  it("rejects reversed and out of availability date ranges", () => {
    expect(
      schema.safeParse({ start: "2026-07-20", end: "2026-07-10" }).success,
    ).toBe(false);
    expect(
      schema.safeParse({ start: "2026-06-30", end: "2026-07-02" }).success,
    ).toBe(false);
    expect(
      schema.safeParse({ start: "2026-07-30", end: "2026-08-01" }).success,
    ).toBe(false);
    expect(
      schema.safeParse({ start: "2026-02-31", end: "2026-03-01" }).success,
    ).toBe(false);
    expect(
      schema.safeParse({ start: "2026-07-01", end: "2026-07-31" }).success,
    ).toBe(true);
  });
});
