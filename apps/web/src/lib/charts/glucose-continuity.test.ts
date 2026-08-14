import {
  getContinuousGlucosePairs,
  getIsolatedGlucosePoints,
  MAX_CONTINUOUS_GLUCOSE_INTERVAL_MS,
} from "./glucose-continuity";

interface TestPoint {
  timestampMs: number;
  value: number;
}

describe("getContinuousGlucosePairs", () => {
  const point = (timestampMs: number, value: number): TestPoint => ({
    timestampMs,
    value,
  });

  it("keeps adjacent readings within the continuity interval", () => {
    const first = point(0, 100);
    const second = point(MAX_CONTINUOUS_GLUCOSE_INTERVAL_MS, 110);

    expect(
      getContinuousGlucosePairs([first, second], (item) => item.timestampMs),
    ).toEqual([[first, second]]);
  });

  it("tolerates timestamp jitter around a 15 minute reading cadence", () => {
    const first = point(0, 100);
    const second = point(15 * 60 * 1000 + 30 * 1000, 110);

    expect(
      getContinuousGlucosePairs([first, second], (item) => item.timestampMs),
    ).toEqual([[first, second]]);
  });

  it("does not connect readings across a data gap", () => {
    const beforeGap = point(0, 100);
    const afterGap = point(MAX_CONTINUOUS_GLUCOSE_INTERVAL_MS + 1, 140);

    expect(
      getContinuousGlucosePairs(
        [beforeGap, afterGap],
        (item) => item.timestampMs,
      ),
    ).toEqual([]);
  });

  it("resumes the line after a data gap", () => {
    const beforeGap = point(0, 100);
    const afterGap = point(MAX_CONTINUOUS_GLUCOSE_INTERVAL_MS + 1, 140);
    const nextReading = point(
      MAX_CONTINUOUS_GLUCOSE_INTERVAL_MS + 5 * 60 * 1000,
      145,
    );

    expect(
      getContinuousGlucosePairs(
        [beforeGap, afterGap, nextReading],
        (item) => item.timestampMs,
      ),
    ).toEqual([[afterGap, nextReading]]);
  });
});

describe("getIsolatedGlucosePoints", () => {
  const point = (timestampMs: number, value: number): TestPoint => ({
    timestampMs,
    value,
  });

  it("returns a reading with continuity gaps on both sides", () => {
    const first = point(0, 100);
    const isolated = point(40 * 60 * 1000, 140);
    const last = point(80 * 60 * 1000, 120);

    expect(
      getIsolatedGlucosePoints(
        [first, isolated, last],
        (item) => item.timestampMs,
      ),
    ).toEqual([first, isolated, last]);
  });

  it("excludes readings that connect to either neighbor", () => {
    const beforeGap = point(0, 100);
    const afterGap = point(40 * 60 * 1000, 140);
    const connected = point(45 * 60 * 1000, 145);

    expect(
      getIsolatedGlucosePoints(
        [beforeGap, afterGap, connected],
        (item) => item.timestampMs,
      ),
    ).toEqual([beforeGap]);
  });
});
