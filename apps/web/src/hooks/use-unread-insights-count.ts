import { useCallback, useEffect, useState } from "react";

import { getUnreadInsightsCount } from "@/lib/api";

export function useUnreadInsightsCount(enabled: boolean) {
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchCount = useCallback(async () => {
    if (!enabled) {
      return;
    }

    try {
      const count = await getUnreadInsightsCount();
      setUnreadCount(count);
    } catch {
      // The badge is optional, so a failed refresh should not interrupt navigation.
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    fetchCount();
    const interval = setInterval(fetchCount, 60_000);

    return () => clearInterval(interval);
  }, [enabled, fetchCount]);

  return unreadCount;
}
