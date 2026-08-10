import { render, screen } from "@testing-library/react";
import ConnectionsSettingsPage from "./page";

jest.mock("../integrations/IntegrationsSettings", () => ({
  __esModule: true,
  default: ({
    activeTab,
    openConnection,
  }: {
    activeTab: string;
    openConnection?: string;
  }) => (
    <div>
      Active integration category: {activeTab}; open connection:{" "}
      {openConnection ?? "none"}
    </div>
  ),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

async function renderPage(tab?: string, connection?: string) {
  render(
    await ConnectionsSettingsPage({
      searchParams: Promise.resolve({ connection, tab }),
    }),
  );
}

describe("ConnectionsSettingsPage", () => {
  it("defaults to the CGM tab with linkable categories", async () => {
    await renderPage();

    expect(screen.getByRole("tab", { name: "CGM" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.getByRole("tab", { name: "Insulin delivery" }),
    ).toHaveAttribute("href", "/settings/connections?tab=insulin-pumps");
    expect(
      screen.getByText(
        "Active integration category: cgm; open connection: none",
      ),
    ).toBeInTheDocument();
  });

  it("selects a category from the tab URL parameter", async () => {
    await renderPage("third-party");

    expect(
      screen.getByRole("tab", { name: "Third party integrations" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      screen.queryByRole("heading", {
        level: 2,
        name: "Third party integrations",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        "Connect services that can bring glucose and insulin data into Lumose.",
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Active integration category: third-party; open connection: none",
      ),
    ).toBeInTheDocument();
  });

  it("passes a supported connection target from the URL", async () => {
    await renderPage("third-party", "glooko");

    expect(
      screen.getByText(
        "Active integration category: third-party; open connection: glooko",
      ),
    ).toBeInTheDocument();
  });

  it("ignores an unknown connection target", async () => {
    await renderPage("third-party", "unknown");

    expect(
      screen.getByText(
        "Active integration category: third-party; open connection: none",
      ),
    ).toBeInTheDocument();
  });

  it("falls back to CGM for an unknown category", async () => {
    await renderPage("unknown");

    expect(screen.getByRole("tab", { name: "CGM" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});
