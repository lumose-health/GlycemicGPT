import { insulinConfigSchema } from "./insulinConfig.schema";

describe("insulinConfigSchema", () => {
  it("coerces valid numeric fields and enforces safety bounds", () => {
    expect(
      insulinConfigSchema.parse({
        diaHours: "4",
        insulinType: "humalog",
        onsetMinutes: "15",
      }),
    ).toEqual({ diaHours: 4, insulinType: "humalog", onsetMinutes: 15 });
    expect(
      insulinConfigSchema.safeParse({
        diaHours: "99",
        insulinType: "humalog",
        onsetMinutes: "15",
      }).success,
    ).toBe(false);
  });
});
