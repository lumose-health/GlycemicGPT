"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Button, Icon } from "@/base";
import type { AlertEventData } from "@/hooks/use-glucose-stream";
import { useGlucoseUnit } from "@/hooks/use-glucose-unit";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { formatAlertSummary } from "@/lib/alert-format";
import { playAlertSound } from "@/lib/audio";
import { showBrowserNotification } from "@/lib/browser-notifications";
import { twMerge } from "@/lib/ui/twMerge";
import { GlucoseStreamProvider } from "@/providers/glucose-stream-provider";
import {
  ALERT_DURATION_MS,
  ALERT_VARIANT,
  DEFAULT_DURATION_MS,
  DEFAULT_PREFERENCES,
  DISMISSED_KEY,
  INITIAL_NOTIFICATION_STATE,
  MAX_DISMISSED_IDS,
  MAX_VISIBLE_NOTIFICATIONS,
  NotificationsContext,
  PREFS_KEY,
  VARIANT_ACCENT_CLASS,
} from "./const";
import type {
  AlertPreferences,
  InternalNotificationOptions,
  NotificationItem,
  NotificationsContextValue,
  NotificationsProviderProps,
  NotificationState,
  NotificationVariant,
} from "./NotificationsProvider.types";

function loadPreferences(): AlertPreferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;

  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFERENCES;

    const parsed = JSON.parse(raw) as Partial<AlertPreferences>;
    return {
      soundEnabled:
        typeof parsed.soundEnabled === "boolean"
          ? parsed.soundEnabled
          : DEFAULT_PREFERENCES.soundEnabled,
      browserNotificationsEnabled:
        typeof parsed.browserNotificationsEnabled === "boolean"
          ? parsed.browserNotificationsEnabled
          : DEFAULT_PREFERENCES.browserNotificationsEnabled,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function savePreferences(preferences: AlertPreferences): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(preferences));
  } catch {
    // Storage can be unavailable without preventing in-app notifications.
  }
}

function getDismissedAlerts(): Set<string> {
  if (typeof window === "undefined") return new Set();

  try {
    const raw = sessionStorage.getItem(DISMISSED_KEY);
    if (!raw) return new Set();

    const ids = JSON.parse(raw);
    if (!Array.isArray(ids)) return new Set();

    return new Set(
      ids
        .filter((id): id is string => typeof id === "string")
        .slice(-MAX_DISMISSED_IDS),
    );
  } catch {
    return new Set();
  }
}

function addDismissedAlert(id: string): void {
  try {
    const ids = [...getDismissedAlerts(), id].slice(-MAX_DISMISSED_IDS);
    sessionStorage.setItem(DISMISSED_KEY, JSON.stringify(ids));
  } catch {
    // Storage can be unavailable without preventing dismissal.
  }
}

function promoteQueuedItems(current: NotificationState): NotificationState {
  const openSlotCount = Math.max(
    0,
    MAX_VISIBLE_NOTIFICATIONS - current.visibleItems.length,
  );

  if (openSlotCount === 0 || current.queuedItems.length === 0) {
    return {
      ...current,
      exitWindowEndsAt: null,
      exitingCount: 0,
    };
  }

  const promotedItems = current.queuedItems.slice(0, openSlotCount);

  return {
    exitWindowEndsAt: null,
    exitingCount: 0,
    queuedItems: current.queuedItems.slice(openSlotCount),
    visibleItems: [...promotedItems.reverse(), ...current.visibleItems],
  };
}

