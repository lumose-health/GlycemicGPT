/**
 * useGlucoseHistory Hook Tests
 *
 * Tests for the glucose history data fetching hook
 * used by the GlucoseTrendChart component.
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import { useGlucoseHistory, type ChartTimePeriod } from "./use-glucose-history";
import { getGlucoseHistory, getGlucoseHistoryByDateRange } from "@/lib/api";

// Mock the API module
jest.mock("@/lib/api", () => ({
  getGlucoseHistory: jest.fn(),
  getGlucoseHistoryByDateRange: jest.fn(),
}));

const mockGetGlucoseHistory = getGlucoseHistory as jest.MockedFunction<
  typeof getGlucoseHistory
>;
const mockGetGlucoseHistoryByDateRange =
  getGlucoseHistoryByDateRange as jest.MockedFunction<
    typeof getGlucoseHistoryByDateRange
  >;

function makeReadings(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    value: 100 + i * 5,
    reading_timestamp: new Date(
      Date.now() - (count - i) * 5 * 60_000,
    ).toISOString(),
    trend: "flat",
    trend_rate: null,
    received_at: new Date().toISOString(),
    source: "dexcom",
  }));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetGlucoseHistory.mockResolvedValue({
    readings: makeReadings(5),
    count: 5,
  });
  mockGetGlucoseHistoryByDateRange.mockResolvedValue({
    readings: makeReadings(5),
    count: 5,
  });
});

describe("useGlucoseHistory", () => {
  it("fetches data on mount with default 3h period and scaled limit", async () => {
    const { result } = renderHook(() => useGlucoseHistory("3h"));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGetGlucoseHistory).toHaveBeenCalledWith(180, 36);
    expect(result.current.readings).toHaveLength(5);
    expect(result.current.error).toBeNull();
    expect(result.current.period).toBe("3h");
  });

  it("uses correct minutes and limit for each period", async () => {
    const periods: [ChartTimePeriod, number, number][] = [
      ["3h", 180, 36],
      ["6h", 360, 72],
      ["12h", 720, 144],
      ["24h", 1440, 288],
    ];

    for (const [period, expectedMinutes, expectedLimit] of periods) {
      mockGetGlucoseHistory.mockClear();
      mockGetGlucoseHistory.mockResolvedValue({
        readings: makeReadings(3),
        count: 3,
      });

      const { result } = renderHook(() => useGlucoseHistory(period));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockGetGlucoseHistory).toHaveBeenCalledWith(
        expectedMinutes,
        expectedLimit,
      );
    }
  });

  it("refetches when period changes", async () => {
    const { result } = renderHook(() => useGlucoseHistory("3h"));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGetGlucoseHistory).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.setPeriod("6h");
    });

    await waitFor(() => {
      expect(mockGetGlucoseHistory).toHaveBeenCalledTimes(2);
    });

    expect(mockGetGlucoseHistory).toHaveBeenLastCalledWith(360, 72);
  });

  it("handles API errors gracefully", async () => {
    mockGetGlucoseHistory.mockRejectedValueOnce(new Error("Network failure"));

    const { result } = renderHook(() => useGlucoseHistory("3h"));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe("Network failure");
    expect(result.current.readings).toHaveLength(0);
  });

  it("handles non-Error thrown values", async () => {
    mockGetGlucoseHistory.mockRejectedValueOnce("string error");

    const { result } = renderHook(() => useGlucoseHistory("3h"));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe("Failed to load history");
  });

  it("exposes a refetch function", async () => {
    const { result } = renderHook(() => useGlucoseHistory("3h"));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGetGlucoseHistory).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.refetch();
    });

    await waitFor(() => {
      expect(mockGetGlucoseHistory).toHaveBeenCalledTimes(2);
    });
  });

  it("starts in loading state", () => {
    const { result } = renderHook(() => useGlucoseHistory("3h"));
    expect(result.current.isLoading).toBe(true);
  });

  it.each([
    [{ from: "not-a-date", to: "2026-07-12T12:00:00.000Z" }],
    [{ from: "2026-07-12T10:00:00.000Z", to: "not-a-date" }],
    [
      {
        from: "2026-07-12T12:00:00.000Z",
        to: "2026-07-12T10:00:00.000Z",
      },
    ],
  ])(
    "falls back to the period for an invalid date window",
    async (dateWindow) => {
      const { result } = renderHook(() => useGlucoseHistory("6h", dateWindow));

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(mockGetGlucoseHistory).toHaveBeenCalledWith(360, 72);
      expect(mockGetGlucoseHistoryByDateRange).not.toHaveBeenCalled();
    },
  );

  it("discards stale fetch results when period changes rapidly", async () => {
    // First call resolves slowly, second call resolves fast
    let resolveFirst: (value: unknown) => void;
    const firstPromise = new Promise((resolve) => {
      resolveFirst = resolve;
    });

    mockGetGlucoseHistory
      .mockReturnValueOnce(firstPromise as never)
      .mockResolvedValueOnce({
        readings: makeReadings(2),
        count: 2,
      });

    const { result } = renderHook(() => useGlucoseHistory("3h"));

    // Immediately switch period before first fetch resolves
    act(() => {
      result.current.setPeriod("6h");
    });

    // Wait for the second (6h) fetch to complete
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.readings).toHaveLength(2);

    await act(async () => {
      resolveFirst!({
        readings: makeReadings(10),
        count: 10,
      });
      await firstPromise;
      await Promise.resolve();
    });

    // Should have 2 readings from the 6h fetch, not 10 from the stale 3h fetch
    expect(result.current.readings).toHaveLength(2);
  });
});
