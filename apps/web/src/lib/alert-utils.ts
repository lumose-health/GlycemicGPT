/**
 * Story 6.4: Shared alert utilities.
 *
 * Consolidates severity config, icon mapping, and time formatting
 * used by AlertCard, AlertToast, and the alerts page.
 */

import {
  TrendingDown,
  TrendingUp,
  Syringe,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";
export {
  formatAlertSummary,
  formatAlertTitle,
  formatCountdown,
  formatTimeAgo,
} from "./alert-format";

/** Visual config per alert severity level */
export const SEVERITY_CONFIG: Record<
  string,
  { bg: string; border: string; text: string; icon: string; animation: string }
> = {
  emergency: {
    bg: "bg-red-500/15",
    border: "border-red-500/30",
    text: "text-red-400",
    icon: "text-red-400",
    animation: "animate-pulse-fast",
  },
  urgent: {
    bg: "bg-orange-500/10",
    border: "border-orange-500/20",
    text: "text-orange-400",
    icon: "text-orange-400",
    animation: "animate-pulse-slow",
  },
  warning: {
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
    text: "text-amber-400",
    icon: "text-amber-400",
    animation: "",
  },
  info: {
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
    text: "text-blue-400",
    icon: "text-blue-400",
    animation: "",
  },
};

/** Map alert_type string to a lucide-react icon component */
export function getAlertIcon(alertType: string): LucideIcon {
  if (alertType.includes("low")) return TrendingDown;
  if (alertType.includes("high")) return TrendingUp;
  if (alertType === "iob_warning") return Syringe;
  return AlertTriangle;
}
