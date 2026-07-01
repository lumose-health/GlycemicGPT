/**
 * OAuth authentication routes for the sidecar.
 *
 * Story 15.1: Basic structure with status endpoint.
 * Story 15.2: Token-based auth flow for subscription providers.
 *
 * Since Claude Code CLI and Codex CLI don't support standard OAuth
 * device-code flows inside Docker containers, the sidecar uses a
 * token-paste approach: users run the CLI on their host to obtain
 * a token, then submit it via POST /auth/token.
 */

import { Router, type Request, type Response } from "express";
import {
  readClaudeToken,
  readCodexAuth,
  revokeClaudeToken,
  revokeCodexAuth,
  revokeCopilotToken,
  storeClaudeToken,
  storeCodexAuth,
  storeCopilotToken,
} from "./token-store.js";
import { copilot } from "../providers/index.js";

export const authRouter = Router();

const VALID_PROVIDERS = new Set(["claude", "codex", "copilot"]);

/** Maximum token length to accept (prevents abuse) */
const MAX_TOKEN_LENGTH = 5000;
/** Minimum token length for basic validation */
const MIN_TOKEN_LENGTH = 10;

/**
 * GET /auth/status - Check current authentication state.
 *
 * Copilot's status goes through copilot.checkAuth() (async) rather than a
 * plain token-file read like Claude/Codex: unlike those two, Copilot also
 * accepts ambient `copilot` CLI login as a valid credential (see
 * providers/copilot.ts), so a status check based only on the stored-token
 * file would under-report "authenticated" for that path.
 */
authRouter.get("/status", async (_req: Request, res: Response) => {
  const claudeToken = readClaudeToken();
  const codexAuth = readCodexAuth();
  const copilotState = await copilot.checkAuth();

  res.json({
    claude: {
      authenticated: !!claudeToken,
    },
    codex: {
      authenticated: !!(codexAuth && (codexAuth as Record<string, unknown>).accessToken),
    },
    copilot: {
      authenticated: copilotState.authenticated,
    },
  });
});

/**
 * POST /auth/start - Return auth method info for a provider.
 *
 * Instead of starting a true OAuth flow, returns instructions
 * for the token-paste approach (the only method that works
 * reliably inside Docker containers).
 */
authRouter.post("/start", (req: Request, res: Response) => {
  const { provider } = req.body as { provider?: string };

  if (!provider || !VALID_PROVIDERS.has(provider)) {
    res.status(400).json({
      error: "Invalid provider. Must be 'claude', 'codex', or 'copilot'.",
    });
    return;
  }

  const instructions =
    provider === "claude"
      ? "Run 'npx @anthropic-ai/claude-code setup-token' on your host machine to obtain a token."
      : provider === "codex"
        ? "Run 'npx @openai/codex login' on your host machine to obtain a token."
        : "Run 'gh auth token' (or generate a fine-grained PAT with Copilot access) on your host machine to obtain a token.";

  res.json({
    provider,
    auth_method: "token_paste",
    instructions,
  });
});

/**
 * POST /auth/token - Accept a token submission.
 *
 * The frontend collects the token from the user and forwards it
 * here (via the backend API) for storage.
 */
authRouter.post("/token", (req: Request, res: Response) => {
  const { provider, token } = req.body as { provider?: string; token?: string };

  if (!provider || !VALID_PROVIDERS.has(provider)) {
    res.status(400).json({ error: "Invalid provider. Must be 'claude', 'codex', or 'copilot'." });
    return;
  }

  if (!token || typeof token !== "string") {
    res.status(400).json({ error: "Token is required and must be a string." });
    return;
  }

  const trimmed = token.trim();

  if (trimmed.length < MIN_TOKEN_LENGTH || trimmed.length > MAX_TOKEN_LENGTH) {
    res.status(400).json({
      error: `Token must be between ${MIN_TOKEN_LENGTH} and ${MAX_TOKEN_LENGTH} characters.`,
    });
    return;
  }

  try {
    if (provider === "claude") {
      storeClaudeToken(trimmed);
    } else if (provider === "codex") {
      storeCodexAuth({ accessToken: trimmed });
    } else {
      storeCopilotToken(trimmed);
    }
    res.json({ success: true, provider });
  } catch {
    res.status(500).json({ error: "Failed to store token." });
  }
});

/**
 * POST /auth/revoke - Revoke stored authentication.
 */
authRouter.post("/revoke", (req: Request, res: Response) => {
  const { provider } = req.body as { provider?: string };

  if (!provider || !VALID_PROVIDERS.has(provider)) {
    res.status(400).json({
      error: "Invalid provider. Must be 'claude', 'codex', or 'copilot'.",
    });
    return;
  }

  try {
    if (provider === "claude") {
      revokeClaudeToken();
    } else if (provider === "codex") {
      revokeCodexAuth();
    } else {
      revokeCopilotToken();
    }
    res.json({ revoked: true, provider });
  } catch {
    res.status(500).json({ error: "Failed to revoke token." });
  }
});
