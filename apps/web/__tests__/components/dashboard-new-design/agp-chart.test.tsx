import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import uPlot from "uplot";
import {
  AgpChart,
  formatHour,
  transformBuckets
} from "../../../src/components/dashboard-new-design/agp-chart";

const mockSetPeriod = jest.fn();
const mockRefetch = jest.fn();
const mockDestroy = jest.fn();

let mockHookReturn = {
  data: null as null | {
    buckets: ReturnType<typeof makeBuckets>;
    period_days: number;
    readings_count: number;
    is_truncated: boolean;
  },
  isLoading: false,
  error: null as string | null,
  period: "14d" as const,
  setPeriod: mockSetPeriod,
  refetch: mockRefetch
};

jest.mock("../../../src/hooks/use-glucose-percentiles", () => ({
  useGlucosePercentiles: () => mockHookReturn,
  AGP_PERIOD_LABELS: {
    "7d": "7 Days",
    "14d": "14 Days",
    "30d": "30 Days",
    "90d": "90 Days"
  }
}));

jest.mock("uplot", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({ destroy: mockDestroy }))
}));

const mockUPlot = uPlot as unknown as jest.Mock;

function makeBuckets() {
  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    p10: 65 + hour,
    p25: 80 + hour,
    p50: 105 + hour,
    p75: 135 + hour,
    p90: 175 + hour,
    count: 50 + hour
  }));
}

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => 720
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get: () => 320
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
  mockHookReturn = {
    data: null,
    isLoading: false,
    error: null,
    period: "14d",
    setPeriod: mockSetPeriod,
    refetch: mockRefetch
  };
});

describe("dashboard new design AgpChart", () => {
  it("renders the AGP inside Panel and plots percentile bands with uPlot", async () => {
    mockHookReturn.data = {
      buckets: makeBuckets(),
      period_days: 14,
      readings_count: 1200,
      is_truncated: false
    };

    render(<AgpChart />);

    expect(
      screen.getByRole("heading", { name: "Ambulatory Glucose Profile" })
    ).toBeInTheDocument();
    expect(screen.getByTestId("agp-chart")).toHaveClass("rounded-panel");
    expect(screen.getByText("1,200 readings")).toBeInTheDocument();
    expect(
      screen.getByRole("img", {
        name: "Ambulatory glucose percentile bands for 14 Days"
      })
    ).toBeInTheDocument();

    await waitFor(() => expect(mockUPlot).toHaveBeenCalledTimes(1));
    const [options, values] = mockUPlot.mock.calls[0] as [
      {
        axes: Array<{
          splits?: (chart: { bbox: { width: number } }) => number[];
        }>;
        bands: Array<{ series: [number, number]; dir: number }>;
        series: Array<{ label?: string; dash?: number[] }>;
      },
      number[][]
    ];

    expect(options.bands.map((band) => band.series)).toEqual([
      [1, 5],
      [2, 4]
    ]);
    expect(options.bands.map((band) => band.dir)).toEqual([1, 1]);
    expect(options.series[3].label).toBe("Median");
    expect(options.axes[0].splits?.({ bbox: { width: 390 } })).toEqual([
      0, 6, 12, 18
    ]);
    expect(options.axes[0].splits?.({ bbox: { width: 720 } })).toEqual([
      0, 3, 6, 9, 12, 15, 18, 21
    ]);
    expect(values[0]).toEqual(Array.from({ length: 24 }, (_, hour) => hour));
    expect(values[3][0]).toBe(105);
    expect(values[6]).toEqual(Array(24).fill(70));
    expect(values[7]).toEqual(Array(24).fill(180));
  });

  it("uses custom target thresholds and shows percentile details on hover", async () => {
    mockHookReturn.data = {
      buckets: makeBuckets(),
      period_days: 14,
      readings_count: 1200,
      is_truncated: false
    };

    render(
      <AgpChart
        thresholds={{ urgentLow: 50, low: 80, high: 200, urgentHigh: 300 }}
      />
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
      number[][]
    ];

    expect(values[6]).toEqual(Array(24).fill(80));
    expect(values[7]).toEqual(Array(24).fill(200));

    act(() => {
      options.hooks.setCursor[0]({ cursor: { idx: 6, left: 100 } });
    });

    expect(screen.getByTestId("agp-tooltip")).toHaveTextContent("6 AM");
    expect(screen.getByTestId("agp-tooltip")).toHaveTextContent(
      "Median: 111 mg/dL"
    );
  });

  it("keeps loading, error, and retry behavior inside the Panel", () => {
    mockHookReturn.isLoading = true;
    const { rerender } = render(<AgpChart />);

    expect(screen.getByTestId("agp-chart")).toHaveAttribute(
      "aria-busy",
      "true"
    );
    expect(screen.getByLabelText("Loading AGP chart")).toBeInTheDocument();

    mockHookReturn.isLoading = false;
    mockHookReturn.error = "Network error";
    rerender(<AgpChart />);

    expect(screen.getByText("Unable to load AGP data")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it("changes periods with the accessible selector", () => {
    mockHookReturn.data = {
      buckets: makeBuckets(),
      period_days: 14,
      readings_count: 1200,
      is_truncated: false
    };

    render(<AgpChart />);
    fireEvent.click(screen.getByRole("radio", { name: "30 Days" }));
    expect(mockSetPeriod).toHaveBeenCalledWith("30d");
  });

  it("destroys the uPlot instance on unmount", async () => {
    mockHookReturn.data = {
      buckets: makeBuckets(),
      period_days: 14,
      readings_count: 1200,
      is_truncated: false
    };

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
        { hour: 6, p10: 5, p25: 80, p50: 100, p75: 130, p90: 600, count: 42 }
      ])[0]
    ).toMatchObject({
      hour: 6,
      label: "6 AM",
      p10: 20,
      p50: 100,
      p90: 500,
      count: 42
    });
  });
});
