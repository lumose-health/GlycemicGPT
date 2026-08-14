import { z } from "zod";

export const RESEARCH_SOURCE_CATEGORIES = [
  "",
  "insulin",
  "pump",
  "cgm",
  "guidelines",
  "other",
] as const;

export interface ResearchSourceFormValues {
  category: (typeof RESEARCH_SOURCE_CATEGORIES)[number];
  name: string;
  url: string;
}

export type ResearchSourceField = keyof ResearchSourceFormValues;
export type ResearchSourceValidationErrors = Record<
  ResearchSourceField,
  string[]
>;

function isValidHttpsUrl(value: string): boolean {
  if (value.length === 0) return true;

  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export const researchSourceSchema = z.object({
  category: z.enum(RESEARCH_SOURCE_CATEGORIES, {
    error: "Choose a valid category.",
  }),
  name: z
    .string()
    .trim()
    .min(1, "Enter a source name.")
    .max(200, "Source name must be 200 characters or fewer."),
  url: z
    .string()
    .trim()
    .min(1, "Enter a source URL.")
    .max(2000, "Source URL must be 2000 characters or fewer.")
    .refine(
      (value) => value.length === 0 || value.length >= 10,
      "Source URL must be at least 10 characters.",
    )
    .refine(isValidHttpsUrl, "Enter a valid HTTPS URL."),
});

export function getResearchSourceValidationErrors(
  values: ResearchSourceFormValues,
): ResearchSourceValidationErrors {
  const errors: ResearchSourceValidationErrors = {
    category: [],
    name: [],
    url: [],
  };
  const result = researchSourceSchema.safeParse(values);

  if (result.success) return errors;

  result.error.issues.forEach((issue) => {
    const field = issue.path[0];
    if (field === "category" || field === "name" || field === "url") {
      errors[field] = [...new Set([...errors[field], issue.message])];
    }
  });

  return errors;
}
