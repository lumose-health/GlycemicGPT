import type { ForecastReadResponse } from "@/lib/api";
import type {
  GlucoseForecastAnchor,
  GlucoseForecastPoint,
} from "./GlucoseForecast.types";

const FORECAST_START_LEEWAY_MS = 5 * 60 * 1000;
const MAX_FORECAST_POINTS = 256;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isForecastOverlayEligible(
  domain: readonly [number, number],
): boolean {
  return domain[1] > domain[0];
}

export function buildGlucoseForecastPoints({
  anchors,
  domain,
  forecast,
}: {
  anchors: readonly GlucoseForecastAnchor[];
  domain: readonly [number, number];
  forecast: ForecastReadResponse | null | undefined;
}): GlucoseForecastPoint[] {
  if (!isForecastOverlayEligible(domain)) {
    return [];
  }

  const payload: unknown = forecast?.forecast;
  if (!isRecord(payload)) {
    return [];
  }

  const startMs =
    typeof payload.start_at === "string"
      ? new Date(payload.start_at).getTime()
      : Number.NaN;
  const stepMs =
    typeof payload.step_minutes === "number"
      ? payload.step_minutes * 60_000
      : Number.NaN;

  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(stepMs) ||
    stepMs <= 0 ||
    startMs < domain[0] ||
    startMs > domain[1] + FORECAST_START_LEEWAY_MS
  ) {
    return [];
  }

  const curves = payload.curves_mgdl;
  const defaultCurveName = payload.default_curve_name;

  if (
    !isRecord(curves) ||
    typeof defaultCurveName !== "string" ||
    !Array.isArray(curves[defaultCurveName])
  ) {
    return [];
  }
  const curve = curves[defaultCurveName];
  const limit = Math.min(curve.length, MAX_FORECAST_POINTS);
  if (
    limit === 0 ||
    curve
      .slice(0, limit)
      .some((value) => typeof value !== "number" || !Number.isFinite(value))
  ) {
    return [];
  }

  const points: GlucoseForecastPoint[] = [];
  const anchor = [...anchors]
    .filter(
      (point) =>
        Number.isFinite(point.timestampMs) &&
        Number.isFinite(point.valueMgDl) &&
        point.timestampMs >= domain[0] &&
        point.timestampMs <= startMs,
    )
    .sort((left, right) => left.timestampMs - right.timestampMs)
    .at(-1);

  if (anchor) {
    points.push(anchor);
  }

  for (let index = 0; index < limit; index += 1) {
    const valueMgDl = curve[index];
    const timestampMs = startMs + index * stepMs;

    if (anchor && timestampMs <= anchor.timestampMs) {
      continue;
    }

    points.push({ timestampMs, valueMgDl });
  }

  return points.length >= 2 ? points : [];
}

export function getForecastEndMs(
  points: readonly GlucoseForecastPoint[],
): number | null {
  return points.at(-1)?.timestampMs ?? null;
}
