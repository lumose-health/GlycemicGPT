import { z } from "zod";

export const nightscoutOnboardingCredentialsSchema = z.object({
  apiVersion: z.enum(["auto", "v1", "v3"]),
  authType: z.enum(["auto", "secret", "token"]),
  baseUrl: z
    .string()
    .trim()
    .min(1, "Nightscout URL is required.")
    .pipe(
      z.url({
        protocol: /^https?$/,
        error: "Enter a valid Nightscout URL.",
      }),
    ),
  credential: z.string().trim(),
  name: z.string().trim().min(1, "Name is required."),
});

export type NightscoutOnboardingCredentialField =
  | "apiVersion"
  | "authType"
  | "baseUrl"
  | "credential"
  | "name";
export type NightscoutOnboardingCredentialErrors = Record<
  NightscoutOnboardingCredentialField,
  string[]
>;

export function getNightscoutOnboardingCredentialErrors(values: {
  apiVersion: string;
  authType: string;
  baseUrl: string;
  credential: string;
  name: string;
}): NightscoutOnboardingCredentialErrors {
  const errors: NightscoutOnboardingCredentialErrors = {
    apiVersion: [],
    authType: [],
    baseUrl: [],
    credential: [],
    name: [],
  };
  const result = nightscoutOnboardingCredentialsSchema.safeParse(values);
  if (result.success) return errors;
  result.error.issues.forEach((issue) => {
    const field = issue.path[0] as NightscoutOnboardingCredentialField;
    if (!(field in errors)) return;
    errors[field] = [...new Set([...errors[field], issue.message])];
  });
  return errors;
}

export const nightscoutOverrideSchema = z
  .string()
  .trim()
  .refine(
    (value) =>
      value === "" || (Number.isFinite(Number(value)) && Number(value) > 0),
    "Enter a positive number, or clear the field to use Nightscout's value.",
  )
  .transform((value) => (value === "" ? null : Number(value)));
