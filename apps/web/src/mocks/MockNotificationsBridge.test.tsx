import { act, render } from "@testing-library/react";

import { useNotifications } from "@/compositions/NotificationsProvider";

import { MockNotificationsBridge } from "./MockNotificationsBridge";
import {
  dispatchMockNotification,
  MOCK_NOTIFICATION_PRESETS,
} from "./notification-controls";

jest.mock("@/compositions/NotificationsProvider", () => ({
  useNotifications: jest.fn(),
}));

const useNotificationsMock = jest.mocked(useNotifications);
const notify = jest.fn();
const notifyError = jest.fn();
const notifySuccess = jest.fn();
const notifyWarning = jest.fn();

describe("MockNotificationsBridge", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useNotificationsMock.mockReturnValue({
      notify,
      notifyError,
      notifySuccess,
      notifyWarning,
      preferences: {
        browserNotificationsEnabled: false,
        soundEnabled: false,
      },
      setPreferences: jest.fn(),
    });
  });

  it.each([
    ["neutral", notify],
    ["success", notifySuccess],
    ["warning", notifyWarning],
    ["error", notifyError],
  ] as const)(
    "routes a %s request through the V2 context",
    (variant, handler) => {
      render(<MockNotificationsBridge />);

      act(() => {
        dispatchMockNotification(MOCK_NOTIFICATION_PRESETS[variant]);
      });

      const preset = MOCK_NOTIFICATION_PRESETS[variant];
      expect(handler).toHaveBeenCalledWith(preset.title, preset.options);
    },
  );

  it("removes its event listener when unmounted", () => {
    const { unmount } = render(<MockNotificationsBridge />);
    unmount();

    act(() => {
      dispatchMockNotification(MOCK_NOTIFICATION_PRESETS.neutral);
    });

    expect(notify).not.toHaveBeenCalled();
  });
});
