import { briefDeliverySchema } from "./briefDelivery.schema";

describe("briefDeliverySchema", () => {
  it("accepts a valid schedule and rejects an invalid time", () => {
    const fields = {
      channel: "both" as const,
      deliveryTime: "07:00",
      enabled: true,
      timezone: "Europe/Stockholm",
    };

    expect(briefDeliverySchema.safeParse(fields).success).toBe(true);
    expect(
      briefDeliverySchema.safeParse({ ...fields, deliveryTime: "25:00" })
        .success,
    ).toBe(false);
  });
});
