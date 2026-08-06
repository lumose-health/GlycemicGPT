import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import uPlot from "uplot";
import type { ForecastReadResponse } from "@/lib/api";
import type { ChartTimePeriod } from "@/lib/chart-periods";
import { DesktopMergedGlucoseTrendChart } from "./DesktopMergedGlucoseTrendChart";
import { MergedChartStatusMessages } from "./MergedChartStatusMessages";
import { MergedGlucoseTrendChart } from "./MergedGlucoseTrendChart";
import { MergedGlucoseTrendSurface } from "./MergedGlucoseTrendSurface";
import { MobileMergedGlucoseTrendChart } from "./MobileMergedGlucoseTrendChart";
import type {
  MergedChartModel,
  MergedDoseEvent,
} from "./MergedGlucoseTrendChart.types";
import {
  getVisibleActivityKinds,
  layoutMergedDoseMarkers,
  resolveMergedBasalDomain,
} from "./merged-chart-model";

const glucoseRefetch = jest.fn();
const insulinRefetch = jest.fn();
const pumpRefetch = jest.fn();
let mockGlucosePeriod: ChartTimePeriod = "3h";

jest.mock("@/hooks/use-glucose-history", () => ({
  useGlucoseHistory: () => ({
    readings: [
      {
        value: 120,
        reading_timestamp: "2026-07-16T10:00:00.000Z",
        trend: "flat",
        trend_rate: null,
        received_at: "2026-07-16T10:00:00.000Z",
        source: "dexcom",
      },
    ],
    isLoading: false,
    error: null,
    period: mockGlucosePeriod,
    setPeriod: jest.fn(),
    refetch: glucoseRefetch,
  }),
}));

jest.mock("@/hooks/use-bolus-review", () => ({
  useBolusReview: () => ({
    data: {
      boluses: [
        {
          event_timestamp: "2026-07-16T10:00:00.000Z",
          event_type: "bolus",
          units: 2.5,
          is_automated: false,
          control_iq_reason: null,
          pump_activity_mode: null,
          iob_at_event: null,
          bg_at_event: null,
        },
      ],
      total_count: 1,
      period_days: 1,
    },
    isLoading: false,
    error: null,
    period: "24h",
    setPeriod: jest.fn(),
    refetch: insulinRefetch,
  }),
}));

jest.mock("@/hooks/use-pump-events", () => ({
  usePumpEvents: () => ({
    events: [],
    count: 0,
    hasPumpHistory: false,
    isPossiblyTruncated: false,
    isLoading: false,
    error: null,
    refetch: pumpRefetch,
  }),
}));

jest.mock("uplot", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({ destroy: jest.fn() })),
}));

const mockUPlot = uPlot as unknown as jest.Mock;

function rapidDose(
  timestampMs: number,
  kind: "manual_bolus" | "automated_correction" = "manual_bolus"
): MergedDoseEvent {
  return {
    timestampMs,
    deliveredUnits: 1,
    kind,
    isAutomated: kind === "automated_correction",
    controlIqReason: null,
    pumpActivityMode: null,
    insulinOnBoardUnits: null,
    glucoseAtEventMgDl: null,
  };
}

function forecastResponse(startMs: number): ForecastReadResponse {
  return {
    source_preference: "auto",
    effective_source: "trio",
    available_sources: ["trio"],
    forecast: {
      source_engine: "trio",
      source_uploader: "Nightscout Trio",
      issued_at: new Date(startMs).toISOString(),
      start_at: new Date(startMs).toISOString(),
      step_minutes: 5,
      horizon_minutes: 15,
      curves_mgdl: { main: [120, 124, 128, 132] },
      default_curve_name: "main",
    },
    forecast_unavailable_reason: null,
  };
}

function model(overrides: Partial<MergedChartModel> = {}): MergedChartModel {
  return {
    activityIntervals: [],
    basalSegments: [],
    doses: [],
    forecast: null,
    forecastEligible: false,
    forecastPoints: [],
    fullDomain: [0, 60 * 60 * 1000],
    hasPump: false,
    isMultiDay: false,
    points: [],
    rangeSelectionKey: "period:3h",
    statuses: [],
    suspensionIntervals: [],
    thresholds: { urgentLow: 55, low: 70, high: 180, urgentHigh: 250 },
    unit: "mgdl",
    ...overrides,
  };
}

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => 640,
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get: () => 320,
  });

  class ResizeObserverMock {
    constructor(private callback: ResizeObserverCallback) {}

    observe(target: Element) {
      this.callback([{ target } as ResizeObserverEntry], this as unknown as ResizeObserver);
    }

    disconnect() {}
    unobserve() {}
  }

  global.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGlucosePeriod = "3h";
});

