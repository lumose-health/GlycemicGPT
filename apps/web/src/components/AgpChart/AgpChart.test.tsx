import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import uPlot from "uplot";
import {
  AgpChart,
  buildAgpBuckets,
  formatHour,
  transformBuckets,
} from "./AgpChart";

const mockRefetch = jest.fn();
const mockDestroy = jest.fn();
const mockUseGlucoseHistory = jest.fn();

let mockDashboardTimeRange = {
  currentWindow: {
    from: "2026-07-01T00:00:00.000Z",
    to: "2026-07-15T00:00:00.000Z",
  },
  label: "Last 14 days",
  timeZone: "UTC",
};

let mockHookReturn = {
  readings: [] as ReturnType<typeof makeReadings>,
  isLoading: false,
  error: null as string | null,
  period: "3h" as const,
  setPeriod: jest.fn(),
  refetch: mockRefetch,
};

jest.mock("@/components/DashboardTimeRangeProvider", () => ({
  useDashboardTimeRange: () => mockDashboardTimeRange,
}));

jest.mock("@/hooks/use-glucose-history", () => ({
  useGlucoseHistory: (...args: unknown[]) => mockUseGlucoseHistory(...args),
}));

jest.mock("uplot", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({ destroy: mockDestroy })),
}));

const mockUPlot = uPlot as unknown as jest.Mock;

function makeReadings() {
  return Array.from({ length: 24 }, (_, hour) =>
    [65, 80, 105, 135, 175].map((value, index) => ({
      value: value + hour,
      reading_timestamp: `2026-07-01T${String(hour).padStart(2, "0")}:${String(index).padStart(2, "0")}:00.000Z`,
      trend: "Flat",
      trend_rate: null,
      received_at: `2026-07-01T${String(hour).padStart(2, "0")}:${String(index).padStart(2, "0")}:01.000Z`,
      source: "test",
    })),
  ).flat();
}

function makeReadingsWithEmptyHour(emptyHour: number) {
  return makeReadings().filter(
    (reading) => new Date(reading.reading_timestamp).getUTCHours() !== emptyHour,
  );
}

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => 720,
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get: () => 320,
  });

  class ResizeObserverMock {
    constructor(private callback: ResizeObserverCallback) {}

    observe(target: Element) {
      this.callback([{ target } as ResizeObserverEntry], this);
    }

    disconnect() {}
    unobserve() {}
  }

  global.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;
});

beforeEach(() => {
  jest.clearAllMocks();
  mockDashboardTimeRange = {
    currentWindow: {
      from: "2026-07-01T00:00:00.000Z",
      to: "2026-07-15T00:00:00.000Z",
    },
    label: "Last 14 days",
    timeZone: "UTC",
  };
  mockHookReturn = {
    readings: [],
    isLoading: false,
    error: null,
    period: "3h",
    setPeriod: jest.fn(),
    refetch: mockRefetch,
  };
  mockUseGlucoseHistory.mockImplementation(() => mockHookReturn);
});

