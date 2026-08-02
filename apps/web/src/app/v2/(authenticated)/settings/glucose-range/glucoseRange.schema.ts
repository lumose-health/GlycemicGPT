import { z } from "zod";

export const GLUCOSE_RANGE_FIELDS = [
  "urgentLow",
  "lowTarget",
  "highTarget",
  "urgentHigh",
] as const;

export type GlucoseRangeField = (typeof GLUCOSE_RANGE_FIELDS)[number];
export type GlucoseRangeFormValues = Record<GlucoseRangeField, string>;
export type GlucoseRangeFieldErrors = Record<GlucoseRangeField, string[]>;

type DisplayBound = { min: number; max: number };
type DisplayBounds = Record<GlucoseRangeField, DisplayBound>;

function numberField(label: string, bounds: DisplayBound) {
  return z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .refine(
      (value) => Number.isFinite(Number(value)),
      `${label} must be a number.`,
    )
    .transform(Number)
    .refine(
      (value) => value >= bounds.min && value <= bounds.max,
      `${label} must be between ${bounds.min} and ${bounds.max}.`,
    );
}

export function createGlucoseRangeSchema(bounds: DisplayBounds) {
  return z
    .object({
      urgentLow: numberField("Urgent Low", bounds.urgentLow),
      lowTarget: numberField("Low Target", bounds.lowTarget),
      highTarget: numberField("High Target", bounds.highTarget),
      urgentHigh: numberField("Urgent High", bounds.urgentHigh),
    })
    .superRefine((values, context) => {
      const ordered =
        values.urgentLow < values.lowTarget &&
        values.lowTarget < values.highTarget &&
        values.highTarget < values.urgentHigh;

      if (ordered) return;

      GLUCOSE_RANGE_FIELDS.forEach((field) => {
        context.addIssue({
          code: "custom",
          message: "Thresholds must increase from Urgent Low to Urgent High.",
          path: [field],
        });
      });
    });
}

export function getGlucoseRangeFieldErrors(
  values: GlucoseRangeFormValues,
  bounds: DisplayBounds,
): GlucoseRangeFieldErrors {
  const errors = GLUCOSE_RANGE_FIELDS.reduce<GlucoseRangeFieldErrors>(
    (fieldErrors, field) => ({ ...fieldErrors, [field]: [] }),
    {} as GlucoseRangeFieldErrors,
  );
  const result = createGlucoseRangeSchema(bounds).safeParse(values);

  if (result.success) return errors;

  result.error.issues.forEach((issue) => {
    const field = issue.path[0];
    if (!GLUCOSE_RANGE_FIELDS.includes(field as GlucoseRangeField)) return;
    const typedField = field as GlucoseRangeField;
    errors[typedField] = [...new Set([...errors[typedField], issue.message])];
  });

  return errors;
}
