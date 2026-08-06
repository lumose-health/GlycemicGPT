import type { IconName } from "@/base/Icon";

export const ALERT_SEVERITY_PRESENTATION: Record<
  string,
  { bg: string; border: string; text: string; icon: string; animation: string }
> = {
  emergency: {
    animation: "animate-pulse-fast",
    bg: "bg-signal-error-fill/20",
    border: "border-signal-error-fill",
    icon: "text-signal-error-text",
    text: "text-signal-error-text",
  },
  urgent: {
    animation: "animate-pulse-slow",
    bg: "bg-signal-warning-fill/20",
    border: "border-signal-warning-fill",
    icon: "text-signal-warning-text",
    text: "text-signal-warning-text",
  },
  warning: {
    animation: "",
    bg: "bg-signal-warning-fill/20",
    border: "border-signal-warning-fill",
    icon: "text-signal-warning-text",
    text: "text-signal-warning-text",
  },
  info: {
    animation: "",
    bg: "bg-accent/20",
    border: "border-accent",
    icon: "text-accent",
    text: "text-accent",
  },
};

export function getAlertIconName(alertType: string): IconName {
  if (alertType.includes("low")) return "trend-down";
  if (alertType.includes("high")) return "trend-up";
  if (alertType === "iob_warning") return "syringe";
  return "alert";
}
