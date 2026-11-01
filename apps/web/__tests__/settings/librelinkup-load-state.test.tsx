import { fireEvent, render, screen, within } from "@testing-library/react";
import IntegrationsPage from "@/app/v2/(authenticated)/settings/integrations/IntegrationsSettings";
import { listIntegrations, listNightscoutConnections } from "@/lib/api";

const mockRouter = { replace: jest.fn() };
jest.mock("next/navigation", () => ({
  usePathname: () => "/settings/integrations",
  useRouter: () => mockRouter,
}));
jest.mock("@/lib/api", () => ({
  listIntegrations: jest.fn(),
  listNightscoutConnections: jest.fn(),
}));
jest.mock("@/components/integrations/CgmConnectionsSection", () => ({
  CgmConnectionsSection: () => null,
}));
jest.mock("@/components/integrations/CloudConnectionsSection", () => ({
  CloudConnectionsSection: () => null,
}));
jest.mock("@/components/integrations/CgmSourceSettings", () => ({
  CgmSourceSettings: () => null,
}));
jest.mock("@/components/integrations/ForecastSourceSettings", () => ({
  ForecastSourceSettings: () => null,
}));
jest.mock("@/components/integrations/NightscoutConnectionSettings", () => ({
  NightscoutConnectionSettings: () => null,
}));

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(listNightscoutConnections).mockResolvedValue({ connections: [] });
});

it.each(["all", "cgm"] as const)(
  "shows unknown after a failed load and recovers on retry in the %s tab",
  async (activeTab) => {
    jest
      .mocked(listIntegrations)
      .mockRejectedValueOnce(new Error("503 Service unavailable"))
      .mockResolvedValueOnce({ integrations: [] });
    render(<IntegrationsPage activeTab={activeTab} />);
    const accordion = await screen.findByRole("button", {
      name: /FreeStyle Libre.*Unknown/,
    });
    expect(screen.getByText(/Could not load.*LibreLinkUp/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /FreeStyle Libre.*Not Connected/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(accordion);
    const region = screen.getByRole("region", {
      name: /FreeStyle Libre.*Unknown/,
    });
    expect(
      within(region).queryByRole("button", { name: "Test Connection" }),
    ).not.toBeInTheDocument();
    fireEvent.click(within(region).getByRole("button", { name: "Retry" }));
    expect(
      await screen.findByRole("button", {
        name: /FreeStyle Libre.*Not Connected/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Could not load.*LibreLinkUp/),
    ).not.toBeInTheDocument();
  },
);
