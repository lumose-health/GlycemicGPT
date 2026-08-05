import { createElement } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  getMedtronicConnectStatus,
  syncMedtronicConnectNow,
  type MedtronicConnectStatus,
} from "@/lib/api";
import {
  buildHelperCommand,
  MedtronicConnectSettings,
} from "./MedtronicConnectSettings";
import {
  medtronicIntervalSchema,
  medtronicPairingSchema,
} from "./medtronicConnectSettings.schema";

jest.mock("@/lib/api", () => ({
  disconnectMedtronicConnect: jest.fn(),
  getMedtronicConnectStatus: jest.fn(),
  installMedtronicConnect: jest.fn(),
  syncMedtronicConnectNow: jest.fn(),
  updateMedtronicConnectSettings: jest.fn(),
}));

const connectedStatus: MedtronicConnectStatus = {
  connected: true,
  enabled: true,
  last_error: null,
  last_sync_at: "2026-07-28T10:00:00.000Z",
  readings_synced_total: 120,
  region: "US",
  status: "connected",
  sync_interval_minutes: 30,
};

describe("Medtronic Connect settings", () => {
  it("validates the pairing fields before installation", () => {
    expect(
      medtronicPairingSchema.safeParse({
        apiUrl: "ftp://lumose.example.com",
        region: "US",
        username: "carelink-user",
      }).success,
    ).toBe(false);
    const invalidRegion = medtronicPairingSchema.safeParse({
      apiUrl: "https://lumose.example.com",
      region: "CA",
      username: "carelink-user",
    });
    expect(invalidRegion.success).toBe(false);
    if (!invalidRegion.success) {
      expect(invalidRegion.error.issues[0]?.message).toBe(
        "Choose a supported region.",
      );
    }
    expect(
      medtronicPairingSchema.safeParse({
        apiUrl: "invalid",
        region: "US",
        username: "",
      }).success,
    ).toBe(false);
    expect(
      medtronicPairingSchema.safeParse({
        apiUrl: "https://lumose.example.com",
        region: "EU",
        username: "carelink-user",
      }).success,
    ).toBe(true);
  });

  it("quotes helper command arguments and validates sync intervals", () => {
    expect(
      buildHelperCommand(
        "https://example.com/install.sh",
        "linux-mac",
        "/Applications/My Browser",
      ),
    ).toContain("'/Applications/My Browser'");
    expect(medtronicIntervalSchema.safeParse(30).success).toBe(true);
    expect(medtronicIntervalSchema.safeParse(30.5).success).toBe(false);
  });

  it("keeps a successful sync result when its status refresh fails", async () => {
    jest
      .mocked(getMedtronicConnectStatus)
      .mockResolvedValueOnce(connectedStatus)
      .mockRejectedValueOnce(new Error("Status refresh failed"));
    jest.mocked(syncMedtronicConnectNow).mockResolvedValue({
      events_fetched: 3,
      events_stored: 2,
      glucose_fetched: 6,
      glucose_stored: 5,
      message: "Sync complete",
    });

    render(
      createElement(MedtronicConnectSettings, {
        isOffline: false,
      }),
    );

    fireEvent.click(await screen.findByRole("button", { name: "Sync now" }));

    expect(
      await screen.findByText(
        "Synced 5 new glucose readings and 2 pump events.",
      ),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(getMedtronicConnectStatus).toHaveBeenCalledTimes(2),
    );
    expect(screen.queryByText("Status refresh failed")).not.toBeInTheDocument();
  });
});
