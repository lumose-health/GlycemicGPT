"use client";

import { type ReactNode, useEffect, useState } from "react";

import { startMockWorker } from "./browser";
import { DevMockPanel } from "./DevMockPanel";

interface MockProviderProps {
  children: ReactNode;
  initialShouldMock?: boolean;
}

let mockStartupPromise: Promise<void> | null = null;

function ensureMockRuntimeStarted(active: boolean): Promise<void> | null {
  if (
    process.env.NODE_ENV !== "development" ||
    typeof window === "undefined" ||
    !active
  ) {
    return null;
  }

  mockStartupPromise ??= startMockWorker();
  return mockStartupPromise;
}

export function MockProvider({
  children,
  initialShouldMock = false,
}: MockProviderProps) {
  const [shouldMock] = useState(initialShouldMock);
  const [isStarting, setIsStarting] = useState(shouldMock);

  useEffect(() => {
    if (!shouldMock) {
      return;
    }

    let cancelled = false;
    const startup = ensureMockRuntimeStarted(shouldMock);
    if (!startup) {
      setIsStarting(false);
      return;
    }

    startup.finally(() => {
      if (!cancelled) {
        setIsStarting(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [shouldMock]);

  return (
    <>
      {isStarting ? (
        <div className="grid min-h-screen place-items-center bg-surface-page text-foreground-primary">
          <div className="rounded-panel border border-border-default bg-surface-primary p-4">
            <p className="font_metric_label">Starting mock data</p>
          </div>
        </div>
      ) : (
        children
      )}
      {shouldMock ? <DevMockPanel runtimeActive={shouldMock} /> : null}
    </>
  );
}