export function NotificationsProvider({
  children,
}: NotificationsProviderProps) {
  const [preferences, setPreferencesState] =
    useState<AlertPreferences>(DEFAULT_PREFERENCES);
  const [state, setState] = useState<NotificationState>(
    INITIAL_NOTIFICATION_STATE,
  );
  const nextIdRef = useRef(0);
  const dismissedAlertsRef = useRef(getDismissedAlerts());
  const preferencesRef = useRef(preferences);
  const unit = useGlucoseUnit();
  const unitRef = useRef(unit);
  const prefersReducedMotion = useReducedMotion();
  const isTestEnvironment = process.env.NODE_ENV === "test";
  const motionMode = prefersReducedMotion ? "fade" : "slide";
  const exitDurationMs = isTestEnvironment
    ? 0
    : prefersReducedMotion
      ? 160
      : 220;

  useEffect(() => {
    setPreferencesState(loadPreferences());
  }, []);

  useEffect(() => {
    preferencesRef.current = preferences;
  }, [preferences]);

  useEffect(() => {
    unitRef.current = unit;
  }, [unit]);

  const setPreferences = useCallback(
    (nextPreferences: AlertPreferences) => {
      setPreferencesState(nextPreferences);
      savePreferences(nextPreferences);
    },
    [],
  );

  const dismissNotification = useCallback(
    (notificationId: string) => {
      setState((current) => {
        const dismissedItem = current.visibleItems.find(
          (item) => item.id === notificationId,
        );
        if (!dismissedItem) return current;

        if (dismissedItem.sourceAlertId) {
          addDismissedAlert(dismissedItem.sourceAlertId);
          dismissedAlertsRef.current.add(dismissedItem.sourceAlertId);
        }

        return {
          exitWindowEndsAt: Date.now() + exitDurationMs,
          exitingCount: current.exitingCount + 1,
          queuedItems: current.queuedItems,
          visibleItems: current.visibleItems.filter(
            (item) => item.id !== notificationId,
          ),
        };
      });
    },
    [exitDurationMs],
  );

  const pauseNotification = useCallback((notificationId: string) => {
    setState((current) => ({
      ...current,
      visibleItems: current.visibleItems.map((item) => {
        if (item.id !== notificationId || item.dismissAt === null) return item;

        return {
          ...item,
          pausedRemainingMs: Math.max(0, item.dismissAt - Date.now()),
        };
      }),
    }));
  }, []);

  const resumeNotification = useCallback((notificationId: string) => {
    setState((current) => ({
      ...current,
      visibleItems: current.visibleItems.map((item) => {
        if (item.id !== notificationId || item.pausedRemainingMs === null) {
          return item;
        }

        return {
          ...item,
          dismissAt: Date.now() + item.pausedRemainingMs,
          pausedRemainingMs: null,
        };
      }),
    }));
  }, []);

  useEffect(() => {
    const timers = state.visibleItems.flatMap((item) => {
      if (item.dismissAt === null || item.pausedRemainingMs !== null) return [];

      return [
        window.setTimeout(
          () => dismissNotification(item.id),
          Math.max(0, item.dismissAt - Date.now()),
        ),
      ];
    });

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [dismissNotification, state.visibleItems]);

  useEffect(() => {
    if (state.exitingCount === 0 || state.exitWindowEndsAt === null) return;

    const timer = window.setTimeout(() => {
      setState((current) => promoteQueuedItems(current));
    }, Math.max(0, state.exitWindowEndsAt - Date.now()));

    return () => window.clearTimeout(timer);
  }, [state.exitWindowEndsAt, state.exitingCount]);

  const pushNotification = useCallback(
    (
      variant: NotificationVariant,
      title: string,
      options?: InternalNotificationOptions,
    ) => {
      setState((current) => {
        nextIdRef.current += 1;
        const id = options?.id ?? `notification-${nextIdRef.current}`;

        if (
          current.visibleItems.some((item) => item.id === id) ||
          current.queuedItems.some((item) => item.id === id)
        ) {
          return current;
        }

        const durationMs =
          options?.durationMs === undefined
            ? DEFAULT_DURATION_MS[variant]
            : options.durationMs;
        const createdItem: NotificationItem = {
          announcement:
            options?.announcement ??
            (variant === "warning" || variant === "error"
              ? "alert"
              : "status"),
          dismissAt:
            durationMs === null ? null : Date.now() + Math.max(0, durationMs),
          id,
          message: options?.message,
          pausedRemainingMs: null,
          sourceAlertId: options?.sourceAlertId,
          title,
          variant,
        };

        if (
          current.visibleItems.length + current.exitingCount <
          MAX_VISIBLE_NOTIFICATIONS
        ) {
          return {
            ...current,
            visibleItems: [createdItem, ...current.visibleItems],
          };
        }

        return {
          ...current,
          queuedItems: [...current.queuedItems, createdItem],
        };
      });
    },
    [],
  );

  const handleAlertReceived = useCallback(
    (alert: AlertEventData) => {
      if (dismissedAlertsRef.current.has(alert.id)) return;

      pushNotification(
        ALERT_VARIANT[alert.severity],
        alert.severity.toUpperCase(),
        {
          announcement: "alert",
          durationMs: ALERT_DURATION_MS[alert.severity],
          id: `alert-${alert.id}`,
          message: formatAlertSummary(alert, unitRef.current),
          sourceAlertId: alert.id,
        },
      );

      if (preferencesRef.current.soundEnabled) {
        void playAlertSound(alert.severity);
      }

      if (
        preferencesRef.current.browserNotificationsEnabled &&
        (alert.severity === "urgent" || alert.severity === "emergency")
      ) {
        showBrowserNotification(
          alert.severity,
          formatAlertSummary(alert, unitRef.current),
        );
      }
    },
    [pushNotification],
  );

  const contextValue = useMemo<NotificationsContextValue>(
    () => ({
      preferences,
      setPreferences,
      notify: (title, options) =>
        pushNotification("neutral", title, options),
      notifySuccess: (title, options) =>
        pushNotification("success", title, options),
      notifyWarning: (title, options) =>
        pushNotification("warning", title, options),
      notifyError: (title, options) =>
        pushNotification("error", title, options),
    }),
    [preferences, pushNotification, setPreferences],
  );

  return (
    <NotificationsContext.Provider value={contextValue}>
      <GlucoseStreamProvider onAlertReceived={handleAlertReceived}>
        {children}
        <section
          aria-label="Notifications"
          className="pointer-events-none fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] right-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col-reverse gap-3 lg:bottom-[calc(1rem+env(safe-area-inset-bottom))]"
        >
          <AnimatePresence initial={false}>
            {state.visibleItems.map((item) => (
              <motion.article
                animate={
                  motionMode === "fade"
                    ? { opacity: 1 }
                    : { opacity: 1, x: 0 }
                }
                className="pointer-events-auto overflow-hidden rounded-panel border border-border-default bg-surface-elevated text-foreground-primary shadow-2xl"
                data-motion={motionMode}
                data-variant={item.variant}
                exit={
                  motionMode === "fade"
                    ? { opacity: 0 }
                    : { opacity: 0, x: 28 }
                }
                initial={
                  motionMode === "fade"
                    ? { opacity: 0 }
                    : { opacity: 0, x: 28 }
                }
                key={item.id}
                layout="position"
                onMouseEnter={() => pauseNotification(item.id)}
                onMouseLeave={() => resumeNotification(item.id)}
                role={item.announcement}
                transition={
                  isTestEnvironment
                    ? { duration: 0 }
                    : motionMode === "fade"
                      ? { duration: 0.16, ease: "easeOut" }
                      : {
                          layout: {
                            damping: 34,
                            mass: 0.85,
                            stiffness: 420,
                            type: "spring",
                          },
                          opacity: { duration: 0.16, ease: "easeOut" },
                          x: {
                            duration: 0.22,
                            ease: [0.16, 1, 0.3, 1],
                          },
                        }
                }
              >
                <div className="flex">
                  <div
                    aria-hidden="true"
                    className={twMerge(
                      "w-1 self-stretch",
                      VARIANT_ACCENT_CLASS[item.variant],
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <header className="flex items-center justify-between gap-3 border-b border-border-default bg-surface-secondary py-1.5 pl-4 pr-1.5">
                      <h2 className="font_metric_caption">{item.title}</h2>
                      <Button
                        aria-label={`Close notification: ${item.title}`}
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-button text-foreground-primary transition-colors hover:bg-surface-tertiary hover:text-foreground-primary focus:outline-hidden focus-visible:ring-2 focus-visible:ring-border-active"
                        onClick={() => dismissNotification(item.id)}
                      >
                        <Icon className="h-4 w-4" decorative icon="x" />
                      </Button>
                    </header>
                    {item.message ? (
                      <div className="px-4 py-3">
                        <p className="font_body_3 text-foreground-primary">
                          {item.message}
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>
              </motion.article>
            ))}
          </AnimatePresence>
        </section>
      </GlucoseStreamProvider>
    </NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsContextValue {
  const context = useContext(NotificationsContext);

  if (!context) {
    throw new Error(
      "useNotifications must be used within NotificationsProvider",
    );
  }

  return context;
}
