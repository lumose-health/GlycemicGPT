import { STATIC_ASSET_ICON_SPRITE_PATH } from "@/lib/staticAssets";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { CgmConnectionsSection } from "./CgmConnectionsSection";

const NOW_MS = new Date("2026-07-28T08:00:00.000Z").getTime();

const props = {
  dexcom: {
    created_at: "2026-01-01T00:00:00.000Z",
    integration_type: "dexcom" as const,
    last_error: null,
    last_sync_at: new Date(NOW_MS - 6_000).toISOString(),
    region: "US",
    status: "connected" as const,
    updated_at: "2026-07-28T08:00:00.000Z",
  },
  dexcomEmail: "",
  dexcomPassword: "",
  dexcomRegion: "US",
  isDexcomConnecting: false,
  isOffline: false,
  onConnectDexcom: jest.fn(),
  onDexcomEmailChange: jest.fn(),
  onDexcomPasswordChange: jest.fn(),
  onDexcomRegionChange: jest.fn(),
  onDisconnectDexcom: jest.fn(),
};

describe("CgmConnectionsSection", () => {
  it("starts collapsed and keeps the Dexcom summary in the accordion header", () => {
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(NOW_MS);

    try {
      render(<CgmConnectionsSection {...props} embedded />);

      expect(screen.getByText("Source")).toBeInTheDocument();
      expect(screen.getByText("Status")).toBeInTheDocument();
      expect(screen.getByText("Updated")).toBeInTheDocument();

      const accordion = screen.getByRole("button", {
        name: "Dexcom G6/G7 Connected 6s ago",
      });

      expect(accordion).toHaveAttribute("aria-expanded", "false");
      expect(accordion.querySelector("use")).toHaveAttribute(
        "href",
        `${STATIC_ASSET_ICON_SPRITE_PATH}#cgm`,
      );
      expect(within(accordion).getByText("6s ago")).toBeInTheDocument();

      fireEvent.click(accordion);

      expect(accordion).toHaveAttribute("aria-expanded", "true");
      const content = screen.getByRole("region", {
        name: "Dexcom G6/G7 Connected 6s ago",
      });

      expect(screen.getAllByText("Connected")).toHaveLength(1);
      expect(
        screen.queryByText(
          "Connect your Dexcom account to sync continuous glucose monitor data",
        ),
      ).not.toBeInTheDocument();
      expect(screen.queryByText("Last synced")).not.toBeInTheDocument();
      expect(within(content).queryByText("6s ago")).not.toBeInTheDocument();
      expect(
        within(content).queryByLabelText("Dexcom Share Email"),
      ).not.toBeInTheDocument();
      expect(
        within(content).queryByLabelText("Dexcom Share Password"),
      ).not.toBeInTheDocument();
      expect(
        within(content).queryByText("Before connecting"),
      ).not.toBeInTheDocument();
      expect(within(content).getByText("United States")).toBeInTheDocument();
      expect(
        within(content).queryByRole("button", { name: "Update Credentials" }),
      ).not.toBeInTheDocument();
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("shows delayed freshness and transient sync health without disconnecting", () => {
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(NOW_MS);

    try {
      render(
        <CgmConnectionsSection
          {...props}
          dexcom={{
            ...props.dexcom,
            freshness: "delayed",
            latest_reading_at: new Date(NOW_MS - 7 * 60_000).toISOString(),
            latest_received_at: new Date(NOW_MS - 7 * 60_000).toISOString(),
            sync_last_error: "Dexcom Share fetch failed; retrying",
          }}
          embedded
        />,
      );

      const accordion = screen.getByRole("button", {
        name: "Dexcom G6/G7 Delayed 7m 0s ago",
      });
      expect(within(accordion).getByText("Delayed")).toHaveClass(
        "text-signal-warning-text",
      );

      fireEvent.click(accordion);
      expect(screen.getByText("Dexcom sync delayed")).toBeInTheDocument();
      expect(
        screen.getByText("Dexcom Share fetch failed; retrying"),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Disconnect" }),
      ).toBeInTheDocument();
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("keeps connection freshness current for an old reading received recently", () => {
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(NOW_MS);

    try {
      render(
        <CgmConnectionsSection
          {...props}
          dexcom={{
            ...props.dexcom,
            freshness: "stale",
            latest_reading_at: new Date(NOW_MS - 20 * 60_000).toISOString(),
            latest_received_at: new Date(NOW_MS - 30_000).toISOString(),
          }}
          embedded
        />,
      );

      expect(
        screen.getByRole("button", {
          name: "Dexcom G6/G7 Connected 20m 0s ago",
        }),
      ).toBeInTheDocument();
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("shows reconnect required when Dexcom credentials are invalid", () => {
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(NOW_MS);

    try {
      render(
        <CgmConnectionsSection
          {...props}
          dexcom={{
            ...props.dexcom,
            freshness: "connected",
            latest_reading_at: new Date(NOW_MS - 60_000).toISOString(),
            status: "error",
          }}
          embedded
        />,
      );

      expect(
        screen.getByRole("button", {
          name: "Dexcom G6/G7 Reconnect required 1m 0s ago",
        }),
      ).toBeInTheDocument();
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("uses shared fields and validates Dexcom Share credentials", async () => {
    const onConnectDexcom = jest.fn().mockResolvedValue(undefined);

    render(
      <CgmConnectionsSection
        {...props}
        dexcom={null}
        dexcomEmail=""
        dexcomPassword=""
        embedded
        onConnectDexcom={onConnectDexcom}
      />,
    );

    const accordion = screen.getByRole("button", {
      name: "Dexcom G6/G7 Not Connected -",
    });
    const disconnectedStatus = within(accordion).getByText("Not Connected");

    expect(disconnectedStatus).toHaveClass(
      "rounded-none",
      "bg-transparent",
      "px-0",
      "py-0",
    );

    fireEvent.click(accordion);

    const emailInput = screen.getByLabelText("Dexcom Share Email");
    const passwordInput = screen.getByLabelText("Dexcom Share Password");
    const regionInput = screen.getByLabelText("Region");
    const form = emailInput.closest("form");
    const credentialsColumn = emailInput.closest(".space-y-4");
    const fieldsGrid = credentialsColumn?.parentElement;
    const disconnectedFields = fieldsGrid?.parentElement;
    const beforeConnecting = screen.getByText("Before connecting");
    const informationBox = beforeConnecting.closest(".rounded-panel");

    expect(emailInput).toHaveClass("font_ui_input", "bg-surface-primary");
    expect(passwordInput).toHaveClass("font_ui_input", "bg-surface-primary");
    const region = screen.getByRole("region", {
      name: "Dexcom G6/G7 Not Connected -",
    });
    expect(region.firstElementChild?.firstElementChild).toHaveClass("pt-4");
    expect(disconnectedFields).not.toHaveClass("pt-4");
    expect(disconnectedFields?.firstElementChild).toBe(informationBox);
    expect(informationBox?.nextElementSibling).toBe(fieldsGrid);
    expect(informationBox).toHaveClass(
      "border-signal-info-fill",
      "bg-signal-info-fill/20",
    );
    expect(beforeConnecting).toHaveClass("font_body_2");
    expect(informationBox?.querySelector("use")).toHaveAttribute(
      "href",
      `${STATIC_ASSET_ICON_SPRITE_PATH}#lightbulb`,
    );
    expect(credentialsColumn).toContainElement(passwordInput);
    expect(fieldsGrid).toHaveClass(
      "grid",
      "lg:grid-cols-[minmax(0,28rem)_minmax(0,20rem)]",
    );
    expect(fieldsGrid).toContainElement(regionInput);
    expect(form?.parentElement).toHaveClass("space-y-4");
    expect(form?.parentElement).not.toHaveClass("border");
    expect(form?.parentElement).not.toHaveClass("p-6");

    fireEvent.click(screen.getByRole("button", { name: "Test Connection" }));

    expect(
      screen.getByText("Enter your Dexcom Share email."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Enter your Dexcom Share password."),
    ).toBeInTheDocument();
    expect(emailInput).toHaveAttribute("aria-invalid", "true");
    expect(passwordInput).toHaveAttribute("aria-invalid", "true");
    expect(onConnectDexcom).not.toHaveBeenCalled();

    fireEvent.change(emailInput, { target: { value: "person@example.com" } });

    await waitFor(() =>
      expect(emailInput).toHaveAttribute("aria-invalid", "false"),
    );

    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(passwordInput).toHaveAttribute("type", "text");
    expect(
      screen.getByRole("button", { name: "Hide password" }),
    ).toBeInTheDocument();
  });

  it("rejects invalid Dexcom Share email addresses", async () => {
    const onConnectDexcom = jest.fn().mockResolvedValue(undefined);

    render(
      <CgmConnectionsSection
        {...props}
        dexcom={null}
        dexcomEmail="not-an-email"
        dexcomPassword="secret"
        embedded
        onConnectDexcom={onConnectDexcom}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: /Dexcom G6\/G7 Not Connected/,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Test Connection" }));

    expect(
      await screen.findByText("Enter a valid email address."),
    ).toBeInTheDocument();
    expect(onConnectDexcom).not.toHaveBeenCalled();
  });

  it("submits valid Dexcom Share credentials", async () => {
    const onConnectDexcom = jest.fn().mockResolvedValue(undefined);

    render(
      <CgmConnectionsSection
        {...props}
        dexcom={null}
        dexcomEmail="person@example.com"
        dexcomPassword="secret"
        embedded
        onConnectDexcom={onConnectDexcom}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: /Dexcom G6\/G7 Not Connected/,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Test Connection" }));

    await waitFor(() => expect(onConnectDexcom).toHaveBeenCalledTimes(1));
  });
});
