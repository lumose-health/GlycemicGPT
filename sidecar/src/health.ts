/**
 * Health / readiness endpoint for the AI sidecar.
 *
 * Reports overall status plus per-provider authentication state.
 * Uses singleton provider instances from providers/index.
 */

import type { Request, Response } from "express";
import { claude, codex, copilot } from "./providers/index.js";

export interface HealthResponse {
  status: "ok" | "degraded";
  uptime_seconds: number;
  claude_auth: boolean;
  codex_auth: boolean;
  copilot_auth: boolean;
  version: string;
}

const startTime = Date.now();

export async function healthHandler(
  _req: Request,
  res: Response,
): Promise<void> {
  const [claudeState, codexState, copilotState] = await Promise.all([
    claude.checkAuth(),
    codex.checkAuth(),
    copilot.checkAuth(),
  ]);

  const response: HealthResponse = {
    status: claudeState.authenticated || codexState.authenticated || copilotState.authenticated
      ? "ok"
      : "degraded",
    uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
    claude_auth: claudeState.authenticated,
    codex_auth: codexState.authenticated,
    copilot_auth: copilotState.authenticated,
    version: process.env.npm_package_version || "0.1.0",
  };

  res.json(response);
}
