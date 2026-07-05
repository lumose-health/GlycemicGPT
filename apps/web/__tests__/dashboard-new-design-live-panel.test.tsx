import { render, screen, within } from "@testing-library/react";
import DashboardNewDesignPage from "@/app/dashboard-new-design/page";

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: jest.fn(),
  }),
}));

jest.mock("@/components/dashboard-new-design/animated-card", () => ({
  AnimatedCard: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
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
  DashboardTimeRangeProvider: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DataSourcesFreshnessCard: () => null,
  GlucoseHero: ({
    embedded,
    showPumpStats,
  }: {
    embedded?: boolean;
    showPumpStats?: boolean;
  }) => (
    <div
      data-embedded={String(Boolean(embedded))}
      data-show-pump-stats={String(Boolean(showPumpStats))}
      data-testid="glucose-hero"
    >
      Current glucose reading
    </div>
  ),
  GlucoseTrendChart: () => <div data-testid="glucose-trend-chart" />,
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
  listIntegrations: jest.fn(() => new Promise(() => {})),
  listNightscoutConnections: jest.fn(() => new Promise(() => {})),
}));

describe("Dashboard new design live data panel", () => {
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

    expect(
      within(liveCgmPanel).getByRole("heading", {
        level: 2,
        name: "Live CGM",
      }),
    ).toBeInTheDocument();
    expect(within(liveCgmPanel).getByTestId("glucose-hero")).toHaveAttribute(
      "data-embedded",
      "true",
    );
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
    expect(
      within(glucoseTrendPanel).getByText("Drag chart to zoom"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 3, name: "Data Sources" }),
    ).not.toBeInTheDocument();
  });
});
