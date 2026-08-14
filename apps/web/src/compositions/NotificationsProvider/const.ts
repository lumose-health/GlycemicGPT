import { createContext } from "react";

import type { AlertEventData } from "@/hooks/use-glucose-stream";
import type {
  AlertPreferences,
  NotificationsContextValue,
  NotificationState,
  NotificationVariant,
} from "./NotificationsProvider.types";

export const PREFS_KEY = "glycemicgpt-alert-preferences";
export const DISMISSED_KEY = "glycemicgpt-dismissed-alerts";
export const MAX_DISMISSED_IDS = 500;
export const MAX_VISIBLE_NOTIFICATIONS = 5;

export const DEFAULT_PREFERENCES: AlertPreferences = {
  soundEnabled: true,
  browserNotificationsEnabled: false,
};

export const INITIAL_NOTIFICATION_STATE: NotificationState = {
  exitWindowEndsAt: null,
  exitingCount: 0,
  queuedItems: [],
  visibleItems: [],
};

export const DEFAULT_DURATION_MS: Record<NotificationVariant, number> = {
  neutral: 4000,
  success: 4000,
  warning: 6000,
  error: 8000,
};

export const ALERT_DURATION_MS: Record<
  AlertEventData["severity"],
  number | null
> = {
  info: 10000,
  warning: 15000,
  urgent: 30000,
  emergency: null,
};

export const ALERT_VARIANT: Record<
  AlertEventData["severity"],
  NotificationVariant
> = {
  info: "neutral",
  warning: "warning",
  urgent: "error",
  emergency: "error",
};

export const VARIANT_ACCENT_CLASS: Record<NotificationVariant, string> = {
  neutral: "bg-signal-info-fill",
  success: "bg-signal-check-fill",
  warning: "bg-signal-warning-fill",
  error: "bg-signal-error-fill",
};

export const NotificationsContext =
  createContext<NotificationsContextValue | null>(null);
