import type { DisclaimerContent } from "@/lib/api";

export const FALLBACK_DISCLAIMER_CONTENT: DisclaimerContent = {
  version: "1.2",
  title: "Important Safety Information",
  warnings: [
    {
      icon: "flask",
      title: "Experimental Software",
      text: "This is experimental open source software. It has not been validated for clinical use and may contain bugs or errors.",
    },
    {
      icon: "brain",
      title: "AI Limitations",
      text: "AI can and will make mistakes. All suggestions should be verified with your healthcare provider before acting on them.",
    },
    {
      icon: "camera",
      title: "Photo Carb Estimates Are Guesses",
      text: "If you use the meal photo feature, carbohydrate numbers are AI estimates and are frequently wrong, including when identifying the food. Never use a photo carb estimate to calculate an insulin dose or bolus. Always verify carbohydrates yourself before dosing.",
    },
    {
      icon: "shield-x",
      title: "Not FDA Approved",
      text: "This software is not FDA approved for medical use. It is not intended to diagnose, treat, cure, or prevent any disease.",
    },
    {
      icon: "stethoscope",
      title: "Consult Your Healthcare Provider",
      text: "Always consult your healthcare provider before making any changes to your diabetes management regimen.",
    },
    {
      icon: "cloud",
      title: "AI Data Processing",
      text: "Lumose is BYOAI. You choose the AI provider. A cloud hosted provider receives your health data for analysis under its own data handling policy. A local provider keeps that data on your network. Review the policy for your chosen provider before configuring it.",
    },
  ],
  checkboxes: [
    {
      id: "checkbox_experimental",
      label:
        "I understand this is experimental software and that AI suggestions may be incorrect",
    },
    {
      id: "checkbox_not_medical_advice",
      label:
        "I understand this is not medical advice and I will consult my healthcare provider before making any changes",
    },
    {
      id: "checkbox_ai_data_flow",
      label:
        "I understand that a cloud hosted AI provider receives my health data, while a local AI provider keeps it on my network",
    },
  ],
  button_text: "I Understand and Accept",
};

export function createCheckboxState(
  content: DisclaimerContent,
): Record<string, boolean> {
  return Object.fromEntries(
    content.checkboxes.map((checkbox) => [checkbox.id, false]),
  );
}