describe("MergedGlucoseTrendChart", () => {
  it("renders separate mobile and desktop components at the md breakpoint", () => {
    render(<MergedGlucoseTrendChart hasConfiguredPump />);

    expect(screen.getByTestId("mobile-merged-glucose-trend")).toHaveClass(
      "px-1",
      "py-2",
      "md:hidden",
    );
    expect(screen.getByTestId("desktop-merged-glucose-trend")).toHaveClass(
      "hidden",
      "md:block"
    );
  });

  it("disables interaction on mobile and enables it on desktop", () => {
    render(<MergedGlucoseTrendChart hasConfiguredPump />);

    const options = mockUPlot.mock.calls.map(([value]) => value as uPlot.Options);
    expect(options.some((value) => value.cursor?.show === false)).toBe(true);
    expect(options.some((value) => value.cursor?.show === true)).toBe(true);
    expect(options.some((value) => value.cursor?.drag?.x === false)).toBe(true);
    expect(options.some((value) => value.cursor?.drag?.x === true)).toBe(true);
  });

  it("places glucose on the left axis and basal U/hr on the right axis", () => {
    render(<MergedGlucoseTrendChart hasConfiguredPump />);

    const desktopOptions = mockUPlot.mock.calls
      .map(([value]) => value as uPlot.Options)
      .find((value) => value.cursor?.show === true);

    expect(desktopOptions?.axes?.[1]).toEqual(
      expect.objectContaining({ scale: "glucose", side: 3 })
    );
    expect(desktopOptions?.axes?.[2]).toEqual(
      expect.objectContaining({ scale: "basal", side: 1, show: true })
    );
    expect(screen.getAllByText("Pump basal (U/hr)").length).toBeGreaterThan(0);
  });

  it("renders the shared forecast in mobile and desktop views", () => {
    const startMs = Date.now();
    mockGlucosePeriod = "24h";

    render(
      <MergedGlucoseTrendChart
        forecast={forecastResponse(startMs)}
        hasConfiguredPump
      />,
    );

    expect(screen.getAllByTestId("forecast-legend")).toHaveLength(2);
    expect(screen.getAllByText("Forecast from Trio")).toHaveLength(2);

    const options = mockUPlot.mock.calls.map(
      ([value]) =>
        value as {
          scales?: { x?: { range?: [number, number] } };
        },
    );
    expect(
      options.every(
        (value) =>
          value.scales?.x?.range?.[1] ===
          (startMs + 15 * 60_000) / 1000,
      ),
    ).toBe(true);
  });

  it("compacts mobile axes and limits glucose labels to target boundaries", () => {
    render(<MergedGlucoseTrendChart hasConfiguredPump unit="mmol" />);

    const options = mockUPlot.mock.calls.map(([value]) => value as uPlot.Options);
    const mobileGlucoseAxis = options.find(
      (value) => value.cursor?.show === false
    )?.axes?.[1];
    const desktopGlucoseAxis = options.find(
      (value) => value.cursor?.show === true
    )?.axes?.[1];
    const mobileBasalAxis = options.find(
      (value) => value.cursor?.show === false
    )?.axes?.[2];
    const mobileSplits = mobileGlucoseAxis?.splits as unknown as (
      chart: uPlot,
      axisIndex: number,
      scaleMin: number,
      scaleMax: number,
      increment: number,
    ) => number[];
    const mobileValues = mobileGlucoseAxis?.values as unknown as (
      chart: uPlot,
      values: number[],
    ) => string[];
    const desktopValues = desktopGlucoseAxis?.values as unknown as (
      chart: uPlot,
      values: number[],
    ) => string[];

    expect(mobileGlucoseAxis?.grid).toEqual({ show: false });
    expect(mobileGlucoseAxis?.ticks).toEqual({ show: false });
    expect(mobileGlucoseAxis?.size).toBe(32);
    expect(mobileBasalAxis?.ticks).toEqual({ show: false });
    expect(mobileBasalAxis?.size).toBe(32);
    expect(mobileSplits({} as uPlot, 1, 40, 300, 25)).toEqual([70, 180]);
    expect(mobileValues({} as uPlot, [70, 180])).toEqual(["3.9", "10"]);
    expect(desktopGlucoseAxis?.grid).toEqual(
      expect.objectContaining({ stroke: expect.any(String) })
    );
    expect(desktopGlucoseAxis?.ticks).toEqual(
      expect.objectContaining({ stroke: expect.any(String) })
    );
    expect(desktopValues({} as uPlot, [70, 180])).toEqual(["3.9", "10.0"]);
  });

  it("shows a compact mobile explanation legend with dynamic categories", () => {
    render(
      <MobileMergedGlucoseTrendChart
        model={model({
          activityIntervals: [
            {
              startMs: 1,
              endMs: 1000,
              mode: "sleep",
              isAutomated: true,
              source: "pump",
            },
          ],
          doses: [
            {
              timestampMs: 500,
              injectedUnits: 18,
              kind: "long_acting_basal_injection",
              isAutomated: false,
              controlIqReason: null,
              pumpActivityMode: null,
              insulinOnBoardUnits: null,
              glucoseAtEventMgDl: null,
            },
          ],
        })}
      />
    );

    expect(screen.getByRole("group", { name: "Merged chart labels" })).toBeInTheDocument();
    expect(screen.getByText("Manual bolus (U)")).toBeInTheDocument();
    expect(screen.getByText("Automated correction (U)")).toBeInTheDocument();
    expect(screen.getByText("Long acting injection (U)")).toBeInTheDocument();
    expect(screen.getByText("Sleep")).toBeInTheDocument();
    expect(screen.queryByText("Exercise")).not.toBeInTheDocument();
  });

  it("keeps tightly stacked dose values in an overlay without shrinking the plot", () => {
    render(
      <MobileMergedGlucoseTrendChart
        model={model({
          doses: [rapidDose(1000), rapidDose(1001), rapidDose(1002)],
          hasPump: true,
          unit: "mmol",
        })}
      />,
    );

    const options = mockUPlot.mock.calls[0]?.[0] as uPlot.Options;
    const overlay = screen.getByTestId("merged-dose-overlay");
    const markers = Array.from(
      overlay.querySelectorAll<HTMLElement>("[data-dose-marker]"),
    );
    const legend = screen.getByRole("group", { name: "Merged chart labels" });

    expect(options.padding).toEqual([4, 0, 0, 0]);
    expect(overlay).toHaveClass("absolute", "inset-0");
    expect(markers.map((marker) => marker.style.top)).toEqual([
      "4px",
      "18px",
      "32px",
    ]);
    expect(overlay.querySelectorAll("[data-dose-value]")).toHaveLength(3);
    expect(overlay).not.toHaveTextContent(/\bU\b/);
    expect(
      within(legend).getByText("Glucose target 3.9 to 10.0 (mmol/L)"),
    ).toBeInTheDocument();
    expect(within(legend).getByText("Pump basal (U/hr)")).toBeInTheDocument();
    expect(within(legend).getByText("Manual bolus (U)")).toBeInTheDocument();
  });

  it("shows desktop doses as icons on one row for ranges longer than 24 hours", () => {
    const dayMs = 24 * 60 * 60 * 1000;

    render(
      <DesktopMergedGlucoseTrendChart
        model={model({
          doses: [
            rapidDose(dayMs / 2),
            rapidDose(dayMs),
            rapidDose(dayMs * 2, "automated_correction"),
          ],
          fullDomain: [0, dayMs * 3],
          isMultiDay: true,
        })}
      />,
    );

    const overlay = screen.getByTestId("merged-dose-overlay");
    const markers = Array.from(
      overlay.querySelectorAll<HTMLElement>("[data-dose-marker]"),
    );

    expect(markers).toHaveLength(3);
    expect(markers.map((marker) => marker.dataset.doseRow)).toEqual([
      "0",
      "0",
      "0",
    ]);
    expect(overlay.querySelector("[data-dose-value]")).toBeNull();
  });

  it("preserves desktop zoom during live domain shifts and resets for a new range", async () => {
    const { rerender } = render(
      <DesktopMergedGlucoseTrendChart model={model()} />,
    );
    const options = mockUPlot.mock.calls.at(-1)?.[0] as {
      hooks: { setSelect: Array<(chart: unknown) => void> };
    };

    act(() => {
      options.hooks.setSelect[0]({
        posToVal: (position: number) => (position === 100 ? 600 : 1800),
        select: { left: 100, width: 200 },
        setSelect: jest.fn(),
      });
    });

    expect(screen.getByRole("button", { name: "Reset Time Range" })).toBeInTheDocument();

    rerender(
      <DesktopMergedGlucoseTrendChart
        model={model({ fullDomain: [5 * 60_000, 65 * 60_000] })}
      />,
    );

    expect(screen.getByRole("button", { name: "Reset Time Range" })).toBeInTheDocument();
    const liveUpdateOptions = mockUPlot.mock.calls.at(-1)?.[0] as {
      scales: { x: { range: [number, number] } };
    };
    expect(liveUpdateOptions.scales.x.range).toEqual([600, 1800]);

    rerender(
      <DesktopMergedGlucoseTrendChart
        model={model({
          fullDomain: [0, 2 * 60 * 60 * 1000],
          rangeSelectionKey: "period:6h",
        })}
      />,
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Reset Time Range" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("keeps the status live region mounted and names each retry action", () => {
    const retryGlucose = jest.fn();
    const retryPump = jest.fn();
    const { container, rerender } = render(
      <MergedChartStatusMessages statuses={[]} />,
    );

    const liveRegion = container.querySelector("[aria-live='polite']");
    expect(liveRegion).toBeInTheDocument();
    expect(liveRegion).toBeEmptyDOMElement();
    expect(liveRegion).not.toHaveClass("px-2", "pt-2");

    rerender(
      <MergedChartStatusMessages
        statuses={[
          {
            error: "Unavailable",
            isLoading: false,
            label: "glucose readings",
            onRetry: retryGlucose,
          },
          {
            error: "Unavailable",
            isLoading: false,
            label: "pump data",
            onRetry: retryPump,
          },
        ]}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Retry loading glucose readings" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Retry loading pump data" }),
    );
    expect(retryGlucose).toHaveBeenCalledTimes(1);
    expect(retryPump).toHaveBeenCalledTimes(1);
  });

  it("shows the basal unit in the merged tooltip", () => {
    const timestampMs = 30 * 60 * 1000;
    render(
      <MergedGlucoseTrendSurface
        heightClassName="h-80"
        interactive
        model={model({
          basalSegments: [
            {
              startMs: 0,
              endMs: 60 * 60 * 1000,
              rateUnitsPerHour: 1.2,
              deliveryState: "delivering",
              isAutomated: true,
              controlIqReason: null,
              pumpActivityMode: null,
              basalAdjustmentPercent: null,
              source: "pump",
            },
          ],
          hasPump: true,
          points: [{ timestampMs, trend: "Stable", valueMgDl: 120 }],
        })}
        xDomain={[0, 60 * 60 * 1000]}
      />,
    );
    const options = mockUPlot.mock.calls.at(-1)?.[0] as {
      hooks: { setCursor: Array<(chart: unknown) => void> };
    };

    act(() => {
      options.hooks.setCursor[0]({
        bbox: { width: 640 },
        cursor: { left: 320 },
        posToVal: () => timestampMs / 1000,
      });
    });

    expect(screen.getByTestId("merged-chart-tooltip")).toHaveTextContent(
      "Basal: 1.20 U/hr",
    );
  });

  it("clears merged hover details when the x domain changes", () => {
    const timestampMs = 30 * 60 * 1000;
    const chartModel = model({
      points: [{ timestampMs, trend: "Stable", valueMgDl: 120 }],
    });
    const { rerender } = render(
      <MergedGlucoseTrendSurface
        heightClassName="h-80"
        interactive
        model={chartModel}
        xDomain={[0, 60 * 60 * 1000]}
      />,
    );
    const options = mockUPlot.mock.calls.at(-1)?.[0] as {
      hooks: { setCursor: Array<(chart: unknown) => void> };
    };

    act(() => {
      options.hooks.setCursor[0]({
        bbox: { width: 640 },
        cursor: { left: 320 },
        posToVal: () => timestampMs / 1000,
      });
    });
    expect(screen.getByTestId("merged-chart-tooltip")).toBeInTheDocument();

    rerender(
      <MergedGlucoseTrendSurface
        heightClassName="h-80"
        interactive
        model={chartModel}
        xDomain={[1, 60 * 60 * 1000 + 1]}
      />,
    );

    expect(screen.queryByTestId("merged-chart-tooltip")).not.toBeInTheDocument();
  });

  it("renders every activity type on one shared track above the time labels", () => {
    render(
      <MobileMergedGlucoseTrendChart
        model={model({
          activityIntervals: [
            {
              startMs: 0,
              endMs: 20 * 60 * 1000,
              mode: "sleep",
              isAutomated: true,
              source: "pump",
            },
            {
              startMs: 20 * 60 * 1000,
              endMs: 40 * 60 * 1000,
              mode: "exercise",
              isAutomated: true,
              source: "pump",
            },
          ],
          suspensionIntervals: [
            {
              startMs: 40 * 60 * 1000,
              endMs: 60 * 60 * 1000,
              hasConfirmedResume: true,
              isAutomated: true,
              source: "pump",
            },
          ],
        })}
      />,
    );

    const options = mockUPlot.mock.calls[0]?.[0] as uPlot.Options;
    const surface = screen.getByTestId("merged-mobile-surface").parentElement;

    expect(options.axes?.[0]).toEqual(
      expect.objectContaining({ gap: 40, size: 80 }),
    );
    const sleepIcon = surface?.querySelector(
      'use[href="/static_assets/iconSprite.svg#sleep-zzz"]',
    );
    const exerciseIcon = surface?.querySelector(
      'use[href="/static_assets/iconSprite.svg#exercise-dumbbell"]',
    );
    const suspensionIcon = surface?.querySelector(
      'use[href="/static_assets/iconSprite.svg#circle-slash"]',
    );
    const activityTracks = Array.from(
      surface?.querySelectorAll<HTMLElement>("[data-icon-count]") ?? [],
    );

    expect(sleepIcon).not.toBeNull();
    expect(exerciseIcon).not.toBeNull();
    expect(suspensionIcon).not.toBeNull();
    expect(sleepIcon?.closest("svg")).toHaveClass("size-3.5");
    expect(new Set(activityTracks.map((track) => track.style.top)).size).toBe(1);
  });
});

