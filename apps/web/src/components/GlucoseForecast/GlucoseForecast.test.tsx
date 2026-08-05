import { render, screen } from "@testing-library/react";
import type { ForecastReadResponse } from "@/lib/api";
import { GlucoseForecastLegend } from "./GlucoseForecastLegend";
import {
  buildGlucoseForecastPoints,
  isForecastOverlayEligible,
} from "./glucose-forecast-data";

const START_MS = new Date("2026-07-31T12:00:00.000Z").getTime();

function forecastResponse(
  overrides: Partial<ForecastReadResponse> = {},
): ForecastReadResponse {
  return {
    source_preference: "auto",
    effective_source: "loop",
    available_sources: ["loop"],
    forecast: {
      source_engine: "loop",
      source_uploader: "Loop",
      issued_at: new Date(START_MS).toISOString(),
      start_at: new Date(START_MS).toISOString(),
      step_minutes: 5,
      horizon_minutes: 15,
      curves_mgdl: { main: [120, 125, 130, 135] },
      default_curve_name: "main",
    },
    forecast_unavailable_reason: null,
    ...overrides,
  };
}

describe("glucose forecast data", () => {
  it("anchors a valid curve to the latest glucose reading", () => {
    const points = buildGlucoseForecastPoints({
      anchors: [
        { timestampMs: START_MS - 10 * 60_000, valueMgDl: 118 },
        { timestampMs: START_MS - 5 * 60_000, valueMgDl: 119 },
      ],
      domain: [START_MS - 3 * 60 * 60_000, START_MS],
      forecast: forecastResponse(),
    });

    expect(points).toEqual([
      { timestampMs: START_MS - 5 * 60_000, valueMgDl: 119 },
      { timestampMs: START_MS, valueMgDl: 120 },
      { timestampMs: START_MS + 5 * 60_000, valueMgDl: 125 },
      { timestampMs: START_MS + 10 * 60_000, valueMgDl: 130 },
      { timestampMs: START_MS + 15 * 60_000, valueMgDl: 135 },
    ]);
  });

  it("supports current long history windows and rejects malformed steps", () => {
    expect(
      isForecastOverlayEligible([START_MS - 24 * 60 * 60_000, START_MS]),
    ).toBe(true);
    expect(
      buildGlucoseForecastPoints({
        anchors: [{ timestampMs: START_MS - 5 * 60_000, valueMgDl: 119 }],
        domain: [START_MS - 24 * 60 * 60_000, START_MS],
        forecast: forecastResponse(),
      }),
    ).toHaveLength(5);
    expect(
      buildGlucoseForecastPoints({
        anchors: [],
        domain: [START_MS - 3 * 60 * 60_000, START_MS],
        forecast: forecastResponse({
          forecast: {
            ...forecastResponse().forecast!,
            step_minutes: 0,
          },
        }),
      }),
    ).toEqual([]);
  });

  it("does not draw a current forecast over a historical window", () => {
    expect(
      buildGlucoseForecastPoints({
        anchors: [],
        domain: [START_MS - 27 * 60 * 60_000, START_MS - 24 * 60 * 60_000],
        forecast: forecastResponse(),
      }),
    ).toEqual([]);
  });

  it("ignores invalid curve values beyond the emitted point limit", () => {
    const curve = [...Array(256).fill(120), Number.NaN];

    const points = buildGlucoseForecastPoints({
      anchors: [],
      domain: [START_MS - 3 * 60 * 60_000, START_MS],
      forecast: forecastResponse({
        forecast: {
          ...forecastResponse().forecast!,
          curves_mgdl: { main: curve },
        },
      }),
    });

    expect(points).toHaveLength(256);
    expect(points.every((point) => Number.isFinite(point.valueMgDl))).toBe(true);
  });

  it.each([
    ["missing curves", null],
    ["non-object curves", "unexpected"],
    ["non-array default curve", { main: { value: 120 } }],
    ["partially malformed curve", { main: [120, "unexpected", 130] }],
  ])("ignores %s without throwing", (_label, curvesMgdl) => {
    const malformed = forecastResponse() as unknown as {
      forecast: Record<string, unknown>;
    };
    malformed.forecast.curves_mgdl = curvesMgdl;

    expect(() =>
      buildGlucoseForecastPoints({
        anchors: [{ timestampMs: START_MS - 5 * 60_000, valueMgDl: 119 }],
        domain: [START_MS - 3 * 60 * 60_000, START_MS],
        forecast: malformed as unknown as ForecastReadResponse,
      }),
    ).not.toThrow();
    expect(
      buildGlucoseForecastPoints({
        anchors: [],
        domain: [START_MS - 3 * 60 * 60_000, START_MS],
        forecast: malformed as unknown as ForecastReadResponse,
      }),
    ).toEqual([]);
  });
});

describe("GlucoseForecastLegend", () => {
  it("attributes a visible forecast to its algorithm", () => {
    render(
      <GlucoseForecastLegend
        eligible
        forecast={forecastResponse()}
        points={[
          { timestampMs: START_MS, valueMgDl: 120 },
          { timestampMs: START_MS + 5 * 60_000, valueMgDl: 125 },
        ]}
      />,
    );

    expect(screen.getByTestId("forecast-legend")).toHaveTextContent(
      "Forecast from Loop",
    );
  });

  it("explains stale forecast data without rendering a swatch", () => {
    render(
      <GlucoseForecastLegend
        eligible
        forecast={forecastResponse({
          forecast: null,
          forecast_unavailable_reason: "stale",
        })}
        points={[]}
      />,
    );

    expect(screen.getByTestId("forecast-legend")).toHaveTextContent(
      "older than 30 minutes",
    );
  });
});
