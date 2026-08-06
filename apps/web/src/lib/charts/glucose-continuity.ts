export const MAX_CONTINUOUS_GLUCOSE_INTERVAL_MS = 15 * 60 * 1000;

export function getContinuousGlucosePairs<T>(
  points: readonly T[],
  getTimestampMs: (point: T) => number,
): Array<readonly [T, T]> {
  const pairs: Array<readonly [T, T]> = [];

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const intervalMs = getTimestampMs(current) - getTimestampMs(previous);

    if (
      Number.isFinite(intervalMs) &&
      intervalMs >= 0 &&
      intervalMs <= MAX_CONTINUOUS_GLUCOSE_INTERVAL_MS
    ) {
      pairs.push([previous, current]);
    }
  }

  return pairs;
}