describe("merged chart layout helpers", () => {
  it("keeps close doses individual and stacks them on separate rows", () => {
    const doses = [rapidDose(1000), rapidDose(1001), rapidDose(1002)];
    const layout = layoutMergedDoseMarkers({
      domain: [0, 2000],
      doses,
      plotWidth: 200,
    });

    expect(layout).toHaveLength(3);
    expect(layout.map((marker) => marker.event)).toEqual(doses);
    expect(new Set(layout.map((marker) => marker.row)).size).toBe(3);
  });

  it("reuses the final available row when overlapping dose markers exhaust rows", () => {
    const doses = Array.from({ length: 6 }, (_, index) => rapidDose(1000 + index));
    const layout = layoutMergedDoseMarkers({
      domain: [0, 2000],
      doses,
      maxRows: 4,
      plotWidth: 200,
    });

    expect(layout.map((marker) => marker.row)).toEqual([0, 1, 2, 3, 3, 3]);
  });

  it("starts the pump basal scale at zero with visible headroom", () => {
    expect(
      resolveMergedBasalDomain(
        [
          {
            startMs: 0,
            endMs: 1000,
            rateUnitsPerHour: 1.2,
            deliveryState: "delivering",
            isAutomated: true,
            controlIqReason: null,
            pumpActivityMode: null,
            basalAdjustmentPercent: null,
            source: "pump",
          },
        ],
        [0, 1000]
      )
    ).toEqual([0, 1.5]);
  });

  it("returns only activity types visible in the selected range", () => {
    expect(
      getVisibleActivityKinds({
        activityIntervals: [
          {
            startMs: 100,
            endMs: 200,
            mode: "exercise",
            isAutomated: true,
            source: "pump",
          },
        ],
        domain: [0, 1000],
        suspensionIntervals: [
          {
            startMs: 300,
            endMs: 400,
            hasConfirmedResume: true,
            isAutomated: true,
            source: "pump",
          },
        ],
      })
    ).toEqual(["exercise", "suspension"]);
  });
});
