import type {
  NotificationOptions,
  NotificationVariant,
} from "@/compositions/NotificationsProvider";

export interface MockNotificationRequest {
  options?: NotificationOptions;
  title: string;
  variant: NotificationVariant;
}

export interface MockNotificationPreset extends MockNotificationRequest {
  buttonLabel: string;
}
