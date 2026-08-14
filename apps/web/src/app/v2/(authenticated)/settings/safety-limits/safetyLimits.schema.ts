import { z } from "zod";

export const SAFETY_LIMIT_FIELDS = [
  "minGlucose",
  "maxGlucose",
  "maxBasal",
  "maxBolus",
] as const;

export type SafetyLimitField = (typeof SAFETY_LIMIT_FIELDS)[number];
export type SafetyLimitsFormValues = Record<SafetyLimitField, string>;
export type SafetyLimitsFieldErrors = Record<SafetyLimitField, string[]>;

type DisplayBound = { min: number; max: number };

function numberField(
  label: string,
  min: number,
  max: number,
  wholeNumber: boolean,
) {
  return z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .refine(
      (value) => Number.isFinite(Number(value)),
      `${label} must be a number.`,
    )
    .refine(
      (value) => !wholeNumber || /^\d+$/.test(value),
      `${label} must be a whole number.`,
    )
    .transform(Number)
    .refine(
      (value) => value >= min && value <= max,
      `${label} must be between ${min} and ${max}.`,
    );
}

export function createSafetyLimitsSchema({
  allowGlucoseDecimals,
  maxGlucoseBound,
  minGlucoseBound,
}: {
  allowGlucoseDecimals: boolean;
  maxGlucoseBound: DisplayBound;
  minGlucoseBound: DisplayBound;
}) {
  return z
    .object({
      minGlucose: numberField(
        "Minimum Glucose",
        minGlucoseBound.min,
        minGlucoseBound.max,
        !allowGlucoseDecimals,
      ),
      maxGlucose: numberField(
        "Maximum Glucose",
        maxGlucoseBound.min,
        maxGlucoseBound.max,
        !allowGlucoseDecimals,
      ),
      maxBasal: numberField("Maximum Basal Rate", 0.001, 15, false),
      maxBolus: numberField("Maximum Bolus Dose", 0.001, 25, false),
    })
    .superRefine((values, context) => {
      if (values.minGlucose < values.maxGlucose) return;
      ["minGlucose", "maxGlucose"].forEach((field) =>
        context.addIssue({
          code: "custom",
          message: "Minimum Glucose must be less than Maximum Glucose.",
          path: [field],
        }),
      );
    });
}

export function getSafetyLimitsFieldErrors(
  values: SafetyLimitsFormValues,
  options: Parameters<typeof createSafetyLimitsSchema>[0],
): SafetyLimitsFieldErrors {
  const errors = SAFETY_LIMIT_FIELDS.reduce<SafetyLimitsFieldErrors>(
    (fieldErrors, field) => ({ ...fieldErrors, [field]: [] }),
    {} as SafetyLimitsFieldErrors,
  );
  const result = createSafetyLimitsSchema(options).safeParse(values);

  if (result.success) return errors;
  result.error.issues.forEach((issue) => {
    const field = issue.path[0] as SafetyLimitField;
    if (!SAFETY_LIMIT_FIELDS.includes(field)) return;
    errors[field] = [...new Set([...errors[field], issue.message])];
  });
  return errors;
}
