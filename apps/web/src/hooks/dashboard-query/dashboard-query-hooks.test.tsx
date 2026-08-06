import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";

import {
  getGlucoseHistoryByDateRange,
  type GlucoseHistoryResponse,
} from "@/lib/api";
import { useOptionalDashboardTimeRange } from "@/components/DashboardTimeRangeProvider";
import { useUserContext } from "@/providers/user-provider";

import { useDashboardGlucoseHistory } from "./dashboard-query-hooks";

jest.mock("@/lib/api", () => ({
  getGlucoseHistoryByDateRange: jest.fn(),
}));
jest.mock("@/providers/user-provider", () => ({
  useUserContext: jest.fn(),
}));
jest.mock("@/components/DashboardTimeRangeProvider", () => ({
  useOptionalDashboardTimeRange: jest.fn(),
}));

const mockGetGlucoseHistoryByDateRange = jest.mocked(
  getGlucoseHistoryByDateRange,
);
const mockUseUserContext = jest.mocked(useUserContext);
const mockUseOptionalDashboardTimeRange = jest.mocked(
  useOptionalDashboardTimeRange,
);
const firstWindow = {
  from: "2026-08-01T00:00:00.000Z",
  to: "2026-08-02T00:00:00.000Z",
};
const secondWindow = {
  from: "2026-07-31T00:00:00.000Z",
  to: "2026-08-02T00:00:00.000Z",
};
const firstResponse: GlucoseHistoryResponse = {
  count: 1,
  readings: [
    {
      value: 110,
      reading_timestamp: "2026-08-01T12:00:00.000Z",
      trend: "Flat",
      trend_rate: 0,
      received_at: "2026-08-01T12:00:01.000Z",
      source: "test",
    },
  ],
};

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("V2 dashboard query hooks", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseUserContext.mockReturnValue({
      user: { id: "user-1" },
      isLoading: false,
      error: null,
      refreshUser: jest.fn(),
    } as unknown as ReturnType<typeof useUserContext>);
    mockUseOptionalDashboardTimeRange.mockReturnValue(null);
  });

  it("deduplicates concurrent consumers and reuses fresh data after remount", async () => {
    mockGetGlucoseHistoryByDateRange.mockResolvedValue(firstResponse);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = createWrapper(queryClient);
    const first = renderHook(
      () => [
        useDashboardGlucoseHistory("24h", firstWindow),
        useDashboardGlucoseHistory("24h", firstWindow),
      ],
      { wrapper },
    );
    await waitFor(() =>
      expect(first.result.current[0].readings).toHaveLength(1),
    );
    expect(mockGetGlucoseHistoryByDateRange).toHaveBeenCalledTimes(1);
    first.unmount();

    const revisit = renderHook(
      () => useDashboardGlucoseHistory("24h", firstWindow),
      { wrapper },
    );
    expect(revisit.result.current.readings).toHaveLength(1);
    expect(mockGetGlucoseHistoryByDateRange).toHaveBeenCalledTimes(1);
  });

  it("keeps previous data visible while a new range loads", async () => {
    let resolveSecond: ((value: GlucoseHistoryResponse) => void) | undefined;
    mockGetGlucoseHistoryByDateRange
      .mockResolvedValueOnce(firstResponse)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecond = resolve;
          }),
      );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = createWrapper(queryClient);
    const view = renderHook(
      ({ window }) => useDashboardGlucoseHistory("24h", window),
      { initialProps: { window: firstWindow }, wrapper },
    );
    await waitFor(() => expect(view.result.current.readings).toHaveLength(1));

    view.rerender({ window: secondWindow });
    await waitFor(() => expect(view.result.current.isUpdating).toBe(true));
    expect(view.result.current.isPreviousData).toBe(true);
    expect(view.result.current.readings[0]?.value).toBe(110);

    await act(async () => {
      resolveSecond?.({ count: 0, readings: [] });
    });
    await waitFor(() => expect(view.result.current.isUpdating).toBe(false));
  });

  it("keeps cached data visible when a background refresh fails", async () => {
    mockGetGlucoseHistoryByDateRange.mockResolvedValueOnce(firstResponse);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const view = renderHook(
      () => useDashboardGlucoseHistory("24h", firstWindow),
      { wrapper: createWrapper(queryClient) },
    );
    await waitFor(() => expect(view.result.current.readings).toHaveLength(1));

    mockGetGlucoseHistoryByDateRange.mockRejectedValueOnce(
      new Error("Refresh failed"),
    );
    await act(async () => {
      await queryClient.invalidateQueries({
        queryKey: ["dashboard", "user-1", "glucose-history"],
      });
    });

    await waitFor(() =>
      expect(view.result.current.hasBackgroundError).toBe(true),
    );
    expect(view.result.current.readings).toEqual(firstResponse.readings);
    expect(view.result.current.error).toBe("Refresh failed");
    expect(view.result.current.isLoading).toBe(false);
  });

  it("passes cancellation through when a range becomes obsolete", async () => {
    let wasAborted = false;
    mockGetGlucoseHistoryByDateRange.mockImplementation(
      (_start, _end, _limit, signal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => {
            wasAborted = true;
            reject(new DOMException("Cancelled", "AbortError"));
          });
        }),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const view = renderHook(
      ({ window }) => useDashboardGlucoseHistory("24h", window),
      {
        initialProps: { window: firstWindow },
        wrapper: createWrapper(queryClient),
      },
    );
    await waitFor(() =>
      expect(mockGetGlucoseHistoryByDateRange).toHaveBeenCalledTimes(1),
    );

    view.rerender({ window: secondWindow });
    await waitFor(() => expect(wasAborted).toBe(true));
  });

  it("evicts inactive dashboard data after five minutes", async () => {
    jest.useFakeTimers();
    mockGetGlucoseHistoryByDateRange.mockResolvedValue(firstResponse);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const view = renderHook(
      () => useDashboardGlucoseHistory("24h", firstWindow),
      { wrapper: createWrapper(queryClient) },
    );
    await act(async () => {
      await Promise.resolve();
    });
    view.unmount();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(1);

    act(() => {
      jest.advanceTimersByTime(5 * 60 * 1000);
    });
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    jest.useRealTimers();
  });

  it("restarts the five minute eviction timer after a revisit", async () => {
    jest.useFakeTimers();
    mockGetGlucoseHistoryByDateRange.mockResolvedValue(firstResponse);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = createWrapper(queryClient);
    const firstVisit = renderHook(
      () => useDashboardGlucoseHistory("24h", firstWindow),
      { wrapper },
    );
    await act(async () => {
      await Promise.resolve();
    });
    firstVisit.unmount();

    act(() => {
      jest.advanceTimersByTime(4 * 60 * 1000);
    });
    const revisit = renderHook(
      () => useDashboardGlucoseHistory("24h", firstWindow),
      { wrapper },
    );
    act(() => {
      jest.advanceTimersByTime(2 * 60 * 1000);
    });
    expect(queryClient.getQueryCache().getAll()).toHaveLength(1);

    revisit.unmount();
    act(() => {
      jest.advanceTimersByTime(5 * 60 * 1000 - 1);
    });
    expect(queryClient.getQueryCache().getAll()).toHaveLength(1);
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    jest.useRealTimers();
  });

  it("reuses a preset cache entry when its resolved now window changes", async () => {
    const firstSevenDayWindow = {
      from: "2026-07-26T00:00:00.000Z",
      to: "2026-08-02T00:00:00.000Z",
    };
    const shiftedSevenDayWindow = {
      from: "2026-07-26T00:01:00.000Z",
      to: "2026-08-02T00:01:00.000Z",
    };
    let currentWindow = firstSevenDayWindow;
    mockUseOptionalDashboardTimeRange.mockImplementation(
      () =>
        ({
          currentWindow,
          label: "Last 7 days",
          selection: { kind: "preset", range: "7d" },
          setSelection: jest.fn(),
          timeZone: "UTC",
        }) as ReturnType<typeof useOptionalDashboardTimeRange>,
    );
    mockGetGlucoseHistoryByDateRange.mockResolvedValue(firstResponse);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = createWrapper(queryClient);
    const firstVisit = renderHook(
      () => useDashboardGlucoseHistory("24h", currentWindow),
      { wrapper },
    );
    await waitFor(() =>
      expect(firstVisit.result.current.readings).toHaveLength(1),
    );
    firstVisit.unmount();

    currentWindow = shiftedSevenDayWindow;
    const revisit = renderHook(
      () => useDashboardGlucoseHistory("24h", currentWindow),
      { wrapper },
    );

    expect(revisit.result.current.readings).toHaveLength(1);
    expect(mockGetGlucoseHistoryByDateRange).toHaveBeenCalledTimes(1);
  });
});
