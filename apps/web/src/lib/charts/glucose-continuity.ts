export const MAX_CONTINUOUS_GLUCOSE_INTERVAL_MS = 16 * 60 * 1000;

function isContinuousGlucoseInterval(intervalMs: number): boolean {
  return (
    Number.isFinite(intervalMs) &&
    intervalMs >= 0 &&
    intervalMs <= MAX_CONTINUOUS_GLUCOSE_INTERVAL_MS
  );
}

export function getContinuousGlucosePairs<T>(
  points: readonly T[],
  getTimestampMs: (point: T) => number,
): Array<readonly [T, T]> {
  const pairs: Array<readonly [T, T]> = [];

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const intervalMs = getTimestampMs(current) - getTimestampMs(previous);

    if (isContinuousGlucoseInterval(intervalMs)) {
      pairs.push([previous, current]);
    }
  }

  return pairs;
}

export function getIsolatedGlucosePoints<T>(
  points: readonly T[],
  getTimestampMs: (point: T) => number,
): T[] {
  return points.filter((point, index) => {
    const timestampMs = getTimestampMs(point);
    const previousIntervalMs =
      index > 0 ? timestampMs - getTimestampMs(points[index - 1]) : NaN;
    const nextIntervalMs =
      index < points.length - 1
        ? getTimestampMs(points[index + 1]) - timestampMs
        : NaN;

    return (
      !isContinuousGlucoseInterval(previousIntervalMs) &&
      !isContinuousGlucoseInterval(nextIntervalMs)
    );
  });
}
