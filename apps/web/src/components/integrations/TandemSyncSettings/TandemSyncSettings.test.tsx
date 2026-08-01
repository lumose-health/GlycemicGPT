import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  getTandemSyncAvailability,
  getTandemSyncStatus,
  importTandemRange,
  triggerTandemSync,
  updateTandemSyncSettings,
  type TandemSyncStatusResponse,
} from "@/lib/api";
import { TandemSyncSettings } from "./TandemSyncSettings";

const mockNotifyError = jest.fn();

jest.mock("@/lib/api", () => ({
  getTandemSyncAvailability: jest.fn(),
  getTandemSyncStatus: jest.fn(),
  importTandemRange: jest.fn(),
  triggerTandemSync: jest.fn(),
  updateTandemSyncSettings: jest.fn(),
}));

jest.mock("@/compositions/NotificationsProvider", () => ({
  useNotifications: () => ({
    notifyError: mockNotifyError,
  }),
}));

const syncStatus: TandemSyncStatusResponse = {
  enabled: true,
  events_available: 480,
  events_pulled_total: 12_840,
  integration_status: "connected",
  last_error: null,
  last_sync_at: "2026-07-28T06:39:19.000Z",
  needs_country_reselect: false,
  sync_interval_minutes: 60,
};

const mockedGetStatus = jest.mocked(getTandemSyncStatus);
const mockedGetAvailability = jest.mocked(getTandemSyncAvailability);
const mockedImportRange = jest.mocked(importTandemRange);
const mockedTriggerSync = jest.mocked(triggerTandemSync);
const mockedUpdateSettings = jest.mocked(updateTandemSyncSettings);

