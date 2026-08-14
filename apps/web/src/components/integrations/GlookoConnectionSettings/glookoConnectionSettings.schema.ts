import { z } from "zod";

export const glookoCredentialsSchema = z.object({
  acceptRisk: z.literal(true, {
    message: "Confirm the connection acknowledgment.",
  }),
  email: z
    .string()
    .trim()
    .min(1, "Glooko email is required.")
    .email("Enter a valid email address."),
  password: z.string().min(1, "Glooko password is required."),
  region: z.enum(["US", "EU"], { message: "Choose a supported region." }),
});

export const glookoIntervalSchema = z
  .number()
  .int("Sync interval must be a whole number.")
  .min(15, "Sync interval must be at least 15 minutes.")
  .max(1440, "Sync interval must be no more than 1440 minutes.");

export type GlookoCredentialField = keyof z.input<
  typeof glookoCredentialsSchema
>;
export type GlookoCredentialErrors = Record<GlookoCredentialField, string[]>;

export function getGlookoCredentialErrors(values: {
  acceptRisk: boolean;
  email: string;
  password: string;
  region: string;
}): GlookoCredentialErrors {
  const errors: GlookoCredentialErrors = {
    acceptRisk: [],
    email: [],
    password: [],
    region: [],
  };
  const result = glookoCredentialsSchema.safeParse(values);
  if (result.success) return errors;

  result.error.issues.forEach((issue) => {
    const field = issue.path[0] as GlookoCredentialField;
    if (!(field in errors)) return;
    errors[field] = [...new Set([...errors[field], issue.message])];
  });
  return errors;
}
