import { render, screen } from "@testing-library/react";
import {
  getAnalyticsConfig,
  getDataRetentionConfig,
  getPluginDeclarations,
  getStorageUsage,
} from "@/lib/api";
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
  };
});

const mockGetAnalyticsConfig = jest.mocked(getAnalyticsConfig);
const mockGetDataRetentionConfig = jest.mocked(getDataRetentionConfig);
const mockGetPluginDeclarations = jest.mocked(getPluginDeclarations);
const mockGetStorageUsage = jest.mocked(getStorageUsage);

describe("DataRetentionPage", () => {
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
});
