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
    jest
      .spyOn(Date, "now")
      .mockReturnValue(new Date("2026-07-29T12:00:00.000Z").getTime());
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

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("toggles automatic sync and hides disabled interval controls", async () => {
    render(<TandemSyncSettings isOffline={false} />);

    await screen.findByRole("heading", {
      name: "Automatic pump sync",
    });
    const toggle = screen.getByRole("switch", {
      name: "Automatic pump sync",
    });
    const intervalTransition = screen.getByTestId(
      "tandem-sync-interval-transition",
    );

    expect(toggle).toBeChecked();
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
    expect(intervalTransition).toHaveAttribute("aria-hidden", "true");
    expect(intervalTransition).toHaveAttribute("inert");
  });

  it("presents timing, actions, and sync stats with accessible labels", async () => {
    render(<TandemSyncSettings isOffline={false} />);

    await screen.findByRole("heading", {
      name: "Automatic pump sync",
    });
    expect(screen.getByLabelText("Sync interval (minutes)")).toHaveValue(60);
    expect(
      screen.getByRole("button", { name: "Apply interval" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Check available data" }),
    ).toBeEnabled();
    expect(screen.getByRole("heading", {
      name: "Import pump history",
    })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Import history" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", {
        name: "Time range selected: Select time range",
      }),
    ).toBeEnabled();
    expect(
      screen.getByText(
        "15 to 1440 minutes. Tandem refreshes roughly hourly, and scheduled runs start within about 15 minutes of the selected interval.",
      ),
    ).toBeInTheDocument();

    const stats = screen.getByTestId("tandem-sync-stats");
    expect(
      screen.getByRole("heading", { name: "Manual pump sync" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sync now" })).toBeEnabled();
    expect(stats).toHaveTextContent("Last sync");
    expect(stats).toHaveTextContent("Events available");
    expect(stats).toHaveTextContent("Imported in total");
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
    ).toHaveAttribute("aria-hidden", "false");
    expect(screen.getByRole("button", { name: "7 days" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "14 days" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "30 days" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "3 hours" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("From")).toBeInTheDocument();
    expect(screen.getByText("To")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Paste" })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Apply time range" }),
    ).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "7 days" }));

    fireEvent.click(screen.getByRole("button", { name: "Import history" }));

    await waitFor(() =>
      expect(mockedImportRange).toHaveBeenCalledWith(
        "2026-07-22T00:00:00.000Z",
        "2026-07-28T23:59:59.000Z",
      ),
    );
  });

  it("rejects an import whose start date is in the future", async () => {
    render(<TandemSyncSettings isOffline={false} />);

    await screen.findByRole("heading", { name: "Automatic pump sync" });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Time range selected: Select time range",
      }),
    );
    fireEvent.change(screen.getByLabelText("From"), {
      target: { value: "2026-07-30" },
    });
    fireEvent.change(screen.getByLabelText("To"), {
      target: { value: "2026-07-30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply time range" }));
    fireEvent.click(screen.getByRole("button", { name: "Import history" }));

    expect(
      await screen.findByText("Start date cannot be in the future"),
    ).toBeInTheDocument();
    expect(mockedImportRange).not.toHaveBeenCalled();
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

    expect(errorTransition).toHaveAttribute("aria-hidden", "true");

    fireEvent.click(syncButton);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Tandem sync error");
    expect(alert).toHaveTextContent(
      "Unable to connect to Tandem. Please try again later.",
    );

    await waitFor(() =>
      expect(errorTransition).toHaveAttribute("aria-hidden", "false"),
    );
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
