import { z } from "zod";

export interface DexcomCredentialsFormValues {
  email: string;
  password: string;
}

export type DexcomCredentialsField = keyof DexcomCredentialsFormValues;
export type DexcomCredentialsValidationErrors = Record<
  DexcomCredentialsField,
  string[]
>;

const dexcomEmailSchema = z
  .string()
  .trim()
  .superRefine((email, context) => {
    if (!email) {
      context.addIssue({ code: "custom", message: "Enter your Dexcom Share email." });
      return;
    }

    if (!z.email().safeParse(email).success) {
      context.addIssue({ code: "custom", message: "Enter a valid email address." });
    }
  });

export const dexcomCredentialsSchema = z.object({
  email: dexcomEmailSchema,
  password: z.string().min(1, "Enter your Dexcom Share password."),
});

export function getDexcomCredentialsValidationErrors(
  values: DexcomCredentialsFormValues,
): DexcomCredentialsValidationErrors {
  const errors: DexcomCredentialsValidationErrors = { email: [], password: [] };
  const result = dexcomCredentialsSchema.safeParse(values);

  if (result.success) return errors;

  result.error.issues.forEach((issue) => {
    const field = issue.path[0];
    if (field !== "email" && field !== "password") return;
    errors[field] = [...new Set([...errors[field], issue.message])];
  });

  return errors;
}
