import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { CloudConnectionsSection } from "./CloudConnectionsSection";

jest.mock("../TandemSyncSettings", () => ({
  TandemSyncSettings: () => <div>Tandem sync controls</div>,
}));

jest.mock("../MedtronicImportSettings", () => ({
  MedtronicImportSettings: () => <div>Medtronic import controls</div>,
}));

jest.mock("../MedtronicConnectSettings", () => ({
  MedtronicConnectSettings: () => <div>Medtronic connection controls</div>,
}));

jest.mock("../GlookoConnectionSettings", () => ({
  GlookoConnectionSettings: ({
    onStatusChange,
  }: {
    onStatusChange?: (
      status: {
        connected: boolean;
        enabled: boolean;
        last_sync_at: string;
        status: "connected";
      },
      loadFailed?: boolean,
    ) => void;
  }) => (
    <button
      onClick={() =>
        onStatusChange?.({
          connected: true,
          enabled: true,
          last_sync_at: "2026-07-28T07:59:51.000Z",
          status: "connected",
        })
      }
      type="button"
    >
      Load Glooko status
    </button>
  ),
}));

const NOW_MS = new Date("2026-07-28T08:00:00.000Z").getTime();

const props = {
  isOffline: false,
  isTandemConnecting: false,
  onConnectTandem: jest.fn(),
  onDisconnectTandem: jest.fn(),
  onTandemCountryChange: jest.fn(),
  onTandemEmailChange: jest.fn(),
  onTandemPasswordChange: jest.fn(),
  tandem: null,
  tandemCountry: "US",
  tandemEmail: "",
  tandemPassword: "",
};

