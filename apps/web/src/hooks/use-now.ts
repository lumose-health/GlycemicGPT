"use client";

import { useEffect, useState } from "react";

export function useNow(intervalMs = 1_000, enabled = true): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const intervalId = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(intervalId);
  }, [enabled, intervalMs]);

  return now;
}
