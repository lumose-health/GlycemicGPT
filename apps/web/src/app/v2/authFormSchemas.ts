import { z } from "zod";

export interface LoginFormValues {
  email: string;
  password: string;
}

export interface RegisterFormValues extends LoginFormValues {
  confirmPassword: string;
}

export type LoginField = keyof LoginFormValues;
export type RegisterField = keyof RegisterFormValues;
export type LoginValidationErrors = Record<LoginField, string[]>;
export type RegisterValidationErrors = Record<RegisterField, string[]>;

const emailSchema = z
  .string()
  .trim()
  .superRefine((email, context) => {
    if (!email) {
      context.addIssue({
        code: "custom",
        message: "Enter your email address.",
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

const registrationPasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .regex(/[A-Z]/, "Include at least one uppercase letter.")
  .regex(/[a-z]/, "Include at least one lowercase letter.")
  .regex(/[0-9]/, "Include at least one number.");

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password."),
});

export const registerSchema = z
  .object({
    confirmPassword: z.string().min(1, "Confirm your password."),
    email: emailSchema,
    password: registrationPasswordSchema,
  })
  .superRefine(({ confirmPassword, password }, context) => {
    if (confirmPassword && password !== confirmPassword) {
      context.addIssue({
        code: "custom",
        message: "Passwords do not match.",
        path: ["confirmPassword"],
      });
    }
  });

function getValidationErrors<Field extends string>(
  result: z.ZodSafeParseResult<unknown>,
  fields: readonly Field[],
): Record<Field, string[]> {
  const errors = fields.reduce<Record<Field, string[]>>(
    (fieldErrors, field) => {
      fieldErrors[field] = [];
      return fieldErrors;
    },
    {} as Record<Field, string[]>,
  );

  if (result.success) return errors;

  result.error.issues.forEach((issue) => {
    const field = issue.path[0];
    if (typeof field !== "string" || !fields.includes(field as Field)) return;

    errors[field as Field] = [
      ...new Set([...errors[field as Field], issue.message]),
    ];
  });

  return errors;
}

export function getLoginValidationErrors(
  values: LoginFormValues,
): LoginValidationErrors {
  return getValidationErrors(loginSchema.safeParse(values), [
    "email",
    "password",
  ]);
}

export function getRegisterValidationErrors(
  values: RegisterFormValues,
): RegisterValidationErrors {
  return getValidationErrors(registerSchema.safeParse(values), [
    "confirmPassword",
    "email",
    "password",
  ]);
}
