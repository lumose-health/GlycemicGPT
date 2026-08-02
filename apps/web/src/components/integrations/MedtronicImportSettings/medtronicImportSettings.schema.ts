import { z } from "zod";

export const medtronicTokenSchema = z
  .string()
  .trim()
  .min(1, "Paste the copied CareLink code.");

export function createMedtronicImportRangeSchema({
  earliest,
  latest,
  maxDays = 31,
}: {
  earliest?: string;
  latest?: string;
  maxDays?: number;
}) {
  return z
    .object({
      end: z.string().min(1, "End date is required."),
      start: z.string().min(1, "Start date is required."),
    })
    .superRefine(({ end, start }, context) => {
      if (!end || !start) return;
      const startTime = Date.parse(`${start}T00:00:00Z`);
      const endTime = Date.parse(`${end}T00:00:00Z`);
      if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) {
        context.addIssue({
          code: "custom",
          message: "Enter valid dates.",
          path: ["start"],
        });
        context.addIssue({
          code: "custom",
          message: "Enter valid dates.",
          path: ["end"],
        });
        return;
      }
      if (endTime < startTime) {
        context.addIssue({
          code: "custom",
          message: "End date must be on or after the start date.",
          path: ["end"],
        });
      }
      const days = Math.round((endTime - startTime) / 86_400_000) + 1;
      if (days > maxDays) {
        const message = `Choose ${maxDays} days or fewer.`;
        context.addIssue({ code: "custom", message, path: ["start"] });
        context.addIssue({ code: "custom", message, path: ["end"] });
      }
      if (earliest && start < earliest) {
        context.addIssue({
          code: "custom",
          message: `Start date cannot be before ${earliest}.`,
          path: ["start"],
        });
      }
      if (latest && end > latest) {
        context.addIssue({
          code: "custom",
          message: `End date cannot be after ${latest}.`,
          path: ["end"],
        });
      }
    });
}

export function getMedtronicRangeErrors(
  values: { end: string; start: string },
  options: Parameters<typeof createMedtronicImportRangeSchema>[0],
) {
  const errors: Record<"end" | "start", string[]> = { end: [], start: [] };
  const result = createMedtronicImportRangeSchema(options).safeParse(values);
  if (result.success) return errors;
  result.error.issues.forEach((issue) => {
    const field = issue.path[0] as "end" | "start";
    if (!(field in errors)) return;
    errors[field] = [...new Set([...errors[field], issue.message])];
  });
  return errors;
}
