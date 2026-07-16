/**
 * Tests for the /health endpoint.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";

// Mock the singleton providers module
vi.mock("../src/providers/index.js", () => ({
  claude: {
    checkAuth: vi.fn().mockResolvedValue({
      authenticated: false,
      provider: "claude",
      message: "No Claude OAuth token found",
    }),
  },
  codex: {
    checkAuth: vi.fn().mockResolvedValue({
      authenticated: false,
      provider: "codex",
      message: "No Codex authentication found",
    }),
  },
  copilot: {
    checkAuth: vi.fn().mockResolvedValue({
      authenticated: false,
      provider: "copilot",
      message: "No Copilot authentication found",
    }),
  },
}));

function createMockRes() {
  const res = {
    json: vi.fn(),
    status: vi.fn().mockReturnThis(),
  } as unknown as express.Response;
  return res;
}

describe("healthHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns health status with auth states", async () => {
    const { healthHandler } = await import("../src/health.js");
    const req = {} as express.Request;
    const res = createMockRes();

    await healthHandler(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: expect.any(String),
        uptime_seconds: expect.any(Number),
        claude_auth: expect.any(Boolean),
        codex_auth: expect.any(Boolean),
        copilot_auth: expect.any(Boolean),
        version: expect.any(String),
      }),
    );
  });

  it("reports degraded when no provider is authenticated", async () => {
    const { healthHandler } = await import("../src/health.js");
    const req = {} as express.Request;
    const res = createMockRes();

    await healthHandler(req, res);

    const call = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.status).toBe("degraded");
    expect(call.claude_auth).toBe(false);
    expect(call.codex_auth).toBe(false);
  });
});
