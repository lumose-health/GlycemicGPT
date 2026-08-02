import {
  createAIProviderSchema,
  subscriptionTokenSchema,
} from "./aiProvider.schema";

describe("AI provider schemas", () => {
  it("enforces requirements for the selected provider", () => {
    const schema = createAIProviderSchema({
      requiresApiKey: true,
      requiresBaseUrl: false,
      requiresModelName: false,
    });

    expect(
      schema.safeParse({
        apiKey: "",
        baseUrl: "",
        maxResponseTokens: "",
        modelName: "",
      }).success,
    ).toBe(false);
    expect(
      schema.parse({
        apiKey: "secret",
        baseUrl: "",
        maxResponseTokens: "4096",
        modelName: "",
      }).maxResponseTokens,
    ).toBe(4096);
  });

  it("requires a subscription token", () => {
    expect(
      subscriptionTokenSchema.safeParse({ subscriptionToken: "" }).success,
    ).toBe(false);
  });
});
