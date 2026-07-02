/**
 * Token persistence for OAuth tokens.
 *
 * Tokens are stored in files on a volume-mounted directory so they
 * survive container restarts but not `docker compose down -v`.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const TOKEN_DIR = process.env.TOKEN_DIR || "/home/sidecar/.config/sidecar";

function ensureDir(): void {
  if (!existsSync(TOKEN_DIR)) {
    mkdirSync(TOKEN_DIR, { recursive: true, mode: 0o700 });
  }
}

/** Store a Claude OAuth token */
export function storeClaudeToken(token: string): void {
  ensureDir();
  writeFileSync(join(TOKEN_DIR, "claude_token"), token, { mode: 0o600 });
}

/** Read the stored Claude OAuth token */
export function readClaudeToken(): string | null {
  const path = join(TOKEN_DIR, "claude_token");
  try {
    if (existsSync(path)) return readFileSync(path, "utf-8").trim();
  } catch { /* unreadable */ }
  return null;
}

/** Remove the Claude OAuth token */
export function revokeClaudeToken(): void {
  const path = join(TOKEN_DIR, "claude_token");
  try {
    if (existsSync(path)) unlinkSync(path);
  } catch { /* already gone */ }
}

/** Store Codex auth credentials */
export function storeCodexAuth(authJson: Record<string, unknown>): void {
  const codexHome = process.env.CODEX_HOME || join(
    process.env.HOME || "/home/sidecar",
    ".codex",
  );
  if (!existsSync(codexHome)) {
    mkdirSync(codexHome, { recursive: true, mode: 0o700 });
  }
  writeFileSync(
    join(codexHome, "auth.json"),
    JSON.stringify(authJson, null, 2),
    { mode: 0o600 },
  );
}

/** Read the stored Codex auth credentials */
export function readCodexAuth(): Record<string, unknown> | null {
  const codexHome = process.env.CODEX_HOME || join(
    process.env.HOME || "/home/sidecar",
    ".codex",
  );
  const path = join(codexHome, "auth.json");
  try {
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, "utf-8"));
    }
  } catch { /* unreadable or invalid */ }
  return null;
}

/** Remove Codex auth credentials */
export function revokeCodexAuth(): void {
  const codexHome = process.env.CODEX_HOME || join(
    process.env.HOME || "/home/sidecar",
    ".codex",
  );
  const path = join(codexHome, "auth.json");
  try {
    if (existsSync(path)) unlinkSync(path);
  } catch { /* already gone */ }
}

/** Store a Copilot GitHub token */
export function storeCopilotToken(token: string): void {
  ensureDir();
  writeFileSync(join(TOKEN_DIR, "copilot_token"), token, { mode: 0o600 });
}

/** Read the stored Copilot GitHub token */
export function readCopilotToken(): string | null {
  const path = join(TOKEN_DIR, "copilot_token");
  try {
    if (existsSync(path)) return readFileSync(path, "utf-8").trim();
  } catch { /* unreadable */ }
  return null;
}

/** Remove the stored Copilot GitHub token */
export function revokeCopilotToken(): void {
  const path = join(TOKEN_DIR, "copilot_token");
  try {
    if (existsSync(path)) unlinkSync(path);
  } catch { /* already gone */ }
}
