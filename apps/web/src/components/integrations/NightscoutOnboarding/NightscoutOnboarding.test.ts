import {
  nightscoutOnboardingCredentialsSchema,
  nightscoutOverrideSchema,
} from "./nightscoutOnboarding.schema";

describe("Nightscout onboarding validation", () => {
  it("validates and normalizes credential fields", () => {
    expect(
      nightscoutOnboardingCredentialsSchema.safeParse({
        apiVersion: "auto",
        authType: "auto",
        baseUrl: "invalid",
        credential: "",
        name: "",
      }).success,
    ).toBe(false);
    expect(
      nightscoutOnboardingCredentialsSchema.parse({
        apiVersion: "v3",
        authType: "token",
        baseUrl: " https://nightscout.example.com ",
        credential: " token ",
        name: " Home ",
      }),
    ).toMatchObject({
      baseUrl: "https://nightscout.example.com",
      credential: "token",
      name: "Home",
    });
  });

  it("accepts an empty override and rejects non-positive values", () => {
    expect(nightscoutOverrideSchema.parse("")).toBeNull();
    expect(nightscoutOverrideSchema.parse("2.5")).toBe(2.5);
    expect(nightscoutOverrideSchema.safeParse("0").success).toBe(false);
  });
});
