"use client";
/**
 * Story 6.4: AlertCard Component with Acknowledgment.
 *
 * Displays a predictive alert with severity styling, glucose values,
 * prediction details, countdown timer, and a large acknowledge button
 * (56px min-height for hypoglycemia fine motor control).
 *
 * Accessibility: role="alert", aria-labels, focus-visible rings, 56px touch target.
 */
import { useEffect, useRef, useState } from "react";
import { Button, Icon } from "@/base";
import {
  formatAlertTitle,
  formatCountdown,
  formatTimeAgo,
} from "@/lib/alert-format";
import { twMerge } from "@/lib/ui/twMerge";
import {
  ALERT_SEVERITY_PRESENTATION,
  getAlertIconName,
} from "@/lib/ui/alertPresentation";
import { formatGlucose, formatTrendRate, unitLabel } from "@/lib/glucose-units";
import { EscalationTimeline } from "@/components/EscalationTimeline";
import type { AlertCardProps } from "./AlertCard.types";
export function AlertCard({
  alert,
  onAcknowledge,
  isAcknowledging = false,
  unit = "mgdl",
}: AlertCardProps) {
  const config =
    ALERT_SEVERITY_PRESENTATION[alert.severity] ??
    ALERT_SEVERITY_PRESENTATION.info;
  const alertIcon = getAlertIconName(alert.alert_type);
  const title = formatAlertTitle(alert.alert_type);
  // Countdown timer
  const [countdown, setCountdown] = useState<string | null>(() =>
    formatCountdown(alert.expires_at),
  );
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      const remaining = formatCountdown(alert.expires_at);
      setCountdown(remaining);
      if (remaining === null && intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }, 1000);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [alert.expires_at]);
  const isExpired = countdown === null;
  return (
    <div
      className={twMerge(
        "rounded-panel border p-5 transition-all",
        config.bg,
        config.border,
        config.animation,
      )}
      role="alert"
      aria-label={`${alert.severity} alert: ${title}`}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <Icon
          decorative
          icon={alertIcon}
          className={twMerge("h-5 w-5 shrink-0", config.icon)}
        />
        <span className={twMerge("font_metric_caption uppercase", config.text)}>
          {alert.severity}
        </span>
        <span className="font_body_3 text-foreground-primary">{title}</span>
        {alert.source === "predictive" && (
          <span className="ml-auto font_metric_caption text-foreground-secondary">
            Predicted
          </span>
        )}
      </div>
      {/* Glucose values */}
      <div className="flex items-baseline gap-4 mb-3">
        <div>
          <span className={twMerge("font_header_3", config.text)}>
            {formatGlucose(alert.current_value, unit)}
          </span>
          <span className="font_body_3 text-foreground-secondary ml-1">
            {unitLabel(unit)}
          </span>
        </div>
        {alert.predicted_value != null && alert.prediction_minutes != null && (
          <div className="font_body_3 text-foreground-secondary">
            <span className="mr-1">&rarr;</span>
            <span className={twMerge("font_metric_label", config.text)}>
              {formatGlucose(alert.predicted_value, unit)}
            </span>
            <span className="ml-1">
              {unitLabel(unit)} in {alert.prediction_minutes}min
            </span>
          </div>
        )}
      </div>
      {/* The glucose value/prediction is already rendered live, in the active
          unit, in the block above — so no message echo is shown for glucose
          alerts (and the persisted mg/dL string is never the display source on a
          mmol surface). IoB warnings are the exception: their threshold context
          lives only in the message, and it is in insulin units, so it is never
          unit-stale and is shown verbatim. */}
      {alert.alert_type === "iob_warning" && (
        <p className={twMerge("font_body_3 mb-3", config.text)}>
          {alert.message}
        </p>
      )}
      {/* Metadata */}
      <div className="flex items-center gap-4 mb-4 font_metric_caption text-foreground-secondary">
        <span className="flex items-center gap-1">
          <Icon decorative icon="clock" className="h-3 w-3" />
          {formatTimeAgo(alert.created_at)}
        </span>
        {alert.iob_value != null && (
          <span>IoB: {alert.iob_value.toFixed(2)}u</span>
        )}
        {alert.trend_rate != null && (
          <span>
            {alert.trend_rate > 0 ? "+" : ""}
            {formatTrendRate(alert.trend_rate, unit)} {unitLabel(unit)}/min
          </span>
        )}
      </div>
      {/* Countdown timer */}
      {!isExpired && (
        <div
          className="flex items-center gap-2 mb-4 font_metric_caption text-foreground-secondary"
          aria-hidden="true"
        >
          <Icon decorative icon="clock" className="h-3 w-3" />
          <span>Expires in {countdown}</span>
        </div>
      )}
      {isExpired && (
        <div className="flex items-center gap-2 mb-4 font_metric_caption text-foreground-secondary">
          <Icon decorative icon="clock" className="h-3 w-3" />
          <span>Expired</span>
        </div>
      )}
      {/* Acknowledge button - 56px min height for hypoglycemia fine motor control */}
      <Button
        type="button"
        onClick={() => onAcknowledge(alert.id)}
        disabled={isAcknowledging || isExpired}
        className={twMerge(
          "flex items-center justify-center gap-2 w-full rounded-panel",
          "min-h-[56px] px-4 py-3 font_header_4",
          "transition-colors",
          "focus:outline-hidden focus-visible:ring-2 focus-visible:ring-border-active",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          isExpired
            ? "bg-surface-secondary/30 text-foreground-primary"
            : "bg-surface-secondary/50 text-foreground-primary hover:bg-surface-tertiary",
        )}
        aria-label={`Acknowledge ${alert.alert_type.replace(/_/g, "")} alert`}
      >
        {isAcknowledging ? (
          <Icon decorative icon="sync" className="h-5 w-5 animate-spin" />
        ) : (
          <Icon decorative icon="circle-check" className="h-5 w-5" />
        )}
        {isAcknowledging ? "Acknowledging..." : "Acknowledge"}
      </Button>
      {/* Escalation timeline for critical alerts (Story 6.7) */}
      {(alert.severity === "urgent" || alert.severity === "emergency") &&
        !alert.acknowledged && <EscalationTimeline alertId={alert.id} />}
    </div>
  );
}
