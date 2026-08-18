import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";

import type { AlertEventData } from "@/hooks/use-glucose-stream";
import { playAlertSound } from "@/lib/audio";
import { showBrowserNotification } from "@/lib/browser-notifications";
import {
  NotificationsProvider,
  useNotifications,
} from "./NotificationsProvider";

let mockAlertCallback: ((alert: AlertEventData) => void) | undefined;

jest.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
    article: ({
      animate: _animate,
      children,
      exit: _exit,
      initial: _initial,
      layout: _layout,
      transition: _transition,
      ...props
    }: ComponentProps<"article"> & {
      animate?: unknown;
      exit?: unknown;
      initial?: unknown;
      layout?: unknown;
      transition?: unknown;
    }) => <article {...props}>{children}</article>,
  },
}));

jest.mock("@/providers/glucose-stream-provider", () => ({
  GlucoseStreamProvider: ({
    children,
    onAlertReceived,
  }: {
    children: ReactNode;
    onAlertReceived?: (alert: AlertEventData) => void;
  }) => {
    mockAlertCallback = onAlertReceived;
    return <>{children}</>;
  },
}));

jest.mock("@/hooks/use-glucose-unit", () => ({
  useGlucoseUnit: () => "mgdl",
}));

jest.mock("@/hooks/use-reduced-motion", () => ({
  useReducedMotion: () => false,
}));

jest.mock("@/lib/audio", () => ({
  playAlertSound: jest.fn(),
}));

jest.mock("@/lib/browser-notifications", () => ({
  showBrowserNotification: jest.fn(),
}));

function TriggerNotifications() {
  const { notify, notifyError, notifySuccess, notifyWarning, setPreferences } =
    useNotifications();

  return (
    <>
      <button
        type="button"
        onClick={() =>
          notify("Profile updated", {
            message: "Changes are now visible across the dashboard.",
          })
        }
      >
        Show neutral
      </button>
      <button type="button" onClick={() => notifySuccess("Saved successfully")}>
        Show success
      </button>
      <button type="button" onClick={() => notifyWarning("Check your values")}>
        Show warning
      </button>
      <button type="button" onClick={() => notifyError("Save failed")}>
        Show error
      </button>
      <button
        type="button"
        onClick={() => {
          for (let index = 1; index <= 6; index += 1) {
            notify(`Queued notification ${index}`, { durationMs: 60000 });
          }
        }}
      >
        Fill queue
      </button>
      <button
        type="button"
        onClick={() =>
          setPreferences({
            browserNotificationsEnabled: true,
            soundEnabled: false,
          })
        }
      >
        Change alert preferences
      </button>
      <button
        type="button"
        onClick={() =>
          setPreferences({
            browserNotificationsEnabled: true,
            soundEnabled: true,
          })
        }
      >
        Enable alert delivery
      </button>
    </>
  );
}

function makeAlert(overrides: Partial<AlertEventData> = {}): AlertEventData {
  return {
    alert_type: "low_warning",
    created_at: "2026-07-29T08:00:00Z",
    current_value: 62,
    event: "alert",
    expires_at: "2026-07-29T08:30:00Z",
    id: "alert-1",
    iob_value: null,
    message: "Legacy persisted alert message",
    predicted_value: 54,
    prediction_minutes: 30,
    severity: "warning",
    source: "predictive",
    trend_rate: -2,
    ...overrides,
  };
}

