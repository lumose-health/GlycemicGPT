import { z } from "zod";

export const ALERT_SETTINGS_FIELDS = [
  "urgentLow",
  "lowWarning",
  "highWarning",
  "urgentHigh",
  "iobWarning",
  "reminderDelay",
  "primaryDelay",
  "allContactsDelay",
] as const;

export type AlertSettingsField = (typeof ALERT_SETTINGS_FIELDS)[number];
export type AlertSettingsFormValues = Record<AlertSettingsField, string>;
export type AlertSettingsFieldErrors = Record<AlertSettingsField, string[]>;

type DisplayBound = { min: number; max: number };
type AlertDisplayBounds = {
  urgentLow: DisplayBound;
  lowWarning: DisplayBound;
  highWarning: DisplayBound;
  urgentHigh: DisplayBound;
};

function numberField(label: string, min: number, max: number, integer = false) {
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
      (value) => !integer || Number.isInteger(value),
      `${label} must be a whole number.`,
    )
    .refine(
      (value) => value >= min && value <= max,
      `${label} must be between ${min} and ${max}.`,
    );
}

export function createAlertSettingsSchema(bounds: AlertDisplayBounds) {
  return z
    .object({
      urgentLow: numberField(
        "Urgent Low",
        bounds.urgentLow.min,
        bounds.urgentLow.max,
      ),
      lowWarning: numberField(
        "Low Warning",
        bounds.lowWarning.min,
        bounds.lowWarning.max,
      ),
      highWarning: numberField(
        "High Warning",
        bounds.highWarning.min,
        bounds.highWarning.max,
      ),
      urgentHigh: numberField(
        "Urgent High",
        bounds.urgentHigh.min,
        bounds.urgentHigh.max,
      ),
      iobWarning: numberField("IoB Warning", 0.5, 20),
      reminderDelay: numberField("Reminder Delay", 2, 60, true),
      primaryDelay: numberField("Primary Contact Delay", 2, 120, true),
      allContactsDelay: numberField("All Contacts Delay", 2, 240, true),
    })
    .superRefine((values, context) => {
      if (values.urgentLow >= values.lowWarning) {
        ["urgentLow", "lowWarning"].forEach((field) =>
          context.addIssue({
            code: "custom",
            message: "Urgent Low must be less than Low Warning.",
            path: [field],
          }),
        );
      }
      if (values.highWarning >= values.urgentHigh) {
        ["highWarning", "urgentHigh"].forEach((field) =>
          context.addIssue({
            code: "custom",
            message: "High Warning must be less than Urgent High.",
            path: [field],
          }),
        );
      }
      if (
        values.reminderDelay >= values.primaryDelay ||
        values.primaryDelay >= values.allContactsDelay
      ) {
        ["reminderDelay", "primaryDelay", "allContactsDelay"].forEach((field) =>
          context.addIssue({
            code: "custom",
            message: "Escalation delays must increase at every step.",
            path: [field],
          }),
        );
      }
    });
}

export function getAlertSettingsFieldErrors(
  values: AlertSettingsFormValues,
  bounds: AlertDisplayBounds,
): AlertSettingsFieldErrors {
  const errors = ALERT_SETTINGS_FIELDS.reduce<AlertSettingsFieldErrors>(
    (fieldErrors, field) => ({ ...fieldErrors, [field]: [] }),
    {} as AlertSettingsFieldErrors,
  );
  const result = createAlertSettingsSchema(bounds).safeParse(values);

  if (result.success) return errors;
  result.error.issues.forEach((issue) => {
    const field = issue.path[0] as AlertSettingsField;
    if (!ALERT_SETTINGS_FIELDS.includes(field)) return;
    errors[field] = [...new Set([...errors[field], issue.message])];
  });
  return errors;
}
