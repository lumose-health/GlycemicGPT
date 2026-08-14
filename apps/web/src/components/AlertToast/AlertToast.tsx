"use client";
/**
 * Story 6.3: Toast notification component for real-time alerts.
 *
 * Displays severity-appropriate toast notifications with auto-dismiss
 * timers that vary by urgency. EMERGENCY alerts never auto-dismiss.
 *
 * Accessibility: role="alert" on each toast. The parent container
 * provides the persistent aria-live region.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { Button, Icon } from "@/base";
import { formatAlertSummary } from "@/lib/alert-format";
import { twMerge } from "@/lib/ui/twMerge";
import { getAlertIconName } from "@/lib/ui/alertPresentation";
import type { AlertToastProps } from "./AlertToast.types";
const TOAST_CONFIG: Record<
  string,
  {
    bg: string;
    border: string;
    text: string;
    duration: number;
    animation: string;
  }
> = {
  emergency: {
    bg: "bg-signal-error-fill/20",
    border: "border-signal-error-fill",
    text: "text-signal-error-text",
    duration: 0, // Never auto-dismiss
    animation: "animate-pulse-fast",
  },
  urgent: {
    bg: "bg-signal-warning-fill/20",
    border: "border-signal-warning-fill",
    text: "text-signal-warning-text",
    duration: 30000,
    animation: "animate-pulse-slow",
  },
  warning: {
    bg: "bg-signal-warning-fill/20",
    border: "border-signal-warning-fill",
    text: "text-signal-warning-text",
    duration: 15000,
    animation: "",
  },
  info: {
    bg: "bg-accent/20",
    border: "border-accent",
    text: "text-accent",
    duration: 10000,
    animation: "",
  },
};
export function AlertToast({
  alert,
  onDismiss,
  unit = "mgdl",
}: AlertToastProps) {
  const config = TOAST_CONFIG[alert.severity] ?? TOAST_CONFIG.info;
  const [isVisible, setIsVisible] = useState(true);
  const alertIcon = getAlertIconName(alert.alert_type);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleDismiss = useCallback(() => {
    setIsVisible(false);
    dismissTimerRef.current = setTimeout(() => onDismiss(alert.id), 300);
  }, [onDismiss, alert.id]);
  // Clean up dismiss animation timer on unmount (Fix #6)
  useEffect(() => {
    return () => {
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
      }
    };
  }, []);
  useEffect(() => {
    if (config.duration > 0) {
      const timer = setTimeout(handleDismiss, config.duration);
      return () => clearTimeout(timer);
    }
  }, [config.duration, handleDismiss]);
  return (
    <div
      className={twMerge(
        "rounded-panel border p-4 shadow-lg backdrop-blur-xs transition-all duration-300 w-80",
        config.bg,
        config.border,
        config.animation,
        isVisible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-4",
      )}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <Icon
          decorative
          icon={alertIcon}
          className={twMerge("h-5 w-5 mt-0.5 shrink-0", config.text)}
        />
        <div className="flex-1 min-w-0">
          <div
            className={twMerge(
              "font_metric_caption uppercase mb-1",
              config.text,
            )}
          >
            {alert.severity}
          </div>
          <p className={twMerge("font_body_3", config.text)}>
            {formatAlertSummary(alert, unit)}
          </p>
        </div>
        <Button
          onClick={handleDismiss}
          className={twMerge(
            "p-1 rounded-panel hover:bg-surface-tertiary/50 transition-colors shrink-0",
            config.text,
          )}
          aria-label="Dismiss alert notification"
        >
          <Icon decorative icon="x" className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
