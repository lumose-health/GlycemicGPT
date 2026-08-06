import type { NotificationVariant } from "@/compositions/NotificationsProvider";

import type {
  MockNotificationPreset,
  MockNotificationRequest,
} from "./notification-controls.types";

export const MOCK_NOTIFICATION_EVENT_NAME = "glycemicgpt:mock-notification";

export const MOCK_NOTIFICATION_PRESETS: Record<
  NotificationVariant,
  MockNotificationPreset
> = {
  neutral: {
    buttonLabel: "Neutral",
    options: {
      message: "This is a neutral notification for general information.",
    },
    title: "Settings information",
    variant: "neutral",
  },
  success: {
    buttonLabel: "Success",
    options: {
      message: "Your changes were saved successfully.",
    },
    title: "Settings saved",
    variant: "success",
  },
  warning: {
    buttonLabel: "Warning",
    options: {
      message: "Review the highlighted settings before continuing.",
    },
    title: "Check your settings",
    variant: "warning",
  },
  error: {
    buttonLabel: "Error",
    options: {
      message: "Something went wrong while saving your changes.",
    },
    title: "Settings could not be saved",
    variant: "error",
  },
};

export const MOCK_NOTIFICATION_VARIANTS = Object.keys(
  MOCK_NOTIFICATION_PRESETS,
) as NotificationVariant[];

export const MOCK_NOTIFICATION_QUEUE_SIZE = 6;

export function dispatchMockNotification(
  request: MockNotificationRequest,
): void {
  window.dispatchEvent(
    new CustomEvent<MockNotificationRequest>(MOCK_NOTIFICATION_EVENT_NAME, {
      detail: request,
    }),
  );
}

export function dispatchMockNotificationPreset(
  variant: NotificationVariant,
): void {
  dispatchMockNotification(MOCK_NOTIFICATION_PRESETS[variant]);
}

export function dispatchMockNotificationQueue(): void {
  Array.from({ length: MOCK_NOTIFICATION_QUEUE_SIZE }, (_, index) => {
    dispatchMockNotification({
      options: {
        durationMs: null,
        message: "Dismiss a notification to promote the queued item.",
      },
      title: `Queue notification ${index + 1}`,
      variant: "neutral",
    });
  });
}
