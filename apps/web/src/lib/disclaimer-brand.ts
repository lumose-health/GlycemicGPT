import type { DisclaimerContent } from "@/lib/api";

function replaceLegacyProductName(value: string): string {
  return value.replaceAll("GlycemicGPT", "Lumose");
}

export function normalizeDisclaimerBrand(
  content: DisclaimerContent,
): DisclaimerContent {
  return {
    ...content,
    title: replaceLegacyProductName(content.title),
    button_text: replaceLegacyProductName(content.button_text),
    warnings: content.warnings.map((warning) => ({
      ...warning,
      title: replaceLegacyProductName(warning.title),
      text: replaceLegacyProductName(warning.text),
    })),
    checkboxes: content.checkboxes.map((checkbox) => ({
      ...checkbox,
      label: replaceLegacyProductName(checkbox.label),
    })),
  };
}
