import type { ReactNode } from "react";

export type NotificationVariant =
  | "neutral"
  | "success"
  | "warning"
  | "error";

export type NotificationAnnouncement = "alert" | "status";

export interface NotificationOptions {
  message?: string;
  /**
   * Overrides the variant default. Use null for a persistent notification.
   */
  durationMs?: number | null;
}

export interface AlertPreferences {
  soundEnabled: boolean;
  browserNotificationsEnabled: boolean;
}

export interface NotificationsContextValue {
  preferences: AlertPreferences;
  setPreferences: (preferences: AlertPreferences) => void;
  notify: (title: string, options?: NotificationOptions) => void;
  notifySuccess: (title: string, options?: NotificationOptions) => void;
  notifyWarning: (title: string, options?: NotificationOptions) => void;
  notifyError: (title: string, options?: NotificationOptions) => void;
}

export interface NotificationsProviderProps {
  children: ReactNode;
}

export interface NotificationItem extends NotificationOptions {
  announcement: NotificationAnnouncement;
  dismissAt: number | null;
  id: string;
  pausedRemainingMs: number | null;
  sourceAlertId?: string;
  title: string;
  variant: NotificationVariant;
}

export interface NotificationState {
  exitWindowEndsAt: number | null;
  exitingCount: number;
  queuedItems: NotificationItem[];
  visibleItems: NotificationItem[];
}

export interface InternalNotificationOptions extends NotificationOptions {
  announcement?: NotificationAnnouncement;
  id?: string;
  sourceAlertId?: string;
}
