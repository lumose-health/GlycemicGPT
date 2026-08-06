import { z } from "zod";

export const medtronicPairingSchema = z.object({
  apiUrl: z
    .string()
    .trim()
    .min(1, "GlycemicGPT URL is required.")
    .pipe(
      z.url({
        protocol: /^https?$/,
        error: "Enter a valid URL including https:// or http://.",
      }),
    ),
  region: z.enum(["US", "EU"], { error: "Choose a supported region." }),
  username: z.string().trim().min(1, "CareLink username is required."),
});

export const medtronicIntervalSchema = z
  .number()
  .int("Sync interval must be a whole number.")
  .min(15, "Sync interval must be at least 15 minutes.")
  .max(1440, "Sync interval must be no more than 1440 minutes.");

export type MedtronicPairingField = keyof z.input<
  typeof medtronicPairingSchema
>;
export type MedtronicPairingErrors = Record<MedtronicPairingField, string[]>;

export function getMedtronicPairingErrors(
  values: z.input<typeof medtronicPairingSchema>,
): MedtronicPairingErrors {
  const errors: MedtronicPairingErrors = {
    apiUrl: [],
    region: [],
    username: [],
  };
  const result = medtronicPairingSchema.safeParse(values);
  if (result.success) return errors;
  result.error.issues.forEach((issue) => {
    const field = issue.path[0] as MedtronicPairingField;
    if (!(field in errors)) return;
    errors[field] = [...new Set([...errors[field], issue.message])];
  });
  return errors;
}