describe("TandemSyncSettings", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetStatus.mockResolvedValue(syncStatus);
    mockedGetAvailability.mockResolvedValue({
      earliest: "2026-06-01T00:00:00.000Z",
      latest: "2026-07-28T10:00:00.000Z",
      pump_count: 1,
    });
    mockedImportRange.mockResolvedValue({
      events_fetched: 12,
      events_stored: 8,
      message: "Import complete",
      profiles_stored: 1,
    });
    mockedTriggerSync.mockResolvedValue({
      events_fetched: 4,
      events_stored: 2,
      message: "Sync complete",
      profiles_stored: 1,
    });
    mockedUpdateSettings.mockImplementation(async ({ enabled }) => ({
      ...syncStatus,
      enabled,
    }));
  });

  it("uses the shared switch and a borderless Lumose layout", async () => {
    render(<TandemSyncSettings isOffline={false} />);

    const heading = await screen.findByRole("heading", {
      name: "Automatic pump sync",
    });
    const section = screen.getByTestId("tandem-sync-settings");
    const toggle = screen.getByRole("switch", {
      name: "Automatic pump sync",
    });
    const intervalTransition = screen.getByTestId(
      "tandem-sync-interval-transition",
    );

    expect(heading).toHaveClass("font_header_4", "text-foreground-primary");
    expect(section).not.toHaveClass("border");
    expect(toggle).toBeChecked();
    expect(intervalTransition).toHaveClass(
      "grid-rows-[1fr]",
      "opacity-100",
      "transition-[grid-template-rows,opacity]",
    );
    expect(intervalTransition).toHaveAttribute("aria-hidden", "false");
    expect(intervalTransition).not.toHaveAttribute("inert");
    expect(screen.getByText("12,840")).toBeInTheDocument();

    fireEvent.click(toggle);

    await waitFor(() =>
      expect(mockedUpdateSettings).toHaveBeenCalledWith({
        enabled: false,
        sync_interval_minutes: 60,
      }),
    );

    await waitFor(() => expect(toggle).not.toBeChecked());
    expect(
      screen.queryByText("Automatic sync disabled"),
    ).not.toBeInTheDocument();
    expect(mockNotifyError).not.toHaveBeenCalled();
    expect(intervalTransition).toHaveClass("grid-rows-[0fr]", "opacity-0");
    expect(intervalTransition).toHaveAttribute("aria-hidden", "true");
    expect(intervalTransition).toHaveAttribute("inert");
    expect(
      screen.getByLabelText("Sync interval (minutes)"),
    ).toBeInTheDocument();
  });

  it("loads disabled automatic sync as unchecked with its interval hidden", async () => {
    mockedGetStatus.mockResolvedValueOnce({
      ...syncStatus,
      enabled: false,
    });

    render(<TandemSyncSettings isOffline={false} />);

    const toggle = await screen.findByRole("switch", {
      name: "Automatic pump sync",
    });
    const intervalTransition = screen.getByTestId(
      "tandem-sync-interval-transition",
    );

    expect(toggle).not.toBeChecked();
    expect(intervalTransition).toHaveClass("grid-rows-[0fr]", "opacity-0");
    expect(intervalTransition).toHaveAttribute("aria-hidden", "true");
    expect(intervalTransition).toHaveAttribute("inert");
  });

  it("separates sync controls and presents timing and stats as read only information", async () => {
    render(<TandemSyncSettings isOffline={false} />);

    const heading = await screen.findByRole("heading", {
      name: "Automatic pump sync",
    });
    const automaticSection = heading.closest(
      '[data-testid="tandem-automatic-sync-section"]',
    );
    const intervalInput = screen.getByLabelText("Sync interval (minutes)");
    const intervalSection = intervalInput.closest(
      '[data-testid="tandem-sync-interval-section"]',
    );
    const intervalLayout = intervalSection?.firstElementChild;
    const intervalControls = screen.getByTestId(
      "tandem-sync-interval-controls",
    );
    const intervalAction = screen.getByTestId("tandem-sync-interval-action");
    const applyButton = screen.getByRole("button", {
      name: "Apply interval",
    });
    const availabilityButton = screen.getByRole("button", {
      name: "Check available data",
    });
    const importHeading = screen.getByRole("heading", {
      name: "Import pump history",
    });
    const importButton = screen.getByRole("button", {
      name: "Import history",
    });
    const importControls = screen.getByTestId("tandem-import-controls");
    const importTimeRange = screen.getByTestId("tandem-import-time-range");
    const importAction = screen.getByTestId("tandem-import-action");
    const timeRangeTrigger = screen.getByRole("button", {
      name: "Time range selected: Select time range",
    });
    const timingCallout = screen
      .getByText("Sync timing")
      .closest(".rounded-panel");

    expect(automaticSection).toHaveClass(
      "border-b",
      "border-border-default",
      "pb-6",
    );
    expect(intervalSection).toHaveClass(
      "border-b",
      "border-border-default",
      "pb-6",
    );
    expect(intervalLayout).toHaveClass("space-y-6");
    expect(intervalControls).toHaveClass(
      "sm:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]",
      "sm:items-start",
    );
    expect(intervalLayout?.firstElementChild).toBe(timingCallout);
    expect(intervalControls.firstElementChild).toContainElement(intervalInput);
    expect(intervalControls.lastElementChild).toBe(intervalAction);
    expect(intervalAction).toHaveClass(
      "flex",
      "justify-end",
      "sm:mt-[1.625rem]",
    );
    expect(intervalAction).toContainElement(applyButton);
    expect(applyButton).toHaveClass(
      "bg-surface-inverse",
      "text-foreground-inverse",
    );
    expect(availabilityButton).toHaveClass(
      "bg-surface-inverse",
      "h-10",
      "text-foreground-inverse",
    );
    expect(importHeading).toHaveClass(
      "font_header_4",
      "text-foreground-primary",
    );
    expect(importControls).toHaveClass(
      "grid",
      "sm:grid-cols-[minmax(0,1fr)_auto]",
      "sm:items-start",
    );
    expect(importControls.firstElementChild).toBe(importTimeRange);
    expect(importControls.lastElementChild).toBe(importAction);
    expect(importAction).toHaveClass("flex", "justify-end");
    expect(importAction).toContainElement(importButton);
    expect(timeRangeTrigger).toHaveClass(
      "cursor-pointer",
      "border-border-default",
      "bg-surface-primary",
      "h-10",
    );
    expect(importButton).toHaveClass(
      "bg-surface-inverse",
      "h-10",
      "text-foreground-inverse",
    );
    expect(timingCallout).toHaveTextContent(
      "15 to 1440 minutes. Tandem refreshes roughly hourly, and scheduled runs start within about 15 minutes of the selected interval.",
    );

    const syncButton = screen.getByRole("button", { name: "Sync now" });
    const stats = screen.getByTestId("tandem-sync-stats");
    const manualSyncSection = screen.getByTestId("tandem-manual-sync-section");
    const manualSyncHeader = screen.getByTestId("tandem-manual-sync-header");
    const manualSyncAction = screen.getByTestId("tandem-manual-sync-action");
    const manualSyncHeading = screen.getByRole("heading", {
      name: "Manual pump sync",
    });

    expect(stats).toHaveClass("rounded-panel", "bg-surface-secondary");
    expect(manualSyncHeader).toHaveClass("sm:flex-row", "sm:justify-between");
    expect(manualSyncHeader.firstElementChild).toContainElement(
      manualSyncHeading,
    );
    expect(manualSyncHeader.lastElementChild).toContainElement(syncButton);
    expect(manualSyncAction).toHaveClass("flex", "justify-end");
    expect(manualSyncAction).toContainElement(syncButton);
    expect(stats.previousElementSibling).toBe(manualSyncHeader);
    expect(stats).toHaveTextContent("Last sync");
    expect(stats).toHaveTextContent("Events available");
    expect(stats).toHaveTextContent("Imported in total");
    expect(manualSyncSection).toHaveClass(
      "border-b",
      "border-border-default",
      "pb-6",
    );
  });

  it("renders Zod interval validation below the shared text input", async () => {
    render(<TandemSyncSettings isOffline={false} />);

    const intervalInput = await screen.findByLabelText(
      "Sync interval (minutes)",
    );
    const applyButton = screen.getByRole("button", {
      name: "Apply interval",
    });

    fireEvent.change(intervalInput, { target: { value: "1" } });
    fireEvent.click(applyButton);

    const inlineError = await screen.findByText(
      "Interval must be a whole number between 15 and 1440 minutes",
    );
    expect(inlineError.closest("[role='alert']")).toHaveAttribute(
      "id",
      "tandem-sync-interval-error",
    );
    expect(intervalInput).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByText("Tandem sync error")).not.toBeInTheDocument();
    expect(mockedUpdateSettings).not.toHaveBeenCalled();

    fireEvent.change(intervalInput, { target: { value: "30" } });

    expect(intervalInput).toHaveAttribute("aria-invalid", "false");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    fireEvent.click(applyButton);

    await waitFor(() =>
      expect(mockedUpdateSettings).toHaveBeenCalledWith({
        enabled: true,
        sync_interval_minutes: 30,
      }),
    );
  });

  it("shows a persistent notification when automatic sync reports a failure", async () => {
    mockedGetStatus.mockResolvedValueOnce({
      ...syncStatus,
      last_error: "Scheduled Tandem sync could not reach t:connect.",
    });

    render(<TandemSyncSettings isOffline={false} />);

    await screen.findByRole("heading", { name: "Automatic pump sync" });

    await waitFor(() =>
      expect(mockNotifyError).toHaveBeenCalledWith(
        "Automatic pump sync failed",
        {
          durationMs: null,
          message: "Scheduled Tandem sync could not reach t:connect.",
        },
      ),
    );
    expect(screen.queryByText("Last sync failed")).not.toBeInTheDocument();
  });

  it("uses the reusable dashboard time range picker for imports", async () => {
    render(<TandemSyncSettings isOffline={false} />);

    await screen.findByRole("heading", { name: "Automatic pump sync" });
    fireEvent.click(
      screen.getByRole("button", { name: "Check available data" }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: "Time range selected: 2026-06-29 to 2026-07-28",
        }),
      ).toBeInTheDocument();
    });

    expect(screen.getByTestId("tandem-availability-status")).toHaveClass(
      "text-signal-warning-text",
    );
    expect(screen.getByTestId("tandem-availability-status")).toHaveTextContent(
      "Data available from 2026-06-01 to 2026-07-28.",
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Time range selected: 2026-06-29 to 2026-07-28",
      }),
    );

    expect(
      screen.getByTestId("dashboard-time-range-picker-transition"),
    ).toHaveClass("grid-rows-[1fr]", "translate-y-0", "opacity-100", "mt-2");
    expect(screen.getByRole("button", { name: "7 days" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "14 days" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "30 days" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "3 hours" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("From")).toBeInTheDocument();
    expect(screen.getByText("To")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy" })).toHaveClass(
      "cursor-pointer",
      "bg-surface-primary",
    );
    expect(screen.getByRole("button", { name: "Paste" })).toHaveClass(
      "cursor-pointer",
      "bg-surface-primary",
    );
    expect(
      screen.getByRole("button", { name: "Apply time range" }),
    ).toHaveClass("cursor-pointer", "bg-surface-primary");

    fireEvent.click(screen.getByRole("button", { name: "7 days" }));

    fireEvent.click(screen.getByRole("button", { name: "Import history" }));

    await waitFor(() =>
      expect(mockedImportRange).toHaveBeenCalledWith(
        "2026-07-22T00:00:00.000Z",
        "2026-07-28T23:59:59.000Z",
      ),
    );
  });

  it("shows manual sync progress and success in the SaveButton", async () => {
    render(<TandemSyncSettings isOffline={false} />);

    const syncButton = await screen.findByRole("button", {
      name: "Sync now",
    });
    fireEvent.click(syncButton);

    await waitFor(() => expect(mockedTriggerSync).toHaveBeenCalledTimes(1));

    const syncedButton = await screen.findByRole("button", {
      name: "Synced 2 new event(s) from t:connect",
    });

    expect(syncedButton).toBeDisabled();
    expect(
      screen
        .getByText("Synced 2 new event(s) from t:connect")
        .closest("button"),
    ).toBe(syncedButton);
  });

  it("animates manual sync errors directly above the sync button", async () => {
    mockedTriggerSync.mockRejectedValueOnce(
      new Error("Unable to connect to Tandem. Please try again later."),
    );
    render(<TandemSyncSettings isOffline={false} />);

    const syncButton = await screen.findByRole("button", {
      name: "Sync now",
    });
    const errorTransition = screen.getByTestId("tandem-sync-error-transition");

    expect(errorTransition).toHaveClass(
      "grid-rows-[0fr]",
      "transition-[grid-template-rows,opacity,translate]",
      "motion-reduce:transition-none",
    );

    fireEvent.click(syncButton);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Tandem sync error");
    expect(alert).toHaveTextContent(
      "Unable to connect to Tandem. Please try again later.",
    );

    await waitFor(() =>
      expect(errorTransition).toHaveClass(
        "grid-rows-[1fr]",
        "translate-y-0",
        "opacity-100",
      ),
    );
    expect(errorTransition.nextElementSibling).toContainElement(syncButton);
  });

  it("disables sync and import controls while offline", async () => {
    render(<TandemSyncSettings isOffline />);

    await screen.findByRole("heading", { name: "Automatic pump sync" });

    expect(
      screen.getByRole("switch", { name: "Automatic pump sync" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Sync now" })).toBeDisabled();
    expect(
      screen.getByRole("button", {
        name: "Time range selected: Select time range",
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Import history" }),
    ).toBeDisabled();
  });
});
