import { z } from "zod";
import { isSupportedTandemCountry } from "@/lib/tandem-countries";

export interface TandemCredentialsFormValues {
  country: string;
  email: string;
  password: string;
}

export type TandemCredentialsField = keyof TandemCredentialsFormValues;
export type TandemCredentialsValidationErrors = Record<
  TandemCredentialsField,
  string[]
>;

const tandemEmailSchema = z
  .string()
  .trim()
  .superRefine((email, context) => {
    if (!email) {
      context.addIssue({
        code: "custom",
        message: "Enter your Tandem t:connect email.",
      });
      return;
    }

    if (!z.email().safeParse(email).success) {
      context.addIssue({
        code: "custom",
        message: "Enter a valid email address.",
      });
    }
  });

export const tandemCredentialsSchema = z.object({
  country: z
    .string()
    .refine(isSupportedTandemCountry, "Select a supported country."),
  email: tandemEmailSchema,
  password: z.string().min(1, "Enter your Tandem t:connect password."),
});

export function getTandemCredentialsValidationErrors(
  values: TandemCredentialsFormValues,
): TandemCredentialsValidationErrors {
  const errors: TandemCredentialsValidationErrors = {
    country: [],
    email: [],
    password: [],
  };
  const result = tandemCredentialsSchema.safeParse(values);

  if (result.success) return errors;

  result.error.issues.forEach((issue) => {
    const field = issue.path[0];
    if (field !== "country" && field !== "email" && field !== "password") {
      return;
    }

    errors[field] = [...new Set([...errors[field], issue.message])];
  });

  return errors;
}
