import { render, screen, within } from "@testing-library/react";
import { DataSourcesFreshnessCard } from "@/components/dashboard-new-design/data-sources-freshness-card";
import type {
  IntegrationResponse,
  NightscoutConnectionResponse,
  NightscoutSyncStatus,
} from "@/lib/api";

const NOW_MS = new Date("2026-05-08T12:00:00.000Z").getTime();

function nsConn(
  overrides: Partial<NightscoutConnectionResponse> = {},
): NightscoutConnectionResponse {
  return {
    api_version: "v1",
    auth_type: "secret",
    base_url: "https://example.com",
    created_at: "2026-05-01T00:00:00.000Z",
    detected_uploaders_json: null,
    has_credential: true,
    id: "ns-1",
    initial_sync_window_days: 7,
    is_active: true,
    last_evaluated_at: null,
    last_sync_error: null,
    last_sync_status: "ok" as NightscoutSyncStatus,
    last_synced_at: new Date(NOW_MS - 60_000).toISOString(),
    name: "Loop NS",
    sync_interval_minutes: 5,
    updated_at: "2026-05-01T00:00:00.000Z",
    ...overrides,
  };
}

function dexcomIntegration(
  overrides: Partial<IntegrationResponse> = {},
): IntegrationResponse {
  return {
    created_at: "2026-05-01T00:00:00.000Z",
    integration_type: "dexcom",
    last_error: null,
    last_sync_at: new Date(NOW_MS - 5 * 60_000).toISOString(),
    region: null,
    status: "connected",
    updated_at: "2026-05-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("Dashboard new design DataSourcesFreshnessCard", () => {
  it("renders rows without its own card frame when embedded in a panel", () => {
    render(
      <DataSourcesFreshnessCard
        dexcom={dexcomIntegration()}
        embedded
        nightscoutConnections={[nsConn()]}
        now={NOW_MS}
        tandem={null}
      />,
    );

    const dataSources = screen.getByLabelText("Data sources");

    expect(dataSources).not.toHaveClass("rounded-xl", "border", "bg-surface-primary");
    expect(screen.queryByRole("heading", { name: "Data Sources" })).not.toBeInTheDocument();
    expect(screen.getByText("Dexcom")).toBeInTheDocument();
    expect(screen.getByText("Loop NS")).toBeInTheDocument();
    expect(screen.getByText("(Nightscout)")).toHaveClass("text-foreground-primary");
  });

  it("renders embedded connection data with aligned column headings", () => {
    render(
      <DataSourcesFreshnessCard
        dexcom={dexcomIntegration()}
        embedded
        nightscoutConnections={[nsConn()]}
        now={NOW_MS}
        tandem={dexcomIntegration({
          integration_type: "tandem",
          last_sync_at: new Date(NOW_MS - 9 * 60_000).toISOString(),
        })}
      />,
    );

    const connectionsTable = screen.getByRole("table", {
      name: "Connections",
    });
    const columns = connectionsTable.querySelectorAll("col");

    expect(columns[0]).toHaveClass("w-[45%]", "sm:w-1/2");
    expect(columns[1]).toHaveClass("w-[7.25rem]");
    expect(columns[2]).not.toHaveAttribute("class");
    expect(
      within(connectionsTable).getByRole("columnheader", { name: "Device" }),
    ).toHaveClass("border-b", "border-border-default", "text-foreground-primary/80");
    expect(
      within(connectionsTable).getByRole("columnheader", { name: "Status" }),
    ).toHaveClass("text-foreground-primary/80");
    expect(
      within(connectionsTable).getByRole("columnheader", { name: "Updated" }),
    ).toHaveClass("text-right", "text-foreground-primary/80");
    expect(within(connectionsTable).getByRole("cell", { name: "Dexcom" })).toBeInTheDocument();
    expect(within(connectionsTable).getByRole("cell", { name: "Tandem" })).toBeInTheDocument();
    expect(within(connectionsTable).getAllByText("Connected")[0]).toHaveClass(
      "rounded-panel",
    );
    expect(within(connectionsTable).getByRole("cell", { name: "5m 0s ago" })).toHaveClass(
      "text-right",
      "whitespace-nowrap",
    );
  });

  it("keeps the standalone card frame by default", () => {
    render(
      <DataSourcesFreshnessCard
        dexcom={dexcomIntegration()}
        nightscoutConnections={[]}
        now={NOW_MS}
        tandem={null}
      />,
    );

    expect(screen.getByLabelText("Data sources")).toHaveClass(
      "rounded-xl",
      "border",
      "bg-surface-primary",
    );
    expect(screen.getByRole("heading", { name: "Data Sources" })).toBeInTheDocument();
  });
});
