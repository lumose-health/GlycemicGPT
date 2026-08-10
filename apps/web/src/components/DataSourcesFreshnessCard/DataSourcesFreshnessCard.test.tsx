import { act, render, screen, within } from "@testing-library/react";
import { DataSourcesFreshnessCard } from "@/components/DataSourcesFreshnessCard";
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

describe("Dashboard DataSourcesFreshnessCard", () => {
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

    expect(dataSources).not.toHaveClass(
      "rounded-panel",
      "border",
      "bg-surface-primary",
    );
    expect(
      screen.queryByRole("heading", { name: "Data Sources" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Dexcom")).toBeInTheDocument();
    expect(screen.getByText("Loop NS")).toBeInTheDocument();
    expect(screen.getByText("(Nightscout)")).toHaveClass(
      "text-foreground-primary",
    );
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
    ).toHaveClass(
      "border-b",
      "border-border-default",
      "text-foreground-primary/80",
    );
    expect(
      within(connectionsTable).getByRole("columnheader", { name: "Status" }),
    ).toHaveClass("text-foreground-primary/80");
    expect(
      within(connectionsTable).getByRole("columnheader", { name: "Updated" }),
    ).toHaveClass("text-right", "text-foreground-primary/80");
    expect(
      within(connectionsTable).getByRole("cell", { name: "Dexcom" }),
    ).toBeInTheDocument();
    expect(
      within(connectionsTable).getByRole("cell", { name: "Tandem" }),
    ).toBeInTheDocument();
    expect(within(connectionsTable).getAllByText("Connected")[0]).toHaveClass(
      "rounded-panel",
    );
    expect(
      within(connectionsTable).getByRole("cell", { name: "5m 0s ago" }),
    ).toHaveClass("text-right", "whitespace-nowrap");
  });

  it("marks Dexcom as lagging after five minutes", () => {
    const { rerender } = render(
      <DataSourcesFreshnessCard
        dexcom={dexcomIntegration()}
        embedded
        nightscoutConnections={[]}
        now={NOW_MS}
        tandem={null}
      />,
    );

    expect(screen.getByTestId("freshness-row-dexcom")).toHaveTextContent(
      "Connected",
    );

    rerender(
      <DataSourcesFreshnessCard
        dexcom={dexcomIntegration({
          last_sync_at: new Date(NOW_MS - 5 * 60_000 - 1_000).toISOString(),
        })}
        embedded
        nightscoutConnections={[]}
        now={NOW_MS}
        tandem={null}
      />,
    );

    expect(screen.getByTestId("freshness-row-dexcom")).toHaveTextContent(
      "Lagging",
    );
  });

  it("self ticks from connected to lagging without a parent rerender", () => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW_MS);

    render(
      <DataSourcesFreshnessCard
        dexcom={dexcomIntegration({
          last_sync_at: new Date(NOW_MS - 5 * 60_000).toISOString(),
        })}
        embedded
        nightscoutConnections={[]}
        tandem={null}
      />,
    );

    expect(screen.getByTestId("freshness-row-dexcom")).toHaveTextContent(
      "Connected",
    );

    act(() => {
      jest.advanceTimersByTime(2_000);
    });

    expect(screen.getByTestId("freshness-row-dexcom")).toHaveTextContent(
      "Lagging",
    );
    jest.useRealTimers();
  });

  it("marks Tandem as lagging after sixty minutes", () => {
    const tandem = dexcomIntegration({
      integration_type: "tandem",
      last_sync_at: new Date(NOW_MS - 60 * 60_000).toISOString(),
    });
    const { rerender } = render(
      <DataSourcesFreshnessCard
        dexcom={null}
        embedded
        nightscoutConnections={[]}
        now={NOW_MS}
        tandem={tandem}
      />,
    );

    expect(screen.getByTestId("freshness-row-tandem")).toHaveTextContent(
      "Connected",
    );

    rerender(
      <DataSourcesFreshnessCard
        dexcom={null}
        embedded
        nightscoutConnections={[]}
        now={NOW_MS}
        tandem={{
          ...tandem,
          last_sync_at: new Date(NOW_MS - 60 * 60_000 - 1_000).toISOString(),
        }}
      />,
    );

    expect(screen.getByTestId("freshness-row-tandem")).toHaveTextContent(
      "Lagging",
    );
  });

  it("renders Glooko, Medtronic, and additional CGM connections", () => {
    const updatedAt = new Date(NOW_MS - 2 * 60_000).toISOString();

    render(
      <DataSourcesFreshnessCard
        cgmSources={{
          multiple_sources: true,
          primary_source: "dexcom_share",
          sources: [
            {
              kind: "dexcom",
              label: "Dexcom Share",
              role: "primary",
              source: "dexcom_share",
            },
            {
              kind: "dexcom",
              label: "xDrip",
              role: "secondary",
              source: "xdrip_bridge",
            },
            {
              kind: "dexcom",
              label: "Glooko CGM",
              role: "secondary",
              source: "glooko_cgm",
            },
          ],
        }}
        cgmUpdatedAt={updatedAt}
        dexcom={null}
        embedded
        glooko={{
          connected: true,
          enabled: true,
          last_sync_at: updatedAt,
          status: "connected",
        }}
        medtronic={{
          connected: true,
          enabled: true,
          last_sync_at: updatedAt,
          status: "connected",
        }}
        nightscoutConnections={[]}
        now={NOW_MS}
        tandem={null}
      />,
    );

    expect(
      screen.getByTestId("freshness-row-cgm-xdrip_bridge"),
    ).toHaveTextContent("xDripConnected-");
    expect(screen.getByTestId("freshness-row-glooko")).toHaveTextContent(
      "Glooko",
    );
    expect(screen.getByTestId("freshness-row-medtronic")).toHaveTextContent(
      "Medtronic",
    );
    expect(screen.getAllByText("Connected")).toHaveLength(3);
    expect(screen.queryByText("Dexcom Share")).not.toBeInTheDocument();
    expect(screen.queryByText("Glooko CGM")).not.toBeInTheDocument();
  });

  it("uses the displayed glucose reading age when Dexcom is primary", () => {
    const cgmUpdatedAt = new Date(NOW_MS - 13 * 60_000).toISOString();

    render(
      <DataSourcesFreshnessCard
        cgmSources={{
          multiple_sources: false,
          primary_source: "dexcom_share",
          sources: [
            {
              kind: "dexcom",
              label: "Dexcom Share",
              role: "primary",
              source: "dexcom_share",
            },
          ],
        }}
        cgmUpdatedAt={cgmUpdatedAt}
        dexcom={dexcomIntegration({
          last_sync_at: new Date(NOW_MS - 5 * 60_000).toISOString(),
        })}
        embedded
        nightscoutConnections={[]}
        now={NOW_MS}
        tandem={null}
      />,
    );

    const dexcomRow = screen.getByTestId("freshness-row-dexcom");
    expect(dexcomRow).toHaveTextContent("13m 0s ago");
    expect(dexcomRow).not.toHaveTextContent("5m 0s ago");
  });

  it("keeps the integration sync age when another CGM source is primary", () => {
    render(
      <DataSourcesFreshnessCard
        cgmSources={{
          multiple_sources: true,
          primary_source: "xdrip_bridge",
          sources: [
            {
              kind: "dexcom",
              label: "xDrip",
              role: "primary",
              source: "xdrip_bridge",
            },
          ],
        }}
        cgmUpdatedAt={new Date(NOW_MS - 13 * 60_000).toISOString()}
        dexcom={dexcomIntegration({
          last_sync_at: new Date(NOW_MS - 5 * 60_000).toISOString(),
        })}
        embedded
        nightscoutConnections={[]}
        now={NOW_MS}
        tandem={null}
      />,
    );

    const dexcomRow = screen.getByTestId("freshness-row-dexcom");
    expect(dexcomRow).toHaveTextContent("5m 0s ago");
    expect(dexcomRow).not.toHaveTextContent("13m 0s ago");
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
      "rounded-panel",
      "border",
      "bg-surface-primary",
    );
    expect(
      screen.getByRole("heading", { name: "Data Sources" }),
    ).toBeInTheDocument();
  });
});
