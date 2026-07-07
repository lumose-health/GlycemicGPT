"use client";

import { type ReactNode, useEffect, useState } from "react";

import { startMockWorker } from "./browser";
import { DevMockPanel } from "./DevMockPanel";

interface MockProviderProps {
  children: ReactNode;
  initialShouldMock?: boolean;
}

export function MockProvider({
  children,
  initialShouldMock = false,
}: MockProviderProps) {
  const [shouldMock] = useState(initialShouldMock);
  const [isStarting, setIsStarting] = useState(shouldMock);
  const [hasStartError, setHasStartError] = useState(false);

  useEffect(() => {
    if (!shouldMock) {
      return;
    }

    let cancelled = false;
    // startMockWorker is a no-op outside development and memoizes its own
    // start promise, so repeated mounts are safe and failed starts retry.
    startMockWorker()
      .catch((error) => {
        console.error("Failed to start mock runtime", error);
        if (!cancelled) {
          setHasStartError(true);
        }
      })
      .finally(() => {
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
      {shouldMock ? (
        <DevMockPanel runtimeActive={shouldMock && !hasStartError} />
      ) : null}
    </>
  );
}
