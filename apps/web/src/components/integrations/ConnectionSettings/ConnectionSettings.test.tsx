import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import {
  ConnectionInfoCallout,
  ConnectionSettingsAccordion,
  ConnectionSettingsForm,
  ConnectionSettingsList,
} from "./ConnectionSettings";

const NOW_MS = new Date("2026-07-28T08:00:00.000Z").getTime();

describe("ConnectionSettings", () => {
  it("renders a collapsed connection row with shared metadata columns", () => {
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(NOW_MS);

    try {
      render(
        <ConnectionSettingsList>
          <ConnectionSettingsAccordion
            icon="cgm"
            name="Dexcom G6/G7"
            status="connected"
            updatedAt={new Date(NOW_MS - 6_000).toISOString()}
          >
            <p>Connection details</p>
          </ConnectionSettingsAccordion>
        </ConnectionSettingsList>,
      );

      expect(screen.getByText("Source")).toBeInTheDocument();
      expect(screen.getByText("Status")).toBeInTheDocument();
      expect(screen.getByText("Updated")).toBeInTheDocument();
      expect(screen.getByText("Source").parentElement).toHaveAttribute(
        "aria-hidden",
        "true",
      );
      expect(screen.getByText("Source").parentElement).toHaveClass(
        "bg-surface-elevated",
        "uppercase",
        "py-2",
      );
      expect(screen.getByText("Source").parentElement).not.toHaveClass(
        "border",
        "py-3",
      );

      const accordion = screen.getByRole("button", {
        name: "Dexcom G6/G7 Connected 6s ago",
      });

      expect(accordion).toHaveAttribute("aria-expanded", "false");
      expect(accordion.querySelector("use")).toHaveAttribute(
        "href",
        "/static_assets/iconSprite.svg#cgm",
      );
      expect(within(accordion).getByText("Connected")).toHaveClass(
        "bg-signal-check-fill/20",
        "text-signal-check-text",
      );

      fireEvent.click(accordion);

      expect(
        screen.getByRole("region", {
          name: "Dexcom G6/G7 Connected 6s ago",
        }),
      ).toHaveTextContent("Connection details");
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("uses a plain disconnected status and a placeholder timestamp", () => {
    render(
      <ConnectionSettingsAccordion icon="link" name="Nightscout" status={null}>
        <p>Connection details</p>
      </ConnectionSettingsAccordion>,
    );

    const accordion = screen.getByRole("button", {
      name: "Nightscout Not Connected -",
    });

    expect(within(accordion).getByText("Not Connected")).toHaveClass(
      "bg-transparent",
      "px-0",
      "py-0",
      "text-foreground-secondary",
    );
  });

  it("supports a connection count in the shared status column", () => {
    render(
      <ConnectionSettingsAccordion
        icon="link"
        name="Nightscout"
        status="connected"
        statusLabel="2 Connections"
      >
        <p>Connection details</p>
      </ConnectionSettingsAccordion>,
    );

    const accordion = screen.getByRole("button", {
      name: "Nightscout 2 Connections -",
    });

    expect(within(accordion).getByText("2 Connections")).toHaveClass(
      "bg-signal-check-fill/20",
      "text-signal-check-text",
    );
  });

  it("renders an information callout with a shared sprite icon", () => {
    render(
      <ConnectionInfoCallout title="Before connecting">
        Check the vendor account before continuing.
      </ConnectionInfoCallout>,
    );

    const title = screen.getByText("Before connecting");
    const callout = title.closest(".rounded-panel");

    expect(title).toHaveClass("font_body_2");
    expect(callout).toHaveClass(
      "border-signal-info-fill",
      "bg-signal-info-fill/20",
    );
    expect(callout?.querySelector("use")).toHaveAttribute(
      "href",
      "/static_assets/iconSprite.svg#lightbulb",
    );
  });

  it("submits disconnected credentials and confirms disconnects", async () => {
    const onDisconnect = jest.fn().mockResolvedValue(undefined);
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const { rerender } = render(
      <ConnectionSettingsForm
        isSubmitting={false}
        onDisconnect={onDisconnect}
        onSubmit={onSubmit}
        status={null}
      >
        <p>Credential fields</p>
      </ConnectionSettingsForm>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Test Connection" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(
      screen.queryByRole("button", { name: "Disconnect" }),
    ).not.toBeInTheDocument();

    rerender(
      <ConnectionSettingsForm
        actionsClassName="border-t border-border-default pt-6"
        isSubmitting={false}
        onDisconnect={onDisconnect}
        onSubmit={onSubmit}
        status="connected"
      >
        <p>Connected metadata</p>
      </ConnectionSettingsForm>,
    );

    expect(
      screen.queryByRole("button", { name: "Test Connection" }),
    ).not.toBeInTheDocument();
    const disconnectButton = screen.getByRole("button", {
      name: "Disconnect",
    });
    expect(disconnectButton).toHaveClass("cursor-pointer");
    expect(disconnectButton.parentElement).toHaveClass(
      "border-t",
      "border-border-default",
      "pt-6",
    );
    fireEvent.click(disconnectButton);

    const confirmDisconnectButton = screen.getByRole("button", {
      name: "Yes, Disconnect",
    });
    expect(confirmDisconnectButton).toHaveClass("cursor-pointer");
    fireEvent.click(confirmDisconnectButton);

    await waitFor(() => expect(onDisconnect).toHaveBeenCalledTimes(1));
    expect(
      screen.getByRole("button", { name: "Disconnect" }),
    ).toBeInTheDocument();
  });
});
