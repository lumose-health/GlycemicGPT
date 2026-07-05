import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import {
  GlucoseTrendChart,
  getPointColor,
} from "../../../src/components/dashboard-new-design/glucose-trend-chart";
import { GLUCOSE_THRESHOLDS } from "../../../src/components/dashboard-new-design/glucose-hero";
import uPlot from "uplot";

const mockSetPeriod = jest.fn();
const mockRefetch = jest.fn();
let mockHookReturn = {
  readings: [] as Array<{
    value: number;
    reading_timestamp: string;
    trend: string;
    trend_rate: number | null;
    received_at: string;
    source: string;
  }>,
  isLoading: false,
  error: null as string | null,
  period: "3h" as const,
  setPeriod: mockSetPeriod,
  refetch: mockRefetch,
};

jest.mock("../../../src/hooks/use-glucose-history", () => ({
  useGlucoseHistory: () => mockHookReturn,
}));

jest.mock("uplot", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(function MockUplot() {
    return {
      destroy: jest.fn(),
    };
  }),
}));

const mockUPlot = uPlot as unknown as jest.Mock;

function makeReading(value: number, minutesAgo: number): (typeof mockHookReturn.readings)[0] {
  const timestamp = new Date(Date.now() - minutesAgo * 60_000).toISOString();

  return {
    value,
    reading_timestamp: timestamp,
    trend: "flat",
    trend_rate: null,
    received_at: timestamp,
    source: "dexcom",
  };
}

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get() {
      return 640;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get() {
      return 320;
    },
  });

  class ResizeObserverMock {
    private callback: ResizeObserverCallback;

    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }

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
  document.documentElement.removeAttribute("class");
  document.documentElement.removeAttribute("style");
  mockHookReturn = {
    readings: [],
    isLoading: false,
    error: null,
    period: "3h",
    setPeriod: mockSetPeriod,
    refetch: mockRefetch,
  };
});

