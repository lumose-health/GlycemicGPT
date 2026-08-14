/**
 * GlucoseStreamProvider Tests
 *
 * Story 4.5: Real-Time Updates via SSE
 */

import { renderHook } from "@testing-library/react";
import { useGlucoseStreamContext } from "./glucose-stream-provider";

describe("useGlucoseStreamContext", () => {
  it("throws error when used outside GlucoseStreamProvider", () => {
    // Suppress console.error for this test since we expect an error
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    try {
      expect(() => {
        renderHook(() => useGlucoseStreamContext());
      }).toThrow(
        "useGlucoseStreamContext must be used within a GlucoseStreamProvider",
      );
    } finally {
      consoleError.mockRestore();
    }
  });
});
