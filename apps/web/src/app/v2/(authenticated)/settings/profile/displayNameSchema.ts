import { z } from "zod";

const DISPLAY_NAME_CHARACTERS = /^[\p{L}\p{N} -]*$/u;

export const displayNameSchema = z
  .string()
  .trim()
  .refine((value) => value.length === 0 || value.length >= 2, {
    message: "Display name must be at least 2 characters.",
  })
  .max(20, "Display name must be 20 characters or fewer.")
  .regex(
    DISPLAY_NAME_CHARACTERS,
    "Use only letters, numbers, spaces, and hyphens.",
  );

export function getDisplayNameValidationErrors(value: string): string[] {
  const result = displayNameSchema.safeParse(value);

  return result.success
    ? []
    : [...new Set(result.error.issues.map((issue) => issue.message))];
}