describe("NotificationsProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    mockAlertCallback = undefined;
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("exposes neutral, success, warning, and error notifications", () => {
    render(
      <NotificationsProvider>
        <TriggerNotifications />
      </NotificationsProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Show neutral" }));
    fireEvent.click(screen.getByRole("button", { name: "Show success" }));
    fireEvent.click(screen.getByRole("button", { name: "Show warning" }));
    fireEvent.click(screen.getByRole("button", { name: "Show error" }));

    const neutralNotification = screen
      .getByText("Profile updated")
      .closest("[data-variant='neutral']");
    expect(neutralNotification).toBeInTheDocument();
    expect(
      neutralNotification?.querySelector("[aria-hidden='true']"),
    ).toHaveClass("bg-signal-info-fill");
    expect(
      screen
        .getByText("Saved successfully")
        .closest("[data-variant='success']"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Check your values").closest("[data-variant='warning']"),
    ).toHaveAttribute("role", "alert");
    expect(
      screen.getByText("Save failed").closest("[data-variant='error']"),
    ).toHaveAttribute("role", "alert");
    expect(
      screen.getByText("Changes are now visible across the dashboard."),
    ).toBeInTheDocument();
  });

  it("anchors notifications at the bottom right and dismisses them", async () => {
    render(
      <NotificationsProvider>
        <TriggerNotifications />
      </NotificationsProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Show neutral" }));

    const region = screen.getByRole("region", { name: "Notifications" });
    expect(region).toHaveClass(
      "right-4",
      "z-[60]",
      "flex-col-reverse",
      "bottom-[calc(6rem+env(safe-area-inset-bottom))]",
      "lg:bottom-[calc(1rem+env(safe-area-inset-bottom))]",
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Close notification: Profile updated",
      }),
    );

    await waitFor(() => {
      expect(screen.queryByText("Profile updated")).not.toBeInTheDocument();
    });
  });

  it("shows at most five notifications and promotes queued items in order", async () => {
    render(
      <NotificationsProvider>
        <TriggerNotifications />
      </NotificationsProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Fill queue" }));

    const region = screen.getByRole("region", { name: "Notifications" });
    expect(within(region).getAllByRole("status")).toHaveLength(5);
    expect(
      within(region).queryByText("Queued notification 6"),
    ).not.toBeInTheDocument();

    fireEvent.click(
      within(region).getByRole("button", {
        name: "Close notification: Queued notification 5",
      }),
    );

    await waitFor(() => {
      expect(
        within(region).getByText("Queued notification 6"),
      ).toBeInTheDocument();
    });
    expect(within(region).getAllByRole("status")).toHaveLength(5);
  });

  it("starts a queued notification timer when the notification becomes visible", async () => {
    jest.useFakeTimers();

    render(
      <NotificationsProvider>
        <TriggerNotifications />
      </NotificationsProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Fill queue" }));
    const region = screen.getByRole("region", { name: "Notifications" });

    act(() => {
      jest.advanceTimersByTime(59_999);
    });
    fireEvent.click(
      within(region).getByRole("button", {
        name: "Close notification: Queued notification 5",
      }),
    );
    act(() => {
      jest.advanceTimersByTime(0);
    });

    expect(
      within(region).getByText("Queued notification 6"),
    ).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(1_000);
    });

    expect(
      within(region).getByText("Queued notification 6"),
    ).toBeInTheDocument();
  });

  it("turns glucose stream alerts into redesigned notifications", () => {
    render(
      <NotificationsProvider>
        <TriggerNotifications />
      </NotificationsProvider>,
    );

    act(() => {
      mockAlertCallback?.(makeAlert());
    });

    const notification = screen
      .getByText("WARNING")
      .closest("[data-variant='warning']");

    expect(notification).toHaveAttribute("role", "alert");
    expect(
      within(notification as HTMLElement).getByText(
        "Low Glucose Warning: 62 mg/dL → 54 mg/dL in 30min",
      ),
    ).toBeInTheDocument();
    expect(playAlertSound).toHaveBeenCalledWith("warning");
  });

  it("preserves alert preferences for sound and browser delivery", () => {
    render(
      <NotificationsProvider>
        <TriggerNotifications />
      </NotificationsProvider>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Change alert preferences" }),
    );

    act(() => {
      mockAlertCallback?.(makeAlert({ id: "urgent-1", severity: "urgent" }));
    });

    const urgentNotification = screen
      .getByText("URGENT")
      .closest("[data-variant='error']");
    expect(urgentNotification).toBeInTheDocument();
    expect(
      urgentNotification?.querySelector("[aria-hidden='true']"),
    ).toHaveClass("bg-signal-error-fill");
    expect(playAlertSound).not.toHaveBeenCalled();
    expect(showBrowserNotification).toHaveBeenCalledWith(
      "urgent",
      "Low Glucose Warning: 62 mg/dL → 54 mg/dL in 30min",
    );
    expect(
      JSON.parse(localStorage.getItem("glycemicgpt-alert-preferences")!),
    ).toEqual({
      browserNotificationsEnabled: true,
      soundEnabled: false,
    });
  });

  it("delivers duplicate alerts only once", () => {
    render(
      <NotificationsProvider>
        <TriggerNotifications />
      </NotificationsProvider>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Enable alert delivery" }),
    );
    const alert = makeAlert({ id: "urgent-duplicate", severity: "urgent" });

    act(() => {
      mockAlertCallback?.(alert);
      mockAlertCallback?.(alert);
    });

    expect(screen.getAllByText("URGENT")).toHaveLength(1);
    expect(playAlertSound).toHaveBeenCalledTimes(1);
    expect(showBrowserNotification).toHaveBeenCalledTimes(1);
  });

  it("re-delivers an active urgent alert after its notification times out", () => {
    jest.useFakeTimers();

    render(
      <NotificationsProvider>
        <TriggerNotifications />
      </NotificationsProvider>,
    );

    const alert = makeAlert({ id: "timed-out-urgent", severity: "urgent" });
    act(() => {
      mockAlertCallback?.(alert);
    });

    expect(screen.getByText("URGENT")).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(30_000);
    });

    expect(screen.queryByText("URGENT")).not.toBeInTheDocument();
    expect(sessionStorage.getItem("glycemicgpt-dismissed-alerts")).toBeNull();

    act(() => {
      mockAlertCallback?.(alert);
    });

    expect(screen.getByText("URGENT")).toBeInTheDocument();
    expect(playAlertSound).toHaveBeenCalledTimes(2);
  });

  it("persists alert dismissal and ignores a re-delivered alert", async () => {
    render(
      <NotificationsProvider>
        <TriggerNotifications />
      </NotificationsProvider>,
    );

    const alert = makeAlert({ id: "dismissed-alert" });
    act(() => {
      mockAlertCallback?.(alert);
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Close notification: WARNING" }),
    );

    await waitFor(() => {
      expect(screen.queryByText("WARNING")).not.toBeInTheDocument();
    });
    expect(
      JSON.parse(sessionStorage.getItem("glycemicgpt-dismissed-alerts")!),
    ).toContain("dismissed-alert");

    act(() => {
      mockAlertCallback?.(alert);
    });

    expect(screen.queryByText("WARNING")).not.toBeInTheDocument();
    expect(playAlertSound).toHaveBeenCalledTimes(1);
    expect(showBrowserNotification).not.toHaveBeenCalled();
  });

  it("keeps emergency alerts visible until they are dismissed", () => {
    jest.useFakeTimers();

    render(
      <NotificationsProvider>
        <TriggerNotifications />
      </NotificationsProvider>,
    );

    act(() => {
      mockAlertCallback?.(
        makeAlert({ id: "emergency-1", severity: "emergency" }),
      );
      jest.advanceTimersByTime(120000);
    });

    expect(screen.getByText("EMERGENCY")).toBeInTheDocument();
  });
});
