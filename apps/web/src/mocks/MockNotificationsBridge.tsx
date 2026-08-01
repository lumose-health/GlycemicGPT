"use client";

import { useEffect } from "react";

import { useNotifications } from "@/compositions/NotificationsProvider";

import { MOCK_NOTIFICATION_EVENT_NAME } from "./notification-controls";
import type { MockNotificationRequest } from "./notification-controls.types";

export function MockNotificationsBridge() {
  const { notify, notifyError, notifySuccess, notifyWarning } =
    useNotifications();

  useEffect(() => {
    const handleNotificationRequest = (event: Event) => {
      const { options, title, variant } = (
        event as CustomEvent<MockNotificationRequest>
      ).detail;

      switch (variant) {
        case "success":
          notifySuccess(title, options);
          break;
        case "warning":
          notifyWarning(title, options);
          break;
        case "error":
          notifyError(title, options);
          break;
        default:
          notify(title, options);
      }
    };

    window.addEventListener(
      MOCK_NOTIFICATION_EVENT_NAME,
      handleNotificationRequest,
    );

    return () => {
      window.removeEventListener(
        MOCK_NOTIFICATION_EVENT_NAME,
        handleNotificationRequest,
      );
    };
  }, [notify, notifyError, notifySuccess, notifyWarning]);

  return null;
}
