import { emergencyContactSchema } from "./emergencyContact.schema";

describe("emergencyContactSchema", () => {
  it("accepts Telegram usernames and rejects unsupported characters", () => {
    const fields = {
      name: "Mom",
      priority: "primary" as const,
      telegram_username: "mom_123",
    };

    expect(emergencyContactSchema.safeParse(fields).success).toBe(true);
    expect(
      emergencyContactSchema.safeParse({
        ...fields,
        telegram_username: "not valid",
      }).success,
    ).toBe(false);
  });
});
