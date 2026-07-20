import { render, screen, waitFor, within } from "@testing-library/react";
import DashboardNewDesignPage from "@/app/dashboard-new-design/page";
import { hasNightscoutPumpHint } from "@/components/dashboard-new-design/pump-history-context";
import { listIntegrations, listNightscoutConnections } from "@/lib/api";

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: jest.fn(),
  }),
}));

jest.mock("@/components/dashboard-new-design/animated-card", () => ({
  AnimatedCard: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => (
    <div className={className}>{children}</div>
  ),
}));

jest.mock("@/components/dashboard-new-design/page-transition", () => ({
  PageTransition: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

jest.mock("@/components/dashboard-new-design", () => ({
  AgpChart: () => <div data-testid="agp-chart" />,
  BolusReviewTable: () => <div data-testid="bolus-review-table" />,
  CgmSummaryStats: () => <div data-testid="cgm-summary-stats" />,
  ConnectionStatusBanner: () => <div data-testid="connection-status-banner" />,
  DashboardTimeRangePicker: () => <div data-testid="dashboard-time-range-picker" />,
  DashboardTimeRangeQuickSelect: ({ ranges }: { ranges?: string[] }) => (
    <div
      data-ranges={ranges?.join(",")}
      data-testid="dashboard-time-range-quick-select"
    />
  ),
  DashboardTimeRangeProvider: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DataSourcesFreshnessCard: ({
    dexcom,
    now,
  }: {
    dexcom: { last_sync_at: string | null } | null;
    now: number;
  }) => (
    <div
      data-dexcom-last-sync={dexcom?.last_sync_at ?? ""}
      data-now={String(now)}
      data-testid="freshness-card"
    />
  ),
  GlucoseHero: ({
    embedded,
    readingAgeNow,
    showPumpStats,
    timestamp,
  }: {
    embedded?: boolean;
    readingAgeNow?: number;
    showPumpStats?: boolean;
    timestamp?: string | null;
  }) => (
    <div
      data-embedded={String(Boolean(embedded))}
      data-reading-age-now={String(readingAgeNow ?? "")}
      data-show-pump-stats={String(Boolean(showPumpStats))}
      data-timestamp={timestamp ?? ""}
      data-testid="glucose-hero"
    >
      Current glucose reading
    </div>
  ),
  GlucoseTrendChart: () => <div data-testid="glucose-trend-chart" />,
  MergedGlucoseTrendChart: () => (
    <div data-testid="merged-glucose-trend-chart" />
  ),
  GlucoseUnitSeedNotice: () => null,
  InsulinSummaryStats: () => <div data-testid="insulin-summary-stats" />,
  LivePumpStats: ({
    basalRate,
    batteryPct,
    iob,
    reservoirUnits,
  }: {
    basalRate: number | null;
    batteryPct: number | null;
    iob: number | null;
    reservoirUnits: number | null;
  }) => (
    <div data-testid="live-pump-stats">
      IOB: {iob} Basal: {basalRate} Battery: {batteryPct} Reservoir:{" "}
      {reservoirUnits}
    </div>
  ),
  PERIOD_LABELS: {
    "24h": "24h",
  },
  TimeInRangePanel: () => <div data-testid="time-in-range-panel" />,
  parseLoopState: (value: string) => value,
  useDashboardTimeRange: () => ({
    currentWindow: {
      from: "2026-07-03T10:00:00.000Z",
      to: "2026-07-04T10:00:00.000Z",
    },
    label: "Last 24 hours",
    selection: { kind: "preset", range: "24h" },
    setSelection: jest.fn(),
    timeZone: "UTC",
  }),
}));

jest.mock("@/providers", () => ({
  useGlucoseStreamContext: () => ({
    glucose: {
      iob: { current: 1.2 },
      reading_timestamp: "2026-07-04T10:00:00.000Z",
      trend: "Stable",
      value: 120,
    },
    isLive: true,
    isReconnecting: false,
    error: null,
    reconnect: jest.fn(),
  }),
  useUserContext: () => ({
    user: { role: "diabetic" },
    isLoading: false,
  }),
}));

jest.mock("@/hooks/use-glucose-unit", () => ({
  useGlucoseUnit: () => "mgdl",
}));

jest.mock("@/hooks/use-time-in-range-stats", () => ({
  useTimeInRangeDetailStats: () => ({
    stats: {
      buckets: [{ label: "in_range", pct: 82 }],
      readings_count: 12,
    },
    isLoading: false,
    error: null,
    period: "24h",
    setPeriod: jest.fn(),
  }),
}));

jest.mock("@/hooks/use-glucose-stats", () => ({
  useGlucoseStats: () => ({
    stats: null,
    isLoading: false,
    error: null,
    period: "24h",
    setPeriod: jest.fn(),
  }),
}));

jest.mock("@/hooks/use-glucose-range", () => ({
  useGlucoseRange: () => ({
    high: 180,
    low: 70,
    urgentHigh: 250,
    urgentLow: 55,
  }),
}));

jest.mock("@/hooks/use-pump-status", () => ({
  usePumpStatus: () => ({
    basal: { rate: 0.8 },
    battery: { percentage: 75 },
    cobGrams: null,
    loopStatus: null,
    override: null,
    reservoir: { units_remaining: 120 },
  }),
}));

jest.mock("@/hooks/use-forecast", () => ({
  useForecast: () => ({
    forecast: null,
  }),
}));

jest.mock("@/lib/api", () => ({
  listIntegrations: jest.fn(),
  listNightscoutConnections: jest.fn(),
}));

const mockListIntegrations = listIntegrations as jest.MockedFunction<
  typeof listIntegrations
>;
const mockListNightscoutConnections =
  listNightscoutConnections as jest.MockedFunction<
    typeof listNightscoutConnections
  >;

const NOW_MS = new Date("2026-07-04T10:05:06.000Z").getTime();
const DEXCOM_LAST_SYNC_AT = "2026-07-04T10:00:00.000Z";

describe("Dashboard new design live data panel", () => {
  beforeEach(() => {
    jest.spyOn(Date, "now").mockReturnValue(NOW_MS);
    mockListIntegrations.mockReturnValue(new Promise(() => {}));
    mockListNightscoutConnections.mockReturnValue(new Promise(() => {}));
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it("renders the split live CGM, pump stats, and connections panels", () => {
    render(<DashboardNewDesignPage />);

    const liveCgmPanel = screen.getByRole("region", { name: "Live CGM" });
    const livePumpStatsPanel = screen.getByRole("region", {
      name: /Live pump/i,
    });
    const connectionsPanel = screen.getByRole("region", { name: /Connections/i });
    const glucoseTrendPanel = screen.getByRole("region", {
      name: "Glucose Trend",
    });
    const mergedGlucoseTrendPanel = screen.getByRole("region", {
      name: "Merged Glucose Trend",
    });

    expect(
      within(liveCgmPanel).getByRole("heading", {
        level: 2,
        name: "Live CGM",
      }),
    ).toBeInTheDocument();
    expect(
      within(liveCgmPanel)
        .getByRole("heading", { level: 2, name: "Live CGM" })
        .closest("header"),
    ).toHaveClass(
      "sr-only",
      "lg:not-sr-only",
      "lg:px-4",
      "lg:py-3",
    );
    expect(within(liveCgmPanel).getByTestId("glucose-hero")).toHaveAttribute(
      "data-embedded",
      "true",
    );
    expect(
      mergedGlucoseTrendPanel.compareDocumentPosition(glucoseTrendPanel) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(mergedGlucoseTrendPanel).toHaveClass(
      "-mx-dashboard-panel-gap",
      "rounded-none",
      "lg:mx-0",
      "lg:rounded-panel",
    );
    expect(
      within(mergedGlucoseTrendPanel)
        .getByRole("heading", { name: "Merged Glucose Trend" })
        .closest("header"),
    ).toHaveClass("sr-only", "lg:not-sr-only");
    expect(
      within(liveCgmPanel).getByTestId("glucose-hero"),
    ).toHaveAttribute("data-show-pump-stats", "false");
    expect(
      within(livePumpStatsPanel).getByRole("heading", {
        level: 2,
        name: /Live pump/i,
      }),
    ).toBeInTheDocument();
    expect(
      within(livePumpStatsPanel).getByTestId("live-pump-stats"),
    ).toHaveTextContent("IOB: 1.2");
    expect(
      within(connectionsPanel).getByRole("heading", {
        level: 2,
        name: /Connections/i,
      }),
    ).toBeInTheDocument();
    expect(
      within(connectionsPanel).getByText("No connected data sources yet."),
    ).toBeInTheDocument();
    expect(connectionsPanel).toHaveClass("hidden", "lg:block");
    expect(liveCgmPanel.parentElement).toHaveClass(
      "gap-dashboard-panel-gap",
    );
    expect(liveCgmPanel.parentElement?.className).toContain(
      "lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.6fr)_minmax(0,1fr)]",
    );
    expect(liveCgmPanel.parentElement?.parentElement).toHaveClass(
      "space-y-dashboard-panel-gap",
    );
    expect(
      screen.queryByRole("heading", { level: 3, name: "Data Sources" }),
    ).not.toBeInTheDocument();
  });

  it("places CGM summary before insulin summary and above AGP", () => {
    render(<DashboardNewDesignPage />);

    const cgmSummary = screen.getByTestId("cgm-summary-stats");
    const insulinSummary = screen.getByTestId("insulin-summary-stats");
    const agpChart = screen.getByTestId("agp-chart");

    expect(
      cgmSummary.compareDocumentPosition(insulinSummary) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      insulinSummary.compareDocumentPosition(agpChart) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("keeps the sticky time range toolbar after all live panels", () => {
    render(<DashboardNewDesignPage />);

    const liveConnectionsPanel = screen.getByRole("region", {
      name: /Connections/i,
    });
    const toolbarRegion = screen.getByLabelText("Dashboard time range");

    expect(
      liveConnectionsPanel.compareDocumentPosition(toolbarRegion) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(toolbarRegion).toHaveClass(
      "sticky",
      "-top-dashboard-panel-gap",
      "-mx-dashboard-panel-gap",
      "px-dashboard-panel-gap",
    );
    expect(toolbarRegion).not.toHaveClass("order-first");
    expect(
      within(toolbarRegion).getByTestId("dashboard-time-range-quick-select"),
    ).toHaveAttribute("data-ranges", "3h,6h,12h,24h");
    expect(within(toolbarRegion).queryByText("Create report")).not.toBeInTheDocument();
    expect(
      within(toolbarRegion).queryByRole("button", { name: "Share dashboard" }),
    ).not.toBeInTheDocument();
  });

  it("uses the Dexcom freshness timestamp and clock for the Live CGM age", async () => {
    mockListIntegrations.mockResolvedValue({
      integrations: [
        {
          created_at: "2026-07-01T00:00:00.000Z",
          integration_type: "dexcom",
          last_error: null,
          last_sync_at: DEXCOM_LAST_SYNC_AT,
          region: null,
          status: "connected",
          updated_at: "2026-07-01T00:00:00.000Z",
        },
      ],
    });
    mockListNightscoutConnections.mockResolvedValue({ connections: [] });

    render(<DashboardNewDesignPage />);

    await waitFor(() => {
      expect(screen.getByTestId("freshness-card")).toHaveAttribute(
        "data-dexcom-last-sync",
        DEXCOM_LAST_SYNC_AT,
      );
    });

    expect(screen.getByTestId("freshness-card")).toHaveAttribute(
      "data-now",
      String(NOW_MS),
    );
    expect(screen.getByTestId("glucose-hero")).toHaveAttribute(
      "data-timestamp",
      DEXCOM_LAST_SYNC_AT,
    );
    expect(screen.getByTestId("glucose-hero")).toHaveAttribute(
      "data-reading-age-now",
      String(NOW_MS),
    );
  });
});

describe("hasNightscoutPumpHint", () => {
  const connection = {
    id: "nightscout-1",
    name: "Nightscout",
    base_url: "https://nightscout.example",
    auth_type: "token" as const,
    api_version: "v3" as const,
    is_active: true,
    has_credential: true,
    sync_interval_minutes: 5,
    initial_sync_window_days: 30,
    last_sync_status: "ok" as const,
    last_synced_at: null,
    last_sync_error: null,
    last_evaluated_at: null,
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
  };

  it("does not treat generic device status data as pump evidence", () => {
    expect(
      hasNightscoutPumpHint({
        ...connection,
        detected_uploaders_json: {
          has_devicestatus: true,
          uploaders_detected: ["xdrip"],
        },
      })
    ).toBe(false);
  });

  it("recognizes explicit loop or pump metadata", () => {
    expect(
      hasNightscoutPumpHint({
        ...connection,
        detected_uploaders_json: { active_pump_loop: "aaps" },
      })
    ).toBe(true);
    expect(
      hasNightscoutPumpHint({
        ...connection,
        detected_uploaders_json: { pump: "tandem" },
      })
    ).toBe(true);
  });
});
