import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { LibreLinkUpConnectionsSection } from "./LibreLinkUpConnectionsSection";

const NOW_MS = new Date("2026-07-28T08:00:00.000Z").getTime();

const props = {
  librelinkup: {
    created_at: "2026-01-01T00:00:00.000Z",
    integration_type: "librelinkup" as const,
    last_error: null,
    last_sync_at: new Date(NOW_MS - 6_000).toISOString(),
    region: "EU",
    status: "connected" as const,
    updated_at: "2026-07-28T08:00:00.000Z",
  },
  librelinkupEmail: "",
  librelinkupPassword: "",
  librelinkupRegion: "US",
  isLibreLinkUpConnecting: false,
  isOffline: false,
  onConnectLibreLinkUp: jest.fn(),
  onLibreLinkUpEmailChange: jest.fn(),
  onLibreLinkUpPasswordChange: jest.fn(),
  onLibreLinkUpRegionChange: jest.fn(),
  onDisconnectLibreLinkUp: jest.fn(),
};

describe("LibreLinkUpConnectionsSection", () => {
  it("keeps the LibreLinkUp summary collapsed and maps the connected region", () => {
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(NOW_MS);

    try {
      render(<LibreLinkUpConnectionsSection {...props} embedded />);

      const accordion = screen.getByRole("button", {
        name: "FreeStyle Libre (LibreLinkUp) Connected 6s ago",
      });
      expect(accordion).toHaveAttribute("aria-expanded", "false");

      fireEvent.click(accordion);

      const content = screen.getByRole("region", {
        name: "FreeStyle Libre (LibreLinkUp) Connected 6s ago",
      });
      // Region "EU" is mapped to its friendly label.
      expect(within(content).getByText("Europe")).toBeInTheDocument();
      expect(
        within(content).queryByLabelText("LibreLinkUp Email"),
      ).not.toBeInTheDocument();
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("validates missing LibreLinkUp credentials before connecting", () => {
    const onConnectLibreLinkUp = jest.fn().mockResolvedValue(undefined);

    render(
      <LibreLinkUpConnectionsSection
        {...props}
        librelinkup={null}
        librelinkupEmail=""
        librelinkupPassword=""
        embedded
        onConnectLibreLinkUp={onConnectLibreLinkUp}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: /FreeStyle Libre \(LibreLinkUp\) Not Connected/,
      }),
    );

    const emailInput = screen.getByLabelText("LibreLinkUp Email");
    const passwordInput = screen.getByLabelText("LibreLinkUp Password");
    // Region select renders the LibreLinkUp-specific options.
    expect(
      screen.getByRole("option", { name: "Europe 2 (EU2)" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Test Connection" }));

    expect(
      screen.getByText("Enter your LibreLinkUp email."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Enter your LibreLinkUp password."),
    ).toBeInTheDocument();
    expect(emailInput).toHaveAttribute("aria-invalid", "true");
    expect(passwordInput).toHaveAttribute("aria-invalid", "true");
    expect(onConnectLibreLinkUp).not.toHaveBeenCalled();
  });

  it("rejects an invalid LibreLinkUp email address", async () => {
    const onConnectLibreLinkUp = jest.fn().mockResolvedValue(undefined);

    render(
      <LibreLinkUpConnectionsSection
        {...props}
        librelinkup={null}
        librelinkupEmail="not-an-email"
        librelinkupPassword="secret"
        embedded
        onConnectLibreLinkUp={onConnectLibreLinkUp}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: /FreeStyle Libre \(LibreLinkUp\) Not Connected/,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Test Connection" }));

    expect(
      await screen.findByText("Enter a valid email address."),
    ).toBeInTheDocument();
    expect(onConnectLibreLinkUp).not.toHaveBeenCalled();
  });

  it("submits valid LibreLinkUp credentials", async () => {
    const onConnectLibreLinkUp = jest.fn().mockResolvedValue(undefined);

    render(
      <LibreLinkUpConnectionsSection
        {...props}
        librelinkup={null}
        librelinkupEmail="person@example.com"
        librelinkupPassword="secret"
        embedded
        onConnectLibreLinkUp={onConnectLibreLinkUp}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: /FreeStyle Libre \(LibreLinkUp\) Not Connected/,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Test Connection" }));

    await waitFor(() => expect(onConnectLibreLinkUp).toHaveBeenCalledTimes(1));
  });
});
