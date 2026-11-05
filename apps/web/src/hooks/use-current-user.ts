/**
 * Story 8.3: useCurrentUser hook
 *
 * Fetches and caches the current user's profile (id, email, role).
 * Used by dashboard pages to determine role-based rendering.
 *
 * Story 15.5: Added refreshUser to allow re-fetching after disclaimer acknowledgment.
 *
 * Timezone auto-fill: on the first authenticated load, a user whose timezone is
 * still unset (`null`) gets the browser's zone saved once. A value that is
 * already set is never overwritten, and an older API that omits the field
 * (`undefined`) is left alone.
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getCurrentUser,
  updateProfile,
  type CurrentUserResponse,
} from "@/lib/api";
import { browserTimezone } from "@/lib/timezones";

/**
 * Save the browser's timezone when the user has none yet. Returns the updated
 * user, or `null` when nothing was saved. Best-effort: a failure (offline, or
 * the API rejecting the browser's zone) just leaves the field unset.
 */
async function autofillTimezone(
  user: CurrentUserResponse,
): Promise<CurrentUserResponse | null> {
  if (user.timezone !== null) return null;
  const tz = browserTimezone();
  if (!tz) return null;
  try {
    return await updateProfile({ timezone: tz });
  } catch {
    return null;
  }
}

interface UseCurrentUserReturn {
  user: CurrentUserResponse | null;
  isLoading: boolean;
  error: string | null;
  refreshUser: () => Promise<void>;
}

export function useCurrentUser(): UseCurrentUserReturn {
  const [user, setUser] = useState<CurrentUserResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchUser() {
      let loaded: CurrentUserResponse | null = null;
      try {
        const data = await getCurrentUser();
        if (!cancelled) {
          setUser(data);
          setError(null);
        }
        loaded = data;
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to fetch user"
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }

      // After loading is reported, so the save never delays the page.
      if (loaded && !cancelled) {
        const filled = await autofillTimezone(loaded);
        if (filled && !cancelled) {
          // Only the timezone changed; keep anything a concurrent refresh set.
          setUser((prev) =>
            prev ? { ...prev, timezone: filled.timezone } : filled,
          );
        }
      }
    }

    fetchUser();

    return () => {
      cancelled = true;
    };
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const data = await getCurrentUser();
      setUser(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch user");
    }
  }, []);

  return { user, isLoading, error, refreshUser };
}
