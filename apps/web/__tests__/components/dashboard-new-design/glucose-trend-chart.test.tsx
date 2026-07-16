import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import {
  GlucoseTrendChart,
  getPointColor,
} from "../../../src/components/dashboard-new-design/glucose-trend-chart";
import {
  normalizeInsulinDoseTimeline,
} from "../../../src/components/dashboard-new-design/insulin-timeline-data";
import {
  formatRapidDoseMarkerUnits,
  layoutRapidDoseMarkers,
  shouldShowRapidDoseMarkers,
} from "../../../src/components/dashboard-new-design/expanded-insulin-timeline";
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

const mockSetInsulinPeriod = jest.fn();
const mockRefetchInsulin = jest.fn();
let mockInsulinHookReturn = {
  data: null as null | {
    boluses: Array<{
      event_timestamp: string;
      event_type?: string;
      units: number;
      is_automated: boolean;
      control_iq_reason: string | null;
      pump_activity_mode: string | null;
      iob_at_event: number | null;
      bg_at_event: number | null;
    }>;
    total_count: number;
    period_days: number;
  },
  isLoading: false,
  error: null as string | null,
  period: "24h" as const,
  setPeriod: mockSetInsulinPeriod,
  refetch: mockRefetchInsulin,
};

const mockUseBolusReview = jest.fn((..._args: unknown[]) => mockInsulinHookReturn);

jest.mock("../../../src/hooks/use-bolus-review", () => ({
  useBolusReview: (...args: unknown[]) => mockUseBolusReview(...args),
}));

const mockRefetchPump = jest.fn();
let mockPumpHookReturn = {
  events: [] as Array<{
    event_type: "basal" | "suspend" | "resume";
    event_timestamp: string;
    units: number | null;
    duration_minutes: number | null;
    is_automated: boolean;
    control_iq_reason: string | null;
    pump_activity_mode: string | null;
    basal_adjustment_pct: number | null;
    iob_at_event: number | null;
    cob_at_event: number | null;
    bg_at_event: number | null;
    received_at: string;
    source: string;
  }>,
  count: 0,
  hasPumpHistory: false,
  isPossiblyTruncated: false,
  isLoading: false,
  error: null as string | null,
  refetch: mockRefetchPump,
};

const mockUsePumpEvents = jest.fn((..._args: unknown[]) => mockPumpHookReturn);

