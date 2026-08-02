import { z } from "zod";

export const emergencyContactSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(100, "Name must be 100 characters or fewer"),
  priority: z.enum(["primary", "secondary"]),
  telegram_username: z
    .string()
    .trim()
    .min(5, "Telegram username must be at least 5 characters")
    .max(32, "Telegram username must be 32 characters or fewer")
    .regex(/^[A-Za-z0-9_]+$/, "Use only letters, numbers, and underscores"),
});

export type EmergencyContactFields = z.infer<typeof emergencyContactSchema>;