describe("dashboard-new-design GlucoseTrendChart", () => {
  it("maps glucose values to semantic signal tokens", () => {
    expect(getPointColor(54)).toBe("var(--color-signal-error-fill)");
    expect(getPointColor(55)).toBe("var(--color-signal-warning-fill)");
    expect(getPointColor(120)).toBe("var(--color-signal-check-fill)");
    expect(getPointColor(181)).toBe("var(--color-signal-warning-fill)");
    expect(getPointColor(251)).toBe("var(--color-signal-error-fill)");
  });

  it("handles exact threshold boundaries", () => {
    expect(getPointColor(GLUCOSE_THRESHOLDS.URGENT_LOW)).toBe("var(--color-signal-warning-fill)");
    expect(getPointColor(GLUCOSE_THRESHOLDS.LOW)).toBe("var(--color-signal-check-fill)");
    expect(getPointColor(GLUCOSE_THRESHOLDS.HIGH)).toBe("var(--color-signal-check-fill)");
    expect(getPointColor(GLUCOSE_THRESHOLDS.URGENT_HIGH)).toBe("var(--color-signal-warning-fill)");
  });

  it("renders the uPlot glucose chart with existing history data", async () => {
    mockHookReturn.readings = [
      makeReading(100, 15),
      makeReading(140, 10),
      makeReading(190, 5),
    ];

    render(<GlucoseTrendChart unit="mgdl" />);

    expect(screen.getByTestId("glucose-trend-chart")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /glucose readings for 3h/i })).toBeInTheDocument();
    expect(screen.queryByText("70-180 mg/dL Target")).not.toBeInTheDocument();
    expect(screen.queryByText("Drag chart to zoom")).not.toBeInTheDocument();

    await waitFor(() => expect(mockUPlot).toHaveBeenCalled());
    const [options, seriesData] = mockUPlot.mock.calls[0] as [{
      cursor: {
        x: boolean;
        y: boolean;
      };
    }, unknown[]];

    expect(options.cursor.x).toBe(true);
    expect(options.cursor.y).toBe(true);
    expect(seriesData[1]).toEqual([100, 140, 190]);
  });

  it("shows the range label in the hover tooltip instead of the chart body", async () => {
    mockHookReturn.readings = [
      makeReading(100, 15),
      makeReading(190, 5),
    ];

    render(<GlucoseTrendChart unit="mgdl" />);

    await waitFor(() => expect(mockUPlot).toHaveBeenCalled());
    expect(screen.queryByText("70-180 mg/dL Target")).not.toBeInTheDocument();
    expect(screen.queryByText("High/Low")).not.toBeInTheDocument();
    expect(screen.queryByText("Urgent")).not.toBeInTheDocument();

    const [options] = mockUPlot.mock.calls[0] as [{
      hooks: {
        setCursor: Array<(chart: { cursor: { idx: number; left: number; top: number } }) => void>;
      };
    }];

    act(() => {
      options.hooks.setCursor[0]({
        cursor: {
          idx: 0,
          left: 64,
          top: 48,
        },
      });
    });

    const tooltip = screen.getByText("70-180 mg/dL Target").closest("div");

    expect(tooltip).toHaveStyle({ left: "94px", top: "78px" });
  });

  it("moves the hover tooltip away from the cursor near chart edges", async () => {
    mockHookReturn.readings = [
      makeReading(100, 15),
      makeReading(190, 5),
    ];

    render(<GlucoseTrendChart unit="mgdl" />);

    await waitFor(() => expect(mockUPlot).toHaveBeenCalled());
    const [options] = mockUPlot.mock.calls[0] as [{
      hooks: {
        setCursor: Array<(chart: { cursor: { idx: number; left: number; top: number } }) => void>;
      };
    }];

    act(() => {
      options.hooks.setCursor[0]({
        cursor: {
          idx: 0,
          left: 620,
          top: 300,
        },
      });
    });

    const tooltip = screen.getByText("70-180 mg/dL Target").closest("div");

    expect(tooltip).toHaveStyle({ left: "382px", top: "154px" });
  });

  it("resolves chained semantic theme tokens before passing colors to uPlot", async () => {
    document.documentElement.style.setProperty("--chart-test-grid", "rgb(10, 20, 30)");
    document.documentElement.style.setProperty("--chart-test-axis", "rgb(40, 50, 60)");
    document.documentElement.style.setProperty("--chart-test-tick", "rgb(70, 80, 90)");
    document.documentElement.style.setProperty("--color-border-default", "var(--chart-test-grid)");
    document.documentElement.style.setProperty("--color-border-hover", "var(--chart-test-axis)");
    document.documentElement.style.setProperty("--color-foreground-secondary", "var(--chart-test-tick)");
    mockHookReturn.readings = [makeReading(120, 5)];

    render(<GlucoseTrendChart />);

    await waitFor(() => expect(mockUPlot).toHaveBeenCalled());
    const [options] = mockUPlot.mock.calls[mockUPlot.mock.calls.length - 1] as [{ axes: Array<{
      grid: { stroke: string };
      stroke: string;
      ticks: { stroke: string };
    }> }];

    expect(options.axes[0].grid.stroke).toBe("rgb(10, 20, 30)");
    expect(options.axes[0].ticks.stroke).toBe("rgb(40, 50, 60)");
    expect(options.axes[0].stroke).toBe("rgb(70, 80, 90)");
  });

  it("rebuilds the uPlot chart when the root theme class changes", async () => {
    mockHookReturn.readings = [makeReading(120, 5)];

    render(<GlucoseTrendChart />);

    await waitFor(() => expect(mockUPlot).toHaveBeenCalledTimes(1));
    document.documentElement.classList.add("theme-dark");

    await waitFor(() => expect(mockUPlot).toHaveBeenCalledTimes(2));
  });

  it("changes the selected period through the period selector", () => {
    mockHookReturn.readings = [makeReading(120, 5)];

    render(<GlucoseTrendChart />);

    fireEvent.click(screen.getByRole("radio", { name: "6H" }));
    expect(mockSetPeriod).toHaveBeenCalledWith("6h");
  });

  it("shows a retry action in the error state", () => {
    mockHookReturn.error = "Network error";

    render(<GlucoseTrendChart />);

    expect(screen.getByText("Unable to load glucose history")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });
});