jest.mock("../../../src/hooks/use-pump-events", () => ({
  usePumpEvents: (...args: unknown[]) => mockUsePumpEvents(...args),
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
  mockInsulinHookReturn = {
    data: null,
    isLoading: false,
    error: null,
    period: "24h",
    setPeriod: mockSetInsulinPeriod,
    refetch: mockRefetchInsulin,
  };
  mockPumpHookReturn = {
    events: [],
    count: 0,
    hasPumpHistory: false,
    isPossiblyTruncated: false,
    isLoading: false,
    error: null,
    refetch: mockRefetchPump,
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
    const glucoseCall = mockUPlot.mock.calls.find(([options]) => options.axes[1].scale !== "insulin");
    expect(glucoseCall).toBeDefined();
    const [options, seriesData] = glucoseCall as [{
      cursor: {
        x: boolean;
        y: boolean;
      };
    }, unknown[]];

    expect(options.cursor.x).toBe(true);
    expect(options.cursor.y).toBe(true);
    expect(seriesData[1]).toEqual([100, 140, 190]);
  });

  it("renders the reusable section separator only in the embedded dashboard chart", () => {
    mockHookReturn.readings = [makeReading(120, 5)];

    render(<GlucoseTrendChart embedded unit="mgdl" />);

    const heading = screen.getByRole("heading", { level: 3, name: "Glucose" });

    expect(heading.closest("header")).toHaveClass(
      "rounded-panel",
      "bg-surface-secondary",
      "text-foreground-primary",
    );
    expect(screen.getByText("Drag chart to zoom")).toBeInTheDocument();
    expect(screen.getByText("mg/dL")).toHaveClass(
      "shrink-0",
      "border-r",
      "border-border-active",
      "pl-3",
      "pr-3",
    );
    expect(screen.getByText("mg/dL")).not.toHaveClass("w-9");
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

    const glucoseCall = mockUPlot.mock.calls.find(([options]) => options.axes[1].scale !== "insulin");
    expect(glucoseCall).toBeDefined();
    const [options] = glucoseCall as [{
      hooks: {
        setCursor: Array<(chart: {
          cursor: { idx: number; left: number };
          posToVal: () => number;
        }) => void>;
      };
    }];
    const hoveredTimestamp = new Date(mockHookReturn.readings[0].reading_timestamp).getTime();

    act(() => {
      options.hooks.setCursor[0]({
        cursor: {
          idx: 0,
          left: 64,
        },
        posToVal: () => hoveredTimestamp / 1000,
      });
    });

    const tooltip = screen.getByTestId("combined-timeline-tooltip");
    expect(tooltip).toHaveTextContent("70-180 mg/dL Target");
    expect(tooltip).toHaveTextContent("100 mg/dL");
    expect(tooltip).not.toHaveTextContent("No insulin dose near this time");
  });

  it("does not present a stale nearest glucose value across a telemetry gap", async () => {
    mockHookReturn.readings = [makeReading(100, 30)];

    render(<GlucoseTrendChart unit="mgdl" />);

    await waitFor(() => expect(mockUPlot).toHaveBeenCalled());
    const glucoseCall = mockUPlot.mock.calls.find(([options]) => options.scales.y);
    const [options] = glucoseCall as [{
      hooks: {
        setCursor: Array<(chart: {
          cursor: { idx: number; left: number };
          posToVal: () => number;
        }) => void>;
      };
    }];

    act(() => {
      options.hooks.setCursor[0]({
        cursor: { idx: 0, left: 500 },
        posToVal: () => Date.now() / 1000,
      });
    });

    const tooltip = screen.getByTestId("combined-timeline-tooltip");
    expect(tooltip).toHaveTextContent("No glucose reading at this time");
    expect(tooltip).not.toHaveTextContent("100 mg/dL");
  });

  it("moves the combined hover panel away from the active end of the timeline", async () => {
    mockHookReturn.readings = [
      makeReading(100, 15),
      makeReading(190, 5),
    ];

    render(<GlucoseTrendChart unit="mgdl" />);

    await waitFor(() => expect(mockUPlot).toHaveBeenCalled());
    const glucoseCall = mockUPlot.mock.calls.find(([options]) => options.axes[1].scale !== "insulin");
    expect(glucoseCall).toBeDefined();
    const [options] = glucoseCall as [{
      hooks: {
        setCursor: Array<(chart: {
          cursor: { idx: number; left: number };
          posToVal: () => number;
        }) => void>;
      };
    }];
    const hoveredTimestamp = new Date(mockHookReturn.readings[1].reading_timestamp).getTime();

    act(() => {
      options.hooks.setCursor[0]({
        cursor: {
          idx: 1,
          left: 620,
        },
        posToVal: () => hoveredTimestamp / 1000,
      });
    });

    expect(screen.getByTestId("combined-timeline-tooltip")).toHaveClass("left-2");
    expect(screen.getByTestId("combined-timeline-tooltip")).not.toHaveClass("right-2");
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
    const glucoseCall = [...mockUPlot.mock.calls]
      .reverse()
      .find(([options]) => options.axes[1].scale !== "insulin");
    expect(glucoseCall).toBeDefined();
    const [options] = glucoseCall as [{ axes: Array<{
      grid: { stroke: string };
      stroke: string;
      ticks: { stroke: string };
    }> }];

    expect(options.axes[0].grid.stroke).toBe("rgb(10, 20, 30)");
    expect(options.axes[1].ticks.stroke).toBe("rgb(40, 50, 60)");
    expect(options.axes[1].stroke).toBe("rgb(70, 80, 90)");
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

  it("keeps glucose available when pump history fails", () => {
    mockHookReturn.readings = [makeReading(120, 5)];
    mockPumpHookReturn.error = "Pump history unavailable";

    render(<GlucoseTrendChart />);

    expect(screen.getByRole("img", { name: /glucose readings for 3h/i })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Unable to load insulin history");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mockRefetchPump).toHaveBeenCalledTimes(1);
  });

  it("plots rapid doses above glucose on the same time domain", async () => {
    const timestamp = new Date(Date.now() - 5 * 60_000).toISOString();
    mockHookReturn.readings = [makeReading(120, 5)];
    mockInsulinHookReturn.data = {
      boluses: [
        {
          event_timestamp: timestamp,
          event_type: "bolus",
          units: 4.5,
          is_automated: false,
          control_iq_reason: null,
          pump_activity_mode: null,
          iob_at_event: 2.1,
          bg_at_event: 145,
        },
        {
          event_timestamp: timestamp,
          event_type: "basal_injection",
          units: 12,
          is_automated: false,
          control_iq_reason: null,
          pump_activity_mode: null,
          iob_at_event: null,
          bg_at_event: null,
        },
        {
          event_timestamp: timestamp,
          event_type: "correction",
          units: 1.25,
          is_automated: true,
          control_iq_reason: "auto_correction",
          pump_activity_mode: null,
          iob_at_event: 1.5,
          bg_at_event: 190,
        },
      ],
      period_days: 1,
      total_count: 3,
    };

    render(<GlucoseTrendChart />);

    expect(screen.getByRole("region", { name: "Insulin doses" })).toBeInTheDocument();
    expect(screen.getByText("Basal injection")).toBeInTheDocument();
    expect(screen.getByText("Auto correction")).toBeInTheDocument();
    expect(screen.getByText("Manual bolus")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /2 rapid acting doses and 1 long acting basal injection/i })).toBeInTheDocument();

    await waitFor(() => expect(mockUPlot).toHaveBeenCalledTimes(2));
    const glucoseCall = mockUPlot.mock.calls.find(([options]) => options.scales.y);
    const doseCall = mockUPlot.mock.calls.find(([options]) => options.scales.dose);

    expect(glucoseCall?.[0].scales.x.range).toEqual(doseCall?.[0].scales.x.range);
    expect(glucoseCall?.[0].axes[0].show).toBe(true);
    expect(glucoseCall?.[0].axes[0].size).toBe(40);
    expect(glucoseCall?.[0].axes[0].ticks.show).toBe(true);
    expect(glucoseCall?.[0].padding).toEqual([0, 0, 0, 0]);
    expect(doseCall?.[0].padding).toEqual([12, 0, 8, 0]);
    expect(glucoseCall?.[0].axes[0].splits).toBe(doseCall?.[0].axes[0].splits);
    expect(glucoseCall?.[0].cursor.sync.key).toBe(doseCall?.[0].cursor.sync.key);
    expect(glucoseCall?.[0].axes[1].label).toBeUndefined();
    expect(doseCall?.[0].axes[1].label).toBeUndefined();
    expect(glucoseCall?.[0].axes[1].size).toBe(36);
    expect(doseCall?.[0].axes[1].size).toBe(36);
    expect(doseCall?.[1][1]).toEqual([-4.5, -1.25, -2.75]);
    expect(doseCall?.[0].scales.dose.range).toEqual([-6, 0]);
    expect(mockUseBolusReview).toHaveBeenCalledWith("24h", undefined, 500);

    act(() => {
      glucoseCall?.[0].hooks.setCursor[0]({
        cursor: { idx: 0, left: 100 },
        posToVal: () => new Date(timestamp).getTime() / 1000,
      });
      doseCall?.[0].hooks.setCursor[0]({
        cursor: { idx: 1, left: 100 },
        bbox: { width: 640 },
        posToVal: () => new Date(timestamp).getTime() / 1000,
      });
    });

    const tooltip = screen.getByTestId("combined-timeline-tooltip");
    expect(tooltip).toHaveTextContent("120 mg/dL");
    expect(tooltip).toHaveTextContent("Auto correction");
    expect(tooltip).toHaveTextContent("1.25 U");
    const doseTime = tooltip.querySelector("time");
    expect(doseTime).toHaveAttribute("datetime", timestamp);
    expect(doseTime).toHaveTextContent(new Date(timestamp).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    }));
  });

  it("anchors blue manual and orange auto correction glucose markers by their tips", async () => {
    const now = Date.now();
    const markerTimestamp = new Date(now - 90 * 60_000).toISOString();
    mockHookReturn.readings = [makeReading(120, 5)];
    mockInsulinHookReturn.data = {
      boluses: [
        {
          event_timestamp: markerTimestamp,
          event_type: "bolus",
          units: 4.5,
          is_automated: false,
          control_iq_reason: null,
          pump_activity_mode: null,
          iob_at_event: 2.1,
          bg_at_event: 145,
        },
        {
          event_timestamp: markerTimestamp,
          event_type: "correction",
          units: 4.25,
          is_automated: true,
          control_iq_reason: "auto_correction",
          pump_activity_mode: null,
          iob_at_event: 1.5,
          bg_at_event: 190,
        },
      ],
      period_days: 1,
      total_count: 2,
    };

    render(<GlucoseTrendChart />);

    const manualMarker = await screen.findByTestId("manual-bolus-dose-marker");
    const autoMarker = screen.getByTestId("auto-correction-dose-marker");

    expect(manualMarker).toHaveTextContent("4.5");
    expect(manualMarker).toHaveClass("text-data-insulin-bolus");
    expect(manualMarker).toHaveStyle({ transform: "translateX(-50%)" });
    expect(manualMarker.querySelector("use")).toHaveAttribute(
      "href",
      "/static_assets/iconSprite.svg#glucose"
    );
    expect(manualMarker.querySelector("svg")).toHaveClass("-rotate-90");
    expect(autoMarker).toHaveTextContent("4.25");
    expect(autoMarker).toHaveClass("text-data-insulin-correction");
    expect(autoMarker).toHaveStyle({ transform: "translateX(-50%)" });
    expect(autoMarker.querySelector("use")).toHaveAttribute(
      "href",
      "/static_assets/iconSprite.svg#glucose"
    );
    expect(autoMarker.querySelector("svg")).toHaveClass("-rotate-90");
    expect(screen.queryByTestId("dose-marker-connector")).not.toBeInTheDocument();

    const doseCall = mockUPlot.mock.calls.find(([options]) => options.scales.dose);
    const drawDoseTrack = doseCall?.[0].hooks.draw[0] as (chart: unknown) => void;
    const canvasContext = {
      beginPath: jest.fn(),
      fillRect: jest.fn(),
      globalAlpha: 1,
      lineCap: "round",
      lineJoin: "round",
      lineTo: jest.fn(),
      lineWidth: 1,
      moveTo: jest.fn(),
      restore: jest.fn(),
      save: jest.fn(),
      stroke: jest.fn(),
      strokeStyle: "",
    };

    act(() => {
      drawDoseTrack({
        ctx: canvasContext,
        valToPos: (value: number, scale: string) => (
          scale === "x" ? 338 : value === 0 ? 0 : 50
        ),
      });
    });

    expect(canvasContext.lineWidth).toBe(3 * window.devicePixelRatio);
    expect(canvasContext.lineCap).toBe("butt");
    expect(canvasContext.lineJoin).toBe("miter");
    expect(canvasContext.stroke).toHaveBeenCalledTimes(2);
    expect(canvasContext.lineTo.mock.calls.some(([x, y]) => (
      Math.abs(x - 338) > 1 && y === 50
    ))).toBe(true);
  });

  it("separates colliding dose labels and rejects a cluster that cannot fit", () => {
    const startMs = Date.now() - 3 * 60 * 60_000;
    const timestampMs = startMs + 90 * 60_000;
    const dose = (index: number) => ({
      timestampMs,
      deliveredUnits: 1.25,
      kind: index % 2 === 0 ? "manual_bolus" as const : "automated_correction" as const,
      isAutomated: index % 2 !== 0,
      controlIqReason: index % 2 === 0 ? null : "auto_correction",
      pumpActivityMode: null,
      insulinOnBoardUnits: null,
      glucoseAtEventMgDl: null,
    });
    const xDomain: [number, number] = [startMs, startMs + 3 * 60 * 60_000];
    const layout = layoutRapidDoseMarkers(
      [dose(0), dose(1)],
      xDomain,
      640,
      112,
      4
    );

    expect(layout).not.toBeNull();
    expect(layout?.[0].anchorLeft).toBe(layout?.[1].anchorLeft);
    expect(layout?.[0].top).toBeCloseTo(40.75);
    expect(layout?.[1].top).toBeCloseTo(40.75);
    expect(Math.abs((layout?.[0].left ?? 0) - (layout?.[1].left ?? 0))).toBeGreaterThanOrEqual(44);
    expect(layout?.every((marker) => marker.left >= 56 && marker.left <= 620)).toBe(true);
    expect(layoutRapidDoseMarkers(
      Array.from({ length: 6 }, (_, index) => dose(index)),
      xDomain,
      640,
      112,
      4
    )).toBeNull();
  });

  it("falls back to bars when dose markers would not fit", () => {
    const startMs = Date.now() - 3 * 60 * 60_000;
    const dose = (timestampMs: number) => ({
      timestampMs,
      deliveredUnits: 1.25,
      kind: "automated_correction" as const,
      isAutomated: true,
      controlIqReason: "auto_correction",
      pumpActivityMode: null,
      insulinOnBoardUnits: null,
      glucoseAtEventMgDl: null,
    });

    expect(shouldShowRapidDoseMarkers(
      [dose(startMs + 30 * 60_000), dose(startMs + 90 * 60_000)],
      [startMs, startMs + 3 * 60 * 60_000],
      640,
      false
    )).toBe(true);
    expect(shouldShowRapidDoseMarkers(
      Array.from({ length: 20 }, (_, index) => dose(startMs + index * 60_000)),
      [startMs, startMs + 3 * 60 * 60_000],
      640,
      false
    )).toBe(false);
    expect(shouldShowRapidDoseMarkers(
      [dose(startMs + 30 * 60_000)],
      [startMs, startMs + 3 * 24 * 60 * 60_000],
      2048,
      true
    )).toBe(false);
    expect(formatRapidDoseMarkerUnits(1.25)).toBe("1.25");
    expect(formatRapidDoseMarkerUnits(4)).toBe("4");
  });

  it("does not reserve an empty dose track for doses outside the visible range", async () => {
    const outsideVisibleRange = new Date(Date.now() - 4 * 60 * 60_000).toISOString();
    mockHookReturn.readings = [makeReading(120, 5)];
    mockInsulinHookReturn.data = {
      boluses: [
        {
          event_timestamp: outsideVisibleRange,
          event_type: "bolus",
          units: 4,
          is_automated: false,
          control_iq_reason: null,
          pump_activity_mode: null,
          iob_at_event: null,
          bg_at_event: null,
        },
      ],
      period_days: 1,
      total_count: 1,
    };

    render(<GlucoseTrendChart />);

    expect(screen.queryByRole("region", { name: "Insulin doses" })).not.toBeInTheDocument();
    await waitFor(() => expect(mockUPlot).toHaveBeenCalledTimes(1));
  });

  it("renders suspension inside the expanded pump activity track", async () => {
    const basalTimestamp = new Date(Date.now() - 10 * 60_000);
    const suspendTimestamp = new Date(Date.now() - 5 * 60_000);
    const resumeTimestamp = new Date(Date.now() - 2 * 60_000);
    mockHookReturn.readings = [makeReading(120, 9)];
    mockPumpHookReturn.events = [
      {
        event_type: "basal",
        event_timestamp: basalTimestamp.toISOString(),
        units: 0.85,
        duration_minutes: 60,
        is_automated: true,
        control_iq_reason: "basal_adjustment",
        pump_activity_mode: "sleep",
        basal_adjustment_pct: 15,
        iob_at_event: 2,
        cob_at_event: null,
        bg_at_event: 120,
        received_at: basalTimestamp.toISOString(),
        source: "tandem",
      },
      {
        event_type: "suspend",
        event_timestamp: suspendTimestamp.toISOString(),
        units: null,
        duration_minutes: 5,
        is_automated: true,
        control_iq_reason: "suspend",
        pump_activity_mode: "sleep",
        basal_adjustment_pct: null,
        iob_at_event: 1.8,
        cob_at_event: null,
        bg_at_event: 118,
        received_at: suspendTimestamp.toISOString(),
        source: "tandem",
      },
      {
        event_type: "resume",
        event_timestamp: resumeTimestamp.toISOString(),
        units: null,
        duration_minutes: null,
        is_automated: true,
        control_iq_reason: "resume",
        pump_activity_mode: "sleep",
        basal_adjustment_pct: null,
        iob_at_event: 1.7,
        cob_at_event: null,
        bg_at_event: 119,
        received_at: resumeTimestamp.toISOString(),
        source: "tandem",
      },
    ];
    mockPumpHookReturn.count = 3;
    mockPumpHookReturn.isPossiblyTruncated = true;

    render(<GlucoseTrendChart />);

    expect(screen.getByRole("region", { name: "Pump basal rate" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Pump activity mode" })).toBeInTheDocument();
    expect(screen.getByText("Sleep")).toBeInTheDocument();
    expect(screen.getByText("Suspended")).toBeInTheDocument();
    expect(screen.getByText("Basal history may be incomplete for this range.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Insulin doses" })).not.toBeInTheDocument();

    await waitFor(() => expect(mockUPlot).toHaveBeenCalledTimes(3));
    const glucoseCall = mockUPlot.mock.calls.find(([options]) => options.scales.y);
    const basalCall = mockUPlot.mock.calls.find(([options]) => options.scales.basal);
    const modeCall = mockUPlot.mock.calls.find(([options]) => options.scales.mode);

    expect(glucoseCall?.[0].scales.x.range).toEqual(basalCall?.[0].scales.x.range);
    expect(glucoseCall?.[0].scales.x.range).toEqual(modeCall?.[0].scales.x.range);
    expect(glucoseCall?.[0].axes[0].size).toBe(0);
    expect(basalCall?.[0].axes[0].size).toBe(0);
    expect(modeCall?.[0].axes[0].size).toBe(40);

    const hoverTimestamp = basalTimestamp.getTime() + 60_000;
    act(() => {
      glucoseCall?.[0].hooks.setCursor[0]({
        cursor: { idx: 0, left: 100 },
        posToVal: () => hoverTimestamp / 1000,
      });
      basalCall?.[0].hooks.setCursor[0]({
        cursor: { left: 100 },
        posToVal: () => hoverTimestamp / 1000,
      });
    });

    const tooltip = screen.getByTestId("combined-timeline-tooltip");
    expect(tooltip).toHaveTextContent("0.85 U/hr");
    expect(tooltip).toHaveTextContent("Automated basal");
    expect(tooltip).toHaveTextContent("+15% adjustment");

    act(() => {
      modeCall?.[0].hooks.setCursor[0]({
        cursor: { left: 100 },
        posToVal: () => (suspendTimestamp.getTime() + 60_000) / 1000,
      });
    });

    expect(tooltip).toHaveTextContent("Pump suspended");
    expect(tooltip).toHaveTextContent(
      `Suspend: ${suspendTimestamp.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
    );
    expect(tooltip).toHaveTextContent(
      `Resume: ${resumeTimestamp.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
    );
    expect(tooltip).toHaveTextContent("Sleep mode");
  });

  it("shows activity mode in the tooltip even when basal is unconfirmed", async () => {
    const modeTimestamp = new Date(Date.now() - 10 * 60_000);
    mockHookReturn.readings = [makeReading(120, 9)];
    mockPumpHookReturn.events = [
      {
        event_type: "resume",
        event_timestamp: modeTimestamp.toISOString(),
        units: null,
        duration_minutes: 30,
        is_automated: true,
        control_iq_reason: "resume",
        pump_activity_mode: "sleep",
        basal_adjustment_pct: null,
        iob_at_event: 1.8,
        cob_at_event: null,
        bg_at_event: 118,
        received_at: modeTimestamp.toISOString(),
        source: "tandem",
      },
    ];
    mockPumpHookReturn.count = 1;
    mockPumpHookReturn.hasPumpHistory = true;

    render(<GlucoseTrendChart />);

    expect(screen.queryByRole("region", { name: "Pump basal rate" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Pump activity mode" })).toBeInTheDocument();

    await waitFor(() => expect(mockUPlot).toHaveBeenCalledTimes(2));
    const modeCall = mockUPlot.mock.calls.find(([options]) => options.scales.mode);
    expect(modeCall).toBeDefined();

    act(() => {
      modeCall?.[0].hooks.setCursor[0]({
        cursor: { left: 100 },
        posToVal: () => modeTimestamp.getTime() / 1000,
      });
    });

    const tooltip = screen.getByTestId("combined-timeline-tooltip");
    expect(tooltip).toHaveTextContent("Sleep mode");
    expect(tooltip).not.toHaveTextContent("No confirmed pump basal at this time");
  });

  it("hides all insulin tracks for a CGM only user", async () => {
    mockHookReturn.readings = [makeReading(120, 5)];

    render(<GlucoseTrendChart />);

    expect(screen.queryByRole("region", { name: "Insulin doses" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Pump basal rate" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Pump activity mode" })).not.toBeInTheDocument();
    await waitFor(() => expect(mockUPlot).toHaveBeenCalledTimes(1));
  });

  it("keeps the incomplete history warning visible when a historical pump range is empty", () => {
    mockHookReturn.readings = [makeReading(120, 5)];
    mockPumpHookReturn.isPossiblyTruncated = true;

    render(<GlucoseTrendChart hasConfiguredPump />);

    expect(screen.getByRole("region", { name: "Pump basal rate" })).toBeInTheDocument();
    expect(screen.getByText("Basal history may be incomplete for this range.")).toBeInTheDocument();
  });

  it("does not infer a pump for a CGM only user from a limited range", () => {
    mockHookReturn.readings = [makeReading(120, 5)];
    mockPumpHookReturn.isPossiblyTruncated = true;

    render(<GlucoseTrendChart />);

    expect(screen.queryByRole("region", { name: "Pump basal rate" })).not.toBeInTheDocument();
  });

  it("classifies manual boluses, auto corrections, and basal injections without duplicates", () => {
    const timestamp = "2026-07-10T08:00:00.000Z";
    const shared = {
      event_timestamp: timestamp,
      control_iq_reason: null,
      pump_activity_mode: null,
      iob_at_event: null,
      bg_at_event: null,
    };
    const events = normalizeInsulinDoseTimeline([
      { ...shared, event_type: "basal_injection", units: 18, is_automated: false },
      { ...shared, event_type: "bolus", units: 4, is_automated: false },
      { ...shared, event_type: "correction", units: 2, is_automated: false },
      { ...shared, event_type: "correction", units: 1, is_automated: true },
      { ...shared, event_type: "correction", units: 1, is_automated: true },
    ]);

    expect(events.rapidDoses.map((event) => event.kind)).toEqual([
      "manual_bolus",
      "automated_correction",
      "automated_correction",
    ]);
    expect(events.longActingBasalInjections).toHaveLength(1);
  });
});
