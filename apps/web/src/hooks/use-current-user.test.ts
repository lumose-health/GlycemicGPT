/**
 * useCurrentUser fills the user's timezone from the browser exactly once, and
 * only when it is unset: a saved value is never overwritten, an older API that
 * omits the field is left alone, and a failed save never surfaces as an error.
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import {
  getCurrentUser,
  updateProfile,
  type CurrentUserResponse,
} from "@/lib/api";
import { useCurrentUser } from "./use-current-user";

jest.mock("@/lib/api", () => ({
  getCurrentUser: jest.fn(),
  updateProfile: jest.fn(),
}));

const mockGetCurrentUser = getCurrentUser as jest.MockedFunction<
  typeof getCurrentUser
>;
const mockUpdateProfile = updateProfile as jest.MockedFunction<
  typeof updateProfile
>;

function makeUser(
  overrides: Partial<CurrentUserResponse> = {},
): CurrentUserResponse {
  return {
    id: "u1",
    email: "user@test.local",
    display_name: null,
    role: "diabetic",
    is_active: true,
    email_verified: true,
    disclaimer_acknowledged: true,
    disclaimer_version: "1.0",
    timezone: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function mockBrowserZone(timeZone: string | undefined) {
  jest.spyOn(Intl, "DateTimeFormat").mockImplementation(
    () =>
      ({
        resolvedOptions: () => ({ timeZone }),
      }) as unknown as Intl.DateTimeFormat,
  );
}

describe("useCurrentUser timezone auto-fill", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    mockGetCurrentUser.mockReset();
    mockUpdateProfile.mockReset();
  });

  it("saves the browser zone once when the user's timezone is null", async () => {
    mockBrowserZone("Europe/London");
    mockGetCurrentUser.mockResolvedValue(makeUser({ timezone: null }));
    mockUpdateProfile.mockResolvedValue(
      makeUser({ timezone: "Europe/London" }),
    );

    const { result } = renderHook(() => useCurrentUser());

    await waitFor(() =>
      expect(result.current.user?.timezone).toBe("Europe/London"),
    );
    expect(mockUpdateProfile).toHaveBeenCalledTimes(1);
    expect(mockUpdateProfile).toHaveBeenCalledWith({
      timezone: "Europe/London",
    });
  });

  it("does not save again on a refresh after filling", async () => {
    mockBrowserZone("Europe/London");
    mockGetCurrentUser.mockResolvedValueOnce(makeUser({ timezone: null }));
    mockUpdateProfile.mockResolvedValue(
      makeUser({ timezone: "Europe/London" }),
    );

    const { result } = renderHook(() => useCurrentUser());
    await waitFor(() =>
      expect(result.current.user?.timezone).toBe("Europe/London"),
    );

    mockGetCurrentUser.mockResolvedValueOnce(
      makeUser({ timezone: "Europe/London" }),
    );
    await act(async () => {
      await result.current.refreshUser();
    });

    expect(mockUpdateProfile).toHaveBeenCalledTimes(1);
  });

  it("never overwrites a timezone that is already set", async () => {
    mockBrowserZone("Europe/London");
    mockGetCurrentUser.mockResolvedValue(
      makeUser({ timezone: "America/Chicago" }),
    );

    const { result } = renderHook(() => useCurrentUser());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(result.current.user?.timezone).toBe("America/Chicago");
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });

  it("leaves an older API that omits the field alone", async () => {
    mockBrowserZone("Europe/London");
    const legacy = makeUser();
    delete legacy.timezone;
    mockGetCurrentUser.mockResolvedValue(legacy);

    const { result } = renderHook(() => useCurrentUser());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });

  it("skips the save when the browser reports no usable zone", async () => {
    mockBrowserZone(undefined);
    mockGetCurrentUser.mockResolvedValue(makeUser({ timezone: null }));

    const { result } = renderHook(() => useCurrentUser());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockUpdateProfile).not.toHaveBeenCalled();
    expect(result.current.user?.timezone).toBeNull();
  });

  it.each(["UTC", "Etc/UTC", "Etc/Unknown"])(
    "skips %s, which privacy modes report regardless of location",
    async (zone) => {
      mockBrowserZone(zone);
      mockGetCurrentUser.mockResolvedValue(makeUser({ timezone: null }));

      const { result } = renderHook(() => useCurrentUser());

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(mockUpdateProfile).not.toHaveBeenCalled();
    },
  );

  it("keeps the user loaded and error-free when the save fails", async () => {
    mockBrowserZone("Europe/London");
    mockGetCurrentUser.mockResolvedValue(makeUser({ timezone: null }));
    mockUpdateProfile.mockRejectedValue(new Error("422"));

    const { result } = renderHook(() => useCurrentUser());

    await waitFor(() => expect(mockUpdateProfile).toHaveBeenCalledTimes(1));
    expect(result.current.error).toBeNull();
    expect(result.current.user?.timezone).toBeNull();
  });
});
