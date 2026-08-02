import { createAlertSettingsSchema } from "./alertSettings.schema";

describe("alert settings validation", () => {
  const schema = createAlertSettingsSchema({
    highWarning: { max: 350, min: 100 },
    lowWarning: { max: 150, min: 50 },
    urgentHigh: { max: 400, min: 120 },
    urgentLow: { max: 100, min: 40 },
  });

  it("requires ordered glucose thresholds and escalation delays", () => {
    expect(
      schema.safeParse({
        allContactsDelay: "30",
        highWarning: "180",
        iobWarning: "3",
        lowWarning: "70",
        primaryDelay: "15",
        reminderDelay: "5",
        urgentHigh: "250",
        urgentLow: "55",
      }).success,
    ).toBe(true);
    expect(
      schema.safeParse({
        allContactsDelay: "10",
        highWarning: "250",
        iobWarning: "3",
        lowWarning: "55",
        primaryDelay: "10",
        reminderDelay: "10",
        urgentHigh: "180",
        urgentLow: "70",
      }).success,
    ).toBe(false);
  });
});
