import { z } from "zod";

const retentionDaysSchema = z
  .number()
  .int()
  .refine(
    (value) => [30, 90, 180, 365, 730, 1825, 3650].includes(value),
    "Select a supported retention period",
  );

export const dataRetentionSchema = z.object({
  analysisDays: retentionDaysSchema,
  auditDays: retentionDaysSchema,
  glucoseDays: retentionDaysSchema,
});

export const dayBoundarySchema = z
  .number()
  .int()
  .min(0, "Select a valid day boundary")
  .max(23, "Select a valid day boundary");

export const displayLabelsSchema = z
  .array(
    z.object({
      computation_role: z.string().nullable(),
      id: z.string().min(1),
      label: z
        .string()
        .trim()
        .min(1, "Display labels cannot be empty")
        .max(20, "Display labels must be 20 characters or fewer"),
      pump_source: z.string().nullable(),
      sort_order: z.number().int().nonnegative(),
    }),
  )
  .min(1, "At least one display label is required")
  .max(20, "No more than 20 display labels are supported");

export const purgeConfirmationSchema = z.object({
  confirmation: z.literal("DELETE", {
    error: "Type DELETE to confirm",
  }),
});

export type DataSettingsValidationField =
  | "analysisDays"
  | "auditDays"
  | "boundaryHour"
  | "displayLabels"
  | "glucoseDays"
  | "purgeInput";