describe("CloudConnectionsSection categories", () => {
  it("shows insulin delivery integrations and routes Glooko sources to Glooko", () => {
    render(
      <CloudConnectionsSection {...props} category="insulin-pumps" embedded />,
    );

    expect(screen.getByText("Source")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("Updated")).toBeInTheDocument();
    expect(screen.queryByText(/Pull pump history/)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Tandem t:connect Not Connected -",
      }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.getByRole("button", { name: "Medtronic CareLink Pending -" }),
    ).toHaveAttribute("aria-expanded", "false");

    const omnipodAccordion = screen.getByRole("button", {
      name: "Omnipod Not Connected -",
    });
    expect(omnipodAccordion).toHaveAttribute("aria-expanded", "false");
    expect(within(omnipodAccordion).getByText("Omnipod")).toHaveClass(
      "font_body_2",
      "text-foreground-primary",
    );
    expect(omnipodAccordion.querySelector("use")).toHaveAttribute(
      "href",
      "/static_assets/iconSprite.svg#insulin-pump",
    );

    fireEvent.click(omnipodAccordion);

    const omnipodRegion = screen.getByRole("region", {
      name: "Omnipod Not Connected -",
    });
    expect(
      within(omnipodRegion).getByRole("link", {
        name: "Go to Glooko connection settings",
      }),
    ).toHaveAttribute(
      "href",
      "/settings/connections?tab=third-party&connection=glooko",
    );
    const omnipodBody = within(omnipodRegion).getByText(
      "Omnipod 5 does not offer Lumose a direct connection and uploads its data to Glooko instead. Connect the Glooko account that receives your Omnipod data.",
    ).parentElement;
    expect(omnipodRegion.firstElementChild?.firstElementChild).toHaveClass(
      "pt-4",
    );
    expect(omnipodBody).not.toHaveClass("pt-4");
    expect(omnipodBody).not.toHaveClass(
      "border",
      "border-border-default",
      "rounded-panel",
    );

    const novoPenAccordion = screen.getByRole("button", {
      name: "NovoPen Not Connected -",
    });
    expect(novoPenAccordion).toHaveAttribute("aria-expanded", "false");
    expect(within(novoPenAccordion).getByText("NovoPen")).toHaveClass(
      "font_body_2",
      "text-foreground-primary",
    );
    expect(novoPenAccordion.querySelector("use")).toHaveAttribute(
      "href",
      "/static_assets/iconSprite.svg#syringe",
    );

    fireEvent.click(novoPenAccordion);

    const novoPenRegion = screen.getByRole("region", {
      name: "NovoPen Not Connected -",
    });
    expect(
      within(novoPenRegion).getByRole("link", {
        name: "Go to Glooko connection settings",
      }),
    ).toHaveAttribute(
      "href",
      "/settings/connections?tab=third-party&connection=glooko",
    );
    const novoPenBody = within(novoPenRegion).getByText(
      "NovoPen 6 and NovoPen Echo Plus do not offer Lumose a direct connection. Their dose data reaches Lumose through the Glooko account you use when scanning your pen.",
    ).parentElement;
    expect(novoPenRegion.firstElementChild?.firstElementChild).toHaveClass(
      "pt-4",
    );
    expect(novoPenBody).not.toHaveClass("pt-4");
    expect(novoPenBody).not.toHaveClass(
      "border",
      "border-border-default",
      "rounded-panel",
    );
    expect(
      screen.queryByRole("button", { name: "Load Glooko status" }),
    ).not.toBeInTheDocument();
  });

  it("shows Glooko as a third party integration", () => {
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(NOW_MS);

    try {
      render(
        <CloudConnectionsSection {...props} category="third-party" embedded />,
      );

      expect(screen.getByText("Source")).toBeInTheDocument();
      expect(screen.getByText("Status")).toBeInTheDocument();
      expect(screen.getByText("Updated")).toBeInTheDocument();

      const glookoAccordion = screen.getByRole("button", {
        name: "Glooko Pending -",
      });
      const glookoContent = screen.getByRole("button", {
        name: "Load Glooko status",
        hidden: true,
      });
      const glookoRegion = glookoContent.closest('[role="region"]');

      expect(glookoAccordion).toHaveAttribute("aria-expanded", "false");
      expect(glookoAccordion.querySelector("use")).toHaveAttribute(
        "href",
        "/static_assets/iconSprite.svg#link",
      );
      expect(within(glookoAccordion).getByText("Glooko")).toHaveClass(
        "font_body_2",
        "text-foreground-primary",
      );
      expect(within(glookoAccordion).getByText("Pending")).toBeInTheDocument();
      expect(glookoRegion).toHaveAttribute("aria-hidden", "true");
      expect(glookoRegion).toHaveAttribute("inert");

      fireEvent.click(glookoAccordion);
      fireEvent.click(glookoContent);

      expect(
        screen.getByRole("button", { name: "Glooko Connected 9s ago" }),
      ).toBeInTheDocument();
      expect(glookoRegion).toHaveAttribute("aria-hidden", "false");
      expect(glookoRegion).not.toHaveAttribute("inert");
      expect(glookoRegion?.firstElementChild?.firstElementChild).toHaveClass(
        "pt-4",
      );
      expect(screen.queryByText("Tandem")).not.toBeInTheDocument();
      expect(screen.queryByText("Medtronic CareLink")).not.toBeInTheDocument();
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("keeps Glooko collapsed when it is the requested connection target", () => {
    render(
      <CloudConnectionsSection
        {...props}
        category="third-party"
        embedded
        openConnection="glooko"
      />,
    );

    expect(
      screen.getByRole("button", { name: "Glooko Pending -" }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("uses shared fields and validates Tandem credentials before connecting", async () => {
    const onConnectTandem = jest.fn().mockResolvedValue(undefined);

    render(
      <CloudConnectionsSection
        {...props}
        category="insulin-pumps"
        embedded
        onConnectTandem={onConnectTandem}
      />,
    );

    const accordion = screen.getByRole("button", {
      name: "Tandem t:connect Not Connected -",
    });

    expect(accordion.querySelector("use")).toHaveAttribute(
      "href",
      "/static_assets/iconSprite.svg#insulin-pump",
    );
    expect(within(accordion).getByText("Not Connected")).toHaveClass(
      "rounded-none",
      "bg-transparent",
      "px-0",
      "py-0",
    );

    fireEvent.click(accordion);

    const emailInput = screen.getByLabelText("Tandem t:connect Email");
    const passwordInput = screen.getByLabelText("Tandem t:connect Password");
    const countryInput = screen.getByLabelText("Country");
    const form = emailInput.closest("form");
    const credentialsColumn = emailInput.closest(".space-y-4");
    const fieldsGrid = credentialsColumn?.parentElement;
    const disconnectedFields = fieldsGrid?.parentElement;

    const content = screen.getByRole("region", {
      name: "Tandem t:connect Not Connected -",
    });
    expect(content.firstElementChild?.firstElementChild).toHaveClass("pt-4");
    expect(disconnectedFields).not.toHaveClass("pt-4");
    expect(disconnectedFields?.firstElementChild).toBe(fieldsGrid);
    expect(screen.queryByText("Before connecting")).not.toBeInTheDocument();
    expect(credentialsColumn).toContainElement(passwordInput);
    expect(fieldsGrid).toHaveClass(
      "grid",
      "lg:grid-cols-[minmax(0,28rem)_minmax(0,20rem)]",
    );
    expect(fieldsGrid).toContainElement(countryInput);
    expect(form?.parentElement).not.toHaveClass("border");
    expect(form?.parentElement).not.toHaveClass("p-6");

    fireEvent.click(screen.getByRole("button", { name: "Test Connection" }));

    expect(
      screen.getByText("Enter your Tandem t:connect email."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Enter your Tandem t:connect password."),
    ).toBeInTheDocument();
    expect(onConnectTandem).not.toHaveBeenCalled();

    fireEvent.change(emailInput, {
      target: { value: "person@example.com" },
    });

    await waitFor(() =>
      expect(emailInput).toHaveAttribute("aria-invalid", "false"),
    );

    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(passwordInput).toHaveAttribute("type", "text");
  });

  it("keeps connected Tandem metadata and sync controls inside the accordion", () => {
    render(
      <CloudConnectionsSection
        {...props}
        category="insulin-pumps"
        embedded
        tandem={{
          created_at: "2026-01-01T00:00:00.000Z",
          integration_type: "tandem",
          last_error: null,
          last_sync_at: "2026-07-28T08:00:00.000Z",
          region: "SE",
          status: "connected",
          updated_at: "2026-07-28T08:00:00.000Z",
        }}
      />,
    );

    const accordion = screen.getByRole("button", {
      name: /Tandem t:connect Connected/,
    });
    fireEvent.click(accordion);

    const content = screen.getByRole("region", {
      name: /Tandem t:connect Connected/,
    });

    expect(screen.getAllByText("Connected")).toHaveLength(1);
    expect(
      within(content).queryByLabelText("Tandem t:connect Email"),
    ).not.toBeInTheDocument();
    expect(
      within(content).queryByLabelText("Tandem t:connect Password"),
    ).not.toBeInTheDocument();
    expect(
      within(content).queryByText("Before connecting"),
    ).not.toBeInTheDocument();
    const country = within(content).getByText("Sweden");
    const metadataBox = country.closest("dl");
    const metadataSection = metadataBox?.parentElement;
    expect(metadataBox).toHaveClass("rounded-panel", "bg-surface-secondary");
    expect(metadataSection).toHaveClass(
      "border-b",
      "border-border-default",
      "pb-6",
    );
    const syncControls = within(content).getByText("Tandem sync controls");
    const disconnectButton = within(content).getByRole("button", {
      name: "Disconnect",
    });
    const connectedForm = disconnectButton.closest("form");
    expect(connectedForm).toContainElement(syncControls);
    expect(disconnectButton.parentElement).toBe(
      connectedForm?.lastElementChild,
    );
    expect(disconnectButton.parentElement).toHaveClass(
      "border-t",
      "border-border-default",
      "pt-6",
    );
    expect(
      within(content).queryByRole("button", { name: "Update Credentials" }),
    ).not.toBeInTheDocument();
  });

  it("submits valid Tandem credentials", async () => {
    const onConnectTandem = jest.fn().mockResolvedValue(undefined);

    render(
      <CloudConnectionsSection
        {...props}
        category="insulin-pumps"
        embedded
        onConnectTandem={onConnectTandem}
        tandemEmail="person@example.com"
        tandemPassword="secret"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Tandem t:connect Not Connected -",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Test Connection" }));

    await waitFor(() => expect(onConnectTandem).toHaveBeenCalledTimes(1));
  });
});
