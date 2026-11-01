import { z } from "zod";

export interface LibreLinkUpCredentialsFormValues {
  email: string;
  password: string;
}

export type LibreLinkUpCredentialsField =
  keyof LibreLinkUpCredentialsFormValues;
export type LibreLinkUpCredentialsValidationErrors = Record<
  LibreLinkUpCredentialsField,
  string[]
>;

const libreLinkUpEmailSchema = z
  .string()
  .trim()
  .superRefine((email, context) => {
    if (!email) {
      context.addIssue({
        code: "custom",
        message: "Enter your LibreLinkUp email.",
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

export const libreLinkUpCredentialsSchema = z.object({
  email: libreLinkUpEmailSchema,
  password: z.string().min(1, "Enter your LibreLinkUp password."),
});

export function getLibreLinkUpCredentialsValidationErrors(
  values: LibreLinkUpCredentialsFormValues,
): LibreLinkUpCredentialsValidationErrors {
  const errors: LibreLinkUpCredentialsValidationErrors = {
    email: [],
    password: [],
  };
  const result = libreLinkUpCredentialsSchema.safeParse(values);

  if (result.success) return errors;

  result.error.issues.forEach((issue) => {
    const field = issue.path[0];
    if (field !== "email" && field !== "password") return;
    errors[field] = [...new Set([...errors[field], issue.message])];
  });

  return errors;
}
