import { nightscoutConnectionSchema } from "./nightscoutConnectionSettings.schema";

describe("Nightscout connection validation", () => {
  it("requires a name and valid URL", () => {
    expect(
      nightscoutConnectionSchema.safeParse({ baseUrl: "invalid", name: "Home" })
        .success,
    ).toBe(false);
    expect(
      nightscoutConnectionSchema.parse({
        baseUrl: " https://nightscout.example.com ",
        name: " Home ",
      }),
    ).toEqual({ baseUrl: "https://nightscout.example.com", name: "Home" });
  });
});
