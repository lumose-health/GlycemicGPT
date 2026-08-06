import { fireEvent, render, screen } from "@testing-library/react";
import {
  getEmergencyContacts,
  getTargetGlucoseRange,
  listIntegrations,
  listNightscoutConnections,
} from "@/lib/api";
import EmergencyContactsPage from "./emergency-contacts/page";
import GlucoseRangePage from "./glucose-range/page";
import IntegrationsSettings from "./integrations/IntegrationsSettings";

const mockRouter = { replace: jest.fn() };

jest.mock("next/navigation", () => ({
  usePathname: () => "/settings/test",
  useRouter: () => mockRouter,
}));

jest.mock("@/hooks/use-glucose-unit", () => ({
  useGlucoseUnit: () => "mgdl",
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    getEmergencyContacts: jest.fn(),
    getTargetGlucoseRange: jest.fn(),
    listIntegrations: jest.fn(),
    listNightscoutConnections: jest.fn(),
  };
});

const mockGetEmergencyContacts = jest.mocked(getEmergencyContacts);
const mockGetTargetGlucoseRange = jest.mocked(getTargetGlucoseRange);
const mockListIntegrations = jest.mocked(listIntegrations);
const mockListNightscoutConnections = jest.mocked(listNightscoutConnections);

beforeEach(() => {
  jest.clearAllMocks();
});

describe("settings retry loading feedback", () => {
  it("blocks duplicate emergency contact retries", async () => {
    mockGetEmergencyContacts.mockRejectedValueOnce(
      new Error("Network unavailable"),
    );
    mockGetEmergencyContacts.mockReturnValueOnce(new Promise(() => undefined));

    render(<EmergencyContactsPage />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Retry connection" }),
    );

    expect(screen.getByRole("button", { name: "Retrying..." })).toBeDisabled();
    expect(mockGetEmergencyContacts).toHaveBeenCalledTimes(2);
  });

  it("blocks duplicate glucose range retries", async () => {
    mockGetTargetGlucoseRange.mockRejectedValueOnce(
      new Error("Network unavailable"),
    );
    mockGetTargetGlucoseRange.mockReturnValueOnce(new Promise(() => undefined));

    render(<GlucoseRangePage />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Retry connection" }),
    );

    expect(screen.getByRole("button", { name: "Retrying..." })).toBeDisabled();
    expect(mockGetTargetGlucoseRange).toHaveBeenCalledTimes(2);
  });

  it("blocks duplicate integration request pairs", async () => {
    mockListIntegrations.mockRejectedValueOnce(
      new Error("Network unavailable"),
    );
    mockListNightscoutConnections.mockRejectedValueOnce(
      new Error("Network unavailable"),
    );
    mockListIntegrations.mockReturnValueOnce(new Promise(() => undefined));
    mockListNightscoutConnections.mockReturnValueOnce(
      new Promise(() => undefined),
    );

    render(<IntegrationsSettings />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Retry connection" }),
    );

    expect(screen.getByRole("button", { name: "Retrying..." })).toBeDisabled();
    expect(mockListIntegrations).toHaveBeenCalledTimes(2);
    expect(mockListNightscoutConnections).toHaveBeenCalledTimes(2);
  });
});
