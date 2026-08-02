import { z } from "zod";

type ProviderRequirements = {
  requiresApiKey: boolean;
  requiresBaseUrl: boolean;
  requiresModelName: boolean;
};

export function createAIProviderSchema({
  requiresApiKey,
  requiresBaseUrl,
  requiresModelName,
}: ProviderRequirements) {
  return z
    .object({
      apiKey: z.string(),
      baseUrl: z.string(),
      maxResponseTokens: z.string(),
      modelName: z.string(),
    })
    .superRefine((fields, context) => {
      if (requiresApiKey && !fields.apiKey.trim()) {
        context.addIssue({
          code: "custom",
          message: "API key is required",
          path: ["apiKey"],
        });
      }
      if (requiresBaseUrl && !fields.baseUrl.trim()) {
        context.addIssue({
          code: "custom",
          message: "Base URL is required",
          path: ["baseUrl"],
        });
      }
      if (requiresModelName && !fields.modelName.trim()) {
        context.addIssue({
          code: "custom",
          message: "Model name is required",
          path: ["modelName"],
        });
      }
      const maxTokens = fields.maxResponseTokens.trim();
      if (maxTokens) {
        const parsedMaxTokens = Number(maxTokens);
        if (
          !Number.isInteger(parsedMaxTokens) ||
          parsedMaxTokens < 256 ||
          parsedMaxTokens > 32768
        ) {
          context.addIssue({
            code: "custom",
            message: "Enter a whole number between 256 and 32768",
            path: ["maxResponseTokens"],
          });
        }
      }
    })
    .transform((fields) => ({
      apiKey: fields.apiKey.trim(),
      baseUrl: fields.baseUrl.trim(),
      maxResponseTokens: fields.maxResponseTokens.trim()
        ? Number(fields.maxResponseTokens.trim())
        : null,
      modelName: fields.modelName.trim(),
    }));
}

export const subscriptionTokenSchema = z.object({
  subscriptionToken: z
    .string()
    .trim()
    .min(1, "Paste the subscription token")
    .max(5000, "Token must be 5000 characters or fewer"),
});

export type AIProviderFieldName =
  | "apiKey"
  | "baseUrl"
  | "maxResponseTokens"
  | "modelName"
  | "subscriptionToken";
