import { renderHook, waitFor } from "@testing-library/react";

import { getUnreadInsightsCount } from "@/lib/api";

import { useUnreadInsightsCount } from "./use-unread-insights-count";

jest.mock("@/lib/api", () => ({
  getUnreadInsightsCount: jest.fn(),
}));

const mockGetUnreadInsightsCount =
  getUnreadInsightsCount as jest.MockedFunction<typeof getUnreadInsightsCount>;

beforeEach(() => {
  mockGetUnreadInsightsCount.mockReset();
});

describe("useUnreadInsightsCount", () => {
  it("fetches the unread count when enabled", async () => {
    mockGetUnreadInsightsCount.mockResolvedValue(7);

    const { result } = renderHook(() => useUnreadInsightsCount(true));

    await waitFor(() => expect(result.current).toBe(7));
    expect(mockGetUnreadInsightsCount).toHaveBeenCalledTimes(1);
  });

  it("does not fetch when disabled", () => {
    const { result } = renderHook(() => useUnreadInsightsCount(false));

    expect(result.current).toBe(0);
    expect(mockGetUnreadInsightsCount).not.toHaveBeenCalled();
  });
});
