import {
  glookoCredentialsSchema,
  glookoIntervalSchema,
} from "./glookoConnectionSettings.schema";

describe("Glooko connection validation", () => {
  it("requires valid credentials and explicit acknowledgment", () => {
    expect(
      glookoCredentialsSchema.safeParse({
        acceptRisk: false,
        email: "user@example.com",
        password: "secret",
        region: "US",
      }).success,
    ).toBe(false);
    expect(
      glookoCredentialsSchema.safeParse({
        acceptRisk: false,
        email: "invalid",
        password: "",
        region: "US",
      }).success,
    ).toBe(false);
    expect(
      glookoCredentialsSchema.safeParse({
        acceptRisk: true,
        email: "user@example.com",
        password: "secret",
        region: "EU",
      }).success,
    ).toBe(true);
  });

  it("accepts only whole sync intervals inside the supported range", () => {
    expect(glookoIntervalSchema.safeParse(15).success).toBe(true);
    expect(glookoIntervalSchema.safeParse(14).success).toBe(false);
    expect(glookoIntervalSchema.safeParse(15.5).success).toBe(false);
    expect(glookoIntervalSchema.safeParse(1441).success).toBe(false);
  });
});
