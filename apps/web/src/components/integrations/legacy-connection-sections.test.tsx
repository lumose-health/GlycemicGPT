import { render, screen, within } from "@testing-library/react";
import { CGMIntegrationsSection } from "./cgm-integrations-section";
import { CloudSyncSection } from "./cloud-sync-section";

jest.mock("./tandem-sync-card", () => ({
  TandemSyncCard: () => <div>Tandem sync controls</div>,
}));

jest.mock("./medtronic-import-card", () => ({
  MedtronicImportCard: () => <div>Medtronic import controls</div>,
}));

jest.mock("./medtronic-connect-card", () => ({
  MedtronicConnectCard: () => <div>Medtronic connection controls</div>,
}));

jest.mock("./glooko-sync-card", () => ({
  GlookoSyncCard: () => <div>Glooko connection controls</div>,
}));

const sharedProps = {
  isOffline: false,
  onConnectDexcom: jest.fn().mockResolvedValue(undefined),
  onConnectTandem: jest.fn().mockResolvedValue(undefined),
  onDexcomEmailChange: jest.fn(),
  onDexcomPasswordChange: jest.fn(),
  onDexcomRegionChange: jest.fn(),
  onDisconnectDexcom: jest.fn().mockResolvedValue(undefined),
  onDisconnectTandem: jest.fn().mockResolvedValue(undefined),
  onTandemCountryChange: jest.fn(),
  onTandemEmailChange: jest.fn(),
  onTandemPasswordChange: jest.fn(),
};

describe("legacy connection sections", () => {
  it("keeps the original Dexcom structure and styling", () => {
    render(
      <CGMIntegrationsSection
        dexcom={null}
        dexcomEmail=""
        dexcomPassword=""
        dexcomRegion="US"
        isDexcomConnecting={false}
        {...sharedProps}
      />,
    );

    const sectionButton = screen.getByRole("button", {
      name: "CGM Integrations",
    });
    const dexcomButton = screen.getByRole("button", {
      name: "Dexcom Not Connected",
    });

    expect(sectionButton.parentElement).toHaveClass(
      "bg-white",
      "dark:bg-slate-900",
      "rounded-xl",
    );
    expect(
      screen.getByText(
        "Connect your Dexcom account to sync continuous glucose monitor data",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Dexcom Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Dexcom Password")).toBeInTheDocument();
    expect(within(dexcomButton).getByText("Not Connected")).toHaveClass(
      "rounded-full",
      "bg-slate-500/10",
    );
    expect(screen.queryByText("Source")).not.toBeInTheDocument();
  });

  it("keeps the original Tandem cloud structure, copy, and styling", () => {
    render(
      <CloudSyncSection
        isTandemConnecting={false}
        tandem={null}
        tandemCountry="US"
        tandemEmail=""
        tandemPassword=""
        {...sharedProps}
      />,
    );

    const sectionButton = screen.getByRole("button", { name: "Cloud Sync" });

    expect(sectionButton.parentElement).toHaveClass(
      "bg-white",
      "dark:bg-slate-900",
      "rounded-xl",
    );
    expect(
      screen.getByText(
        /Pull pump history from your vendor's cloud on a schedule or on demand/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Connect your Tandem t:connect account to sync pump and Control-IQ data",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Tandem t:connect Email")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Tandem t:connect Password"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Source")).not.toBeInTheDocument();
  });
});