describe("Dashboard AgpChart", () => {
  it("renders the AGP inside Panel and plots percentile bands with uPlot", async () => {
    mockHookReturn.readings = makeReadings();

    render(<AgpChart />);

    expect(
      screen.getByRole("heading", { name: "Ambulatory Glucose Profile" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("agp-chart")).toHaveClass("rounded-panel");
    expect(
      screen.queryByText("Daily glucose percentile bands"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("1,200 readings")).not.toBeInTheDocument();
    expect(
      screen.getByRole("img", {
        name: /Ambulatory glucose percentile bands for Last 14 days/,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(mockUseGlucoseHistory).toHaveBeenCalledWith(
      "3h",
      mockDashboardTimeRange.currentWindow,
    );

    await waitFor(() => expect(mockUPlot).toHaveBeenCalledTimes(1));
    const [options, values] = mockUPlot.mock.calls[0] as [
      {
        axes: Array<{
          splits?: (chart: { bbox: { width: number } }) => number[];
        }>;
        bands: Array<{ series: [number, number]; dir: number }>;
        series: Array<{ label?: string; dash?: number[] }>;
      },
      number[][],
    ];

    expect(options.bands.map((band) => band.series)).toEqual([
      [1, 5],
      [2, 4],
    ]);
    expect(options.bands.map((band) => band.dir)).toEqual([1, 1]);
    expect(options.series[3].label).toBe("Median");
    expect(options.axes[0].splits?.({ bbox: { width: 390 } })).toEqual([
      0, 6, 12, 18,
    ]);
    expect(options.axes[0].splits?.({ bbox: { width: 720 } })).toEqual([
      0, 3, 6, 9, 12, 15, 18, 21,
    ]);
    expect(values[0]).toEqual(Array.from({ length: 24 }, (_, hour) => hour));
    expect(values[3][0]).toBe(105);
    expect(values[6]).toEqual(Array(24).fill(70));
    expect(values[7]).toEqual(Array(24).fill(180));
  });

  it("plots null percentile values for an hour with no readings", async () => {
    mockHookReturn.readings = makeReadingsWithEmptyHour(6);

    render(<AgpChart />);

    await waitFor(() => expect(mockUPlot).toHaveBeenCalledTimes(1));
    const [, values] = mockUPlot.mock.calls[0] as [
      unknown,
      Array<Array<number | null>>,
    ];

    expect(values.slice(1, 6).map((series) => series[6])).toEqual([
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(values.slice(1, 6).map((series) => series[5])).toEqual([
      76,
      85,
      110,
      140,
      164,
    ]);
  });

  it("uses custom target thresholds and shows percentile details on hover", async () => {
    mockHookReturn.readings = makeReadings();

    render(
      <AgpChart
        thresholds={{ urgentLow: 50, low: 80, high: 200, urgentHigh: 300 }}
      />,
    );

    await waitFor(() => expect(mockUPlot).toHaveBeenCalledTimes(1));
    const [options, values] = mockUPlot.mock.calls[0] as [
      {
        hooks: {
          setCursor: Array<
            (chart: { cursor: { idx: number; left: number | null } }) => void
          >;
        };
      },
      number[][],
    ];

    expect(values[6]).toEqual(Array(24).fill(80));
    expect(values[7]).toEqual(Array(24).fill(200));

    act(() => {
      options.hooks.setCursor[0]({ cursor: { idx: 6, left: 100 } });
    });

    expect(screen.getByTestId("agp-tooltip")).toHaveTextContent("6 AM");
    expect(screen.getByTestId("agp-tooltip")).toHaveTextContent(
      "Median: 111 mg/dL",
    );
    expect(screen.getByTestId("agp-tooltip")).not.toHaveTextContent("readings");
  });

  it("includes clamped target thresholds in the Y axis domain", async () => {
    mockHookReturn.readings = makeReadings();

    render(
      <AgpChart
        thresholds={{ urgentLow: 20, low: 20, high: 500, urgentHigh: 500 }}
      />,
    );

    await waitFor(() => expect(mockUPlot).toHaveBeenCalledTimes(1));
    const [options] = mockUPlot.mock.calls[0] as [
      { scales: { y: { range: [number, number] } } },
    ];

    expect(options.scales.y.range).toEqual([20, 500]);
  });

  it("supports keyboard navigation across all hourly percentile details", async () => {
    mockHookReturn.readings = makeReadings();

    render(<AgpChart />);

    const chart = screen.getByRole("img", {
      name: /Ambulatory glucose percentile bands for Last 14 days/,
    });
    act(() => chart.focus());

    expect(chart).toHaveFocus();
    expect(screen.getByText(/12 AM\. Median: 105 mg\/dL/)).toBeInTheDocument();

    fireEvent.keyDown(chart, { key: "ArrowRight" });
    expect(screen.getByText(/1 AM\. Median: 106 mg\/dL/)).toBeInTheDocument();

    fireEvent.keyDown(chart, { key: "End" });
    expect(screen.getByText(/11 PM\. Median: 128 mg\/dL/)).toBeInTheDocument();

    fireEvent.keyDown(chart, { key: "ArrowRight" });
    expect(screen.getByText(/12 AM\. Median: 105 mg\/dL/)).toBeInTheDocument();
  });

  it("keeps loading, error, and retry behavior inside the Panel", () => {
    mockHookReturn.isLoading = true;
    const { rerender } = render(<AgpChart />);

    expect(screen.getByTestId("agp-chart")).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(screen.getByLabelText("Loading AGP chart")).toBeInTheDocument();

    mockHookReturn.isLoading = false;
    mockHookReturn.error = "Network error";
    rerender(<AgpChart />);

    expect(screen.getByText("Unable to load AGP data")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it("shows guidance and skips data loading when the dashboard range is too short", () => {
    mockDashboardTimeRange = {
      currentWindow: {
        from: "2026-07-14T00:00:00.000Z",
        to: "2026-07-15T00:00:00.000Z",
      },
      label: "Last 24 hours",
      timeZone: "UTC",
    };

    render(<AgpChart />);

    expect(
      screen.getByText(
        "Select a time range of a minimum of 2 days to see the AGP chart.",
      ),
    ).toBeInTheDocument();
    expect(mockUseGlucoseHistory).not.toHaveBeenCalled();
  });

  it("loads AGP data when the dashboard range is exactly 2 days", () => {
    mockDashboardTimeRange = {
      currentWindow: {
        from: "2026-07-13T00:00:00.000Z",
        to: "2026-07-15T00:00:00.000Z",
      },
      label: "Last 2 days",
      timeZone: "UTC",
    };

    render(<AgpChart />);

    expect(mockUseGlucoseHistory).toHaveBeenCalledWith(
      "3h",
      mockDashboardTimeRange.currentWindow,
    );
    expect(
      screen.queryByText(
        "Select a time range of a minimum of 2 days to see the AGP chart.",
      ),
    ).not.toBeInTheDocument();
  });

  it("destroys the uPlot instance on unmount", async () => {
    mockHookReturn.readings = makeReadings();

    const { unmount } = render(<AgpChart />);
    await waitFor(() => expect(mockUPlot).toHaveBeenCalledTimes(1));
    unmount();
    expect(mockDestroy).toHaveBeenCalledTimes(1);
  });
});

describe("AGP data helpers", () => {
  it("formats hours and clamps percentile values", () => {
    expect(formatHour(0)).toBe("12 AM");
    expect(formatHour(12)).toBe("12 PM");
    expect(formatHour(23)).toBe("11 PM");

    expect(
      transformBuckets([
        { hour: 6, p10: 5, p25: 80, p50: 100, p75: 130, p90: 600, count: 42 },
      ])[0],
    ).toMatchObject({
      hour: 6,
      label: "6 AM",
      p10: 20,
      p50: 100,
      p90: 500,
      count: 42,
    });
  });

  it("groups readings by local hour and calculates interpolated percentiles", () => {
    const buckets = buildAgpBuckets(
      [
        ...makeReadings().slice(0, 5),
        {
          ...makeReadings()[0],
          value: 10,
        },
      ],
      "Europe/Stockholm",
    );

    expect(buckets[2]).toMatchObject({
      count: 5,
      p10: 71,
      p50: 105,
      p90: 159,
    });
    expect(buckets[0].count).toBe(0);
  });
});
