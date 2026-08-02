import { formatGlucose, unitLabel, type GlucoseUnit } from "./glucose-units";

const ALERT_TYPE_LABELS: Record<string, string> = {
  low_urgent: "Urgent Low Glucose",
  low_warning: "Low Glucose Warning",
  high_warning: "High Glucose Warning",
  high_urgent: "Urgent High Glucose",
  iob_warning: "Insulin on Board Warning",
  no_data: "No CGM Data",
};

export function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 0) return "just now";
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export function formatCountdown(expiresAt: string): string | null {
  const remaining = new Date(expiresAt).getTime() - Date.now();
  if (remaining <= 0) return null;
  const totalSeconds = Math.floor(remaining / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function formatAlertTitle(alertType: string): string {
  return (
    ALERT_TYPE_LABELS[alertType] ??
    alertType
      .replace(/_/g, " ")
      .replace(/\b\w/g, (character) => character.toUpperCase())
  );
}

interface AlertGlucoseFields {
  alert_type: string;
  current_value: number;
  predicted_value: number | null;
  prediction_minutes: number | null;
  message: string;
}

export function formatAlertSummary(
  alert: AlertGlucoseFields,
  unit: GlucoseUnit,
): string {
  if (alert.alert_type === "iob_warning" || alert.alert_type === "no_data") {
    return alert.message;
  }
  const title = formatAlertTitle(alert.alert_type);
  const current = `${formatGlucose(alert.current_value, unit)} ${unitLabel(unit)}`;
  if (alert.predicted_value != null && alert.prediction_minutes != null) {
    const predicted = `${formatGlucose(alert.predicted_value, unit)} ${unitLabel(unit)}`;
    return `${title}: ${current} → ${predicted} in ${alert.prediction_minutes}min`;
  }
  return `${title}: ${current}`;
}
