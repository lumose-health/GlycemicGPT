import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  getAnalyticsConfig,
  getDataRetentionConfig,
  getPluginDeclarations,
  getStorageUsage,
  updateAnalyticsConfig,
} from "@/lib/api";
import { useDashboardInvalidation } from "@/hooks/dashboard-query";
import DataRetentionPage from "./page";

const mockRouter = { replace: jest.fn() };

jest.mock("next/navigation", () => ({
  usePathname: () => "/settings/data-privacy",
  useRouter: () => mockRouter,
}));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    getAnalyticsConfig: jest.fn(),
    getDataRetentionConfig: jest.fn(),
    getPluginDeclarations: jest.fn(),
    getStorageUsage: jest.fn(),
    updateAnalyticsConfig: jest.fn(),
  };
});

jest.mock("@/hooks/dashboard-query", () => ({
  useDashboardInvalidation: jest.fn(),
}));

const mockGetAnalyticsConfig = jest.mocked(getAnalyticsConfig);
const mockGetDataRetentionConfig = jest.mocked(getDataRetentionConfig);
const mockGetPluginDeclarations = jest.mocked(getPluginDeclarations);
const mockGetStorageUsage = jest.mocked(getStorageUsage);
const mockUpdateAnalyticsConfig = jest.mocked(updateAnalyticsConfig);
const mockUseDashboardInvalidation = jest.mocked(useDashboardInvalidation);
const mockInvalidateAll = jest.fn();

const analyticsConfig = {
  category_labels: null,
  day_boundary_hour: 0,
  display_labels: null,
  id: "analytics-1",
  updated_at: "2026-08-07T00:00:00.000Z",
};

describe("DataRetentionPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseDashboardInvalidation.mockReturnValue({
      invalidateAll: mockInvalidateAll,
      invalidateResources: jest.fn(),
    });
    mockInvalidateAll.mockResolvedValue(undefined);
    mockGetDataRetentionConfig.mockResolvedValue({
      analysis_retention_days: 365,
      audit_retention_days: 730,
      glucose_retention_days: 365,
      id: "retention-1",
      updated_at: "2026-08-07T00:00:00.000Z",
    });
    mockGetStorageUsage.mockResolvedValue({
      analysis_records: 0,
      audit_records: 0,
      glucose_records: 0,
      pump_records: 0,
      total_records: 0,
    });
    mockGetAnalyticsConfig.mockResolvedValue(analyticsConfig);
    mockGetPluginDeclarations.mockResolvedValue(null);
  });

  it("keeps offline defaults separate from a loaded server baseline", async () => {
    mockGetDataRetentionConfig.mockRejectedValue(
      new Error("Network unavailable"),
    );
    mockGetStorageUsage.mockRejectedValue(new Error("Network unavailable"));
    mockGetAnalyticsConfig.mockRejectedValue(new Error("Network unavailable"));
    mockGetPluginDeclarations.mockRejectedValue(
      new Error("Network unavailable"),
    );

    render(<DataRetentionPage />);

    expect(
      await screen.findByRole("button", { name: "Retry connection" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Save Changes" })).toBeDisabled();
    for (const deleteButton of screen.getAllByRole("button", {
      name: /^Delete /,
    })) {
      expect(deleteButton).toBeDisabled();
    }
  });

  it("invalidates dashboard queries before confirming a boundary update", async () => {
    let finishInvalidation: (() => void) | undefined;
    mockInvalidateAll.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishInvalidation = resolve;
        }),
    );
    mockUpdateAnalyticsConfig.mockResolvedValue({
      ...analyticsConfig,
      day_boundary_hour: 1,
    });

    render(<DataRetentionPage />);

    const boundary = await screen.findByLabelText("Day starts at");
    fireEvent.change(boundary, { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Boundary" }));

    await waitFor(() => {
      expect(mockUpdateAnalyticsConfig).toHaveBeenCalledWith({
        day_boundary_hour: 1,
      });
      expect(mockInvalidateAll).toHaveBeenCalledTimes(1);
    });
    expect(
      screen.queryByText("Analytics day boundary updated successfully"),
    ).not.toBeInTheDocument();

    await act(async () => {
      finishInvalidation?.();
    });

    expect(
      await screen.findByText("Analytics day boundary updated successfully"),
    ).toBeVisible();
  });
});
