import { fireEvent, render, screen } from "@testing-library/react";
import {
  getAlertThresholds,
  getAnalyticsConfig,
  getDataRetentionConfig,
  getEmergencyContacts,
  getEscalationConfig,
  getPluginDeclarations,
  getStorageUsage,
  getTargetGlucoseRange,
  listIntegrations,
  listCaregiverInvitations,
  listLinkedCaregivers,
  listNightscoutConnections,
} from "@/lib/api";
import AlertSettingsPage from "./alerts/page";
import { CaregiversSettings } from "./caregivers/CaregiversSettings";
import DataRetentionPage from "./data/page";
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
    getAlertThresholds: jest.fn(),
    getAnalyticsConfig: jest.fn(),
    getDataRetentionConfig: jest.fn(),
    getEmergencyContacts: jest.fn(),
    getEscalationConfig: jest.fn(),
    getPluginDeclarations: jest.fn(),
    getStorageUsage: jest.fn(),
    getTargetGlucoseRange: jest.fn(),
    listIntegrations: jest.fn(),
    listCaregiverInvitations: jest.fn(),
    listLinkedCaregivers: jest.fn(),
    listNightscoutConnections: jest.fn(),
  };
});

const mockGetAlertThresholds = jest.mocked(getAlertThresholds);
const mockGetAnalyticsConfig = jest.mocked(getAnalyticsConfig);
const mockGetDataRetentionConfig = jest.mocked(getDataRetentionConfig);
const mockGetEmergencyContacts = jest.mocked(getEmergencyContacts);
const mockGetEscalationConfig = jest.mocked(getEscalationConfig);
const mockGetPluginDeclarations = jest.mocked(getPluginDeclarations);
const mockGetStorageUsage = jest.mocked(getStorageUsage);
const mockGetTargetGlucoseRange = jest.mocked(getTargetGlucoseRange);
const mockListIntegrations = jest.mocked(listIntegrations);
const mockListCaregiverInvitations = jest.mocked(listCaregiverInvitations);
const mockListLinkedCaregivers = jest.mocked(listLinkedCaregivers);
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

  it("blocks duplicate alert settings retries", async () => {
    mockGetAlertThresholds.mockRejectedValueOnce(
      new Error("Network unavailable"),
    );
    mockGetEscalationConfig.mockResolvedValue({
      all_contacts_delay_minutes: 20,
      id: "escalation-1",
      primary_contact_delay_minutes: 10,
      reminder_delay_minutes: 5,
      updated_at: "2026-08-01T10:00:00.000Z",
    });
    mockGetAlertThresholds.mockReturnValueOnce(new Promise(() => undefined));

    render(<AlertSettingsPage />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Retry connection" }),
    );

    expect(screen.getByRole("button", { name: "Retrying..." })).toBeDisabled();
    expect(mockGetAlertThresholds).toHaveBeenCalledTimes(2);
  });

  it("blocks duplicate data settings retries", async () => {
    mockGetDataRetentionConfig.mockRejectedValueOnce(
      new Error("Network unavailable"),
    );
    mockGetStorageUsage.mockRejectedValueOnce(new Error("Network unavailable"));
    mockGetAnalyticsConfig.mockRejectedValue(new Error("Network unavailable"));
    mockGetPluginDeclarations.mockRejectedValue(
      new Error("Network unavailable"),
    );
    mockGetDataRetentionConfig.mockReturnValueOnce(
      new Promise(() => undefined),
    );
    mockGetStorageUsage.mockResolvedValue(
      {} as Awaited<ReturnType<typeof getStorageUsage>>,
    );

    render(<DataRetentionPage />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Retry connection" }),
    );

    expect(screen.getByRole("button", { name: "Retrying..." })).toBeDisabled();
    expect(mockGetDataRetentionConfig).toHaveBeenCalledTimes(2);
  });

  it("blocks duplicate caregiver invitation retries", async () => {
    mockListCaregiverInvitations.mockRejectedValueOnce(
      new Error("Network unavailable"),
    );
    mockListLinkedCaregivers.mockResolvedValue({ caregivers: [], count: 0 });
    mockListCaregiverInvitations.mockReturnValueOnce(
      new Promise(() => undefined),
    );

    render(<CaregiversSettings />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Retry connection" }),
    );

    expect(screen.getByRole("button", { name: "Retrying..." })).toBeDisabled();
    expect(mockListCaregiverInvitations).toHaveBeenCalledTimes(2);
  });
});
