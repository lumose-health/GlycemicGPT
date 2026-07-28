import { z } from "zod";

export interface PasswordFormValues {
  confirmPassword: string;
  currentPassword: string;
  newPassword: string;
}

export type PasswordField = keyof PasswordFormValues;
export type PasswordValidationErrors = Record<PasswordField, string[]>;

export const passwordSchema = z
  .object({
    confirmPassword: z.string().min(1, "Confirm your new password."),
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: z
      .string()
      .min(8, "New password must be at least 8 characters.")
      .regex(/[A-Z]/, "Include at least one uppercase letter.")
      .regex(/[a-z]/, "Include at least one lowercase letter.")
      .regex(/[0-9]/, "Include at least one number."),
  })
  .superRefine(({ confirmPassword, newPassword }, context) => {
    if (confirmPassword && newPassword !== confirmPassword) {
      context.addIssue({
        code: "custom",
        message: "New passwords do not match.",
        path: ["confirmPassword"],
      });
    }
  });

export function getPasswordValidationErrors(
  values: PasswordFormValues,
): PasswordValidationErrors {
  const errors: PasswordValidationErrors = {
    confirmPassword: [],
    currentPassword: [],
    newPassword: [],
  };
  const result = passwordSchema.safeParse(values);

  if (result.success) return errors;

  result.error.issues.forEach((issue) => {
    const field = issue.path[0];
    if (
      field === "confirmPassword" ||
      field === "currentPassword" ||
      field === "newPassword"
    ) {
      errors[field] = [...new Set([...errors[field], issue.message])];
    }
  });

  return errors;
}
