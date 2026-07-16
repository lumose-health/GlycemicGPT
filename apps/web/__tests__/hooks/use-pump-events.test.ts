import { act, renderHook, waitFor } from "@testing-library/react";
import {
  calculatePumpEventsRequest,
  filterPumpEventsForWindow,
  usePumpEvents,
} from "@/hooks/use-pump-events";
import {
  getPumpEventHistory,
  type PumpEventHistoryResponse,
  type PumpEventReading,
} from "@/lib/api";

jest.mock("@/lib/api", () => ({
  getPumpEventHistory: jest.fn(),
}));

const mockGetPumpEventHistory = getPumpEventHistory as jest.MockedFunction<
  typeof getPumpEventHistory
>;

function makeEvent(
  eventTimestamp: string,
  overrides: Partial<PumpEventReading> = {}
): PumpEventReading {
  return {
    event_type: "basal",
    event_timestamp: eventTimestamp,
    units: 1,
    duration_minutes: 5,
    is_automated: true,
    control_iq_reason: null,
    pump_activity_mode: null,
    basal_adjustment_pct: null,
    iob_at_event: null,
    cob_at_event: null,
    bg_at_event: null,
    received_at: eventTimestamp,
    source: "tandem",
    ...overrides,
  };
}

function makeResponse(
  events: PumpEventReading[],
  count: number = events.length
): PumpEventHistoryResponse {
  return { events, count };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
  mockGetPumpEventHistory.mockResolvedValue(
    makeResponse([makeEvent("2026-07-12T11:55:00.000Z")])
  );
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("calculatePumpEventsRequest", () => {
  it("adds basal continuity lookback to normal period requests", () => {
    expect(calculatePumpEventsRequest("3h", null)).toEqual({
      minutes: 1620,
      limit: 2000,
      isRangeLimited: false,
    });
    expect(calculatePumpEventsRequest("30d", undefined)).toEqual({
      minutes: 43_200,
      limit: 5000,
      isRangeLimited: true,
    });
  });

  it("requests from now through the recorded basal continuity lookback", () => {
    const nowMs = new Date("2026-07-12T12:00:00.000Z").getTime();

    expect(
      calculatePumpEventsRequest(
        "3h",
        {
          from: "2026-07-12T10:00:00.000Z",
          to: "2026-07-12T11:00:00.000Z",
        },
        nowMs
      )
    ).toEqual({
      minutes: 1560,
      limit: 2000,
      isRangeLimited: false,
    });
  });

  it("clamps historical requests to the API maximums", () => {
    const nowMs = new Date("2026-07-12T12:00:00.000Z").getTime();

    expect(
      calculatePumpEventsRequest(
        "24h",
        {
          from: "2026-06-01T12:00:00.000Z",
          to: "2026-06-02T12:00:00.000Z",
        },
        nowMs
      )
    ).toEqual({
      minutes: 43_200,
      limit: 5000,
      isRangeLimited: true,
    });
  });
});

describe("filterPumpEventsForWindow", () => {
  it("retains events through the window end plus the recorded basal lookback", () => {
    const window = {
      from: "2026-07-12T10:00:00.000Z",
      to: "2026-07-12T11:00:00.000Z",
    };
    const retainedAtLookbackBoundary = makeEvent("2026-07-11T10:00:00.000Z");
    const retainedAtWindowEnd = makeEvent("2026-07-12T11:00:00.000Z");

    expect(
      filterPumpEventsForWindow(
        [
          makeEvent("2026-07-11T09:59:59.999Z"),
          retainedAtLookbackBoundary,
          makeEvent("not-a-date"),
          retainedAtWindowEnd,
          makeEvent("2026-07-12T11:00:00.001Z"),
        ],
        window
      )
    ).toEqual([retainedAtLookbackBoundary, retainedAtWindowEnd]);
  });
});

describe("usePumpEvents", () => {
  it("keeps default period fetching compatible and returns response metadata", async () => {
    const events = [makeEvent("2026-07-12T11:55:00.000Z")];
    mockGetPumpEventHistory.mockResolvedValue(makeResponse(events));

    const { result } = renderHook(() => usePumpEvents("3h"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockGetPumpEventHistory).toHaveBeenCalledWith(1620, 2000);
    expect(result.current.events).toEqual(events);
    expect(result.current.count).toBe(1);
    expect(result.current.hasPumpHistory).toBe(true);
    expect(result.current.isPossiblyTruncated).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("filters a selected window and reports a response that reached its limit", async () => {
    jest
      .spyOn(Date, "now")
      .mockReturnValue(new Date("2026-07-12T12:00:00.000Z").getTime());
    const retainedEvents = [
      makeEvent("2026-07-11T10:00:00.000Z"),
      makeEvent("2026-07-12T10:30:00.000Z"),
    ];
    mockGetPumpEventHistory.mockResolvedValue(
      makeResponse(
        [
          makeEvent("2026-07-12T11:30:00.000Z"),
          ...retainedEvents,
          makeEvent("2026-07-11T09:59:00.000Z"),
        ],
        2000
      )
    );

    const { result } = renderHook(() =>
      usePumpEvents("3h", {
        from: "2026-07-12T10:00:00.000Z",
        to: "2026-07-12T11:00:00.000Z",
      })
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockGetPumpEventHistory).toHaveBeenCalledWith(1560, 2000);
    expect(result.current.events).toEqual(retainedEvents);
    expect(result.current.count).toBe(2);
    expect(result.current.hasPumpHistory).toBe(true);
    expect(result.current.isPossiblyTruncated).toBe(true);
  });

  it("reports API range clamping even when the row limit was not reached", async () => {
    jest
      .spyOn(Date, "now")
      .mockReturnValue(new Date("2026-07-12T12:00:00.000Z").getTime());
    const recentPumpEvent = makeEvent("2026-07-12T11:55:00.000Z");
    mockGetPumpEventHistory.mockResolvedValue(makeResponse([recentPumpEvent]));

    const { result } = renderHook(() =>
      usePumpEvents("30d", {
        from: "2026-05-01T12:00:00.000Z",
        to: "2026-05-02T12:00:00.000Z",
      })
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockGetPumpEventHistory).toHaveBeenCalledWith(43_200, 5000);
    expect(result.current.events).toEqual([]);
    expect(result.current.hasPumpHistory).toBe(true);
    expect(result.current.isPossiblyTruncated).toBe(true);
  });

  it("ignores a stale request when the selected window changes", async () => {
    jest
      .spyOn(Date, "now")
      .mockReturnValue(new Date("2026-07-12T12:00:00.000Z").getTime());
    let resolveFirst: (value: PumpEventHistoryResponse) => void;
    const firstRequest = new Promise<PumpEventHistoryResponse>((resolve) => {
      resolveFirst = resolve;
    });
    const latestEvent = makeEvent("2026-07-12T10:30:00.000Z");
    mockGetPumpEventHistory
      .mockReturnValueOnce(firstRequest)
      .mockResolvedValueOnce(makeResponse([latestEvent]));

    const firstWindow = {
      from: "2026-07-12T08:00:00.000Z",
      to: "2026-07-12T09:00:00.000Z",
    };
    const secondWindow = {
      from: "2026-07-12T10:00:00.000Z",
      to: "2026-07-12T11:00:00.000Z",
    };
    const { result, rerender } = renderHook(
      ({ window }) => usePumpEvents("3h", window),
      { initialProps: { window: firstWindow } }
    );

    rerender({ window: secondWindow });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    resolveFirst!(
      makeResponse([makeEvent("2026-07-12T08:30:00.000Z")], 5000)
    );
    await act(async () => {
      await firstRequest;
    });

    expect(result.current.events).toEqual([latestEvent]);
    expect(result.current.count).toBe(1);
    expect(result.current.hasPumpHistory).toBe(true);
    expect(result.current.isPossiblyTruncated).toBe(false);
  });
});
