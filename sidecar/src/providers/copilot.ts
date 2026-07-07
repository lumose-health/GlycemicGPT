/**
 * GitHub Copilot CLI SDK provider.
 *
 * Unlike claude.ts / codex.ts (which spawn their CLIs as bare subprocesses and
 * parse stdout), this drives the official `@github/copilot-sdk`, which manages
 * the `copilot` runtime over JSON-RPC and bundles the CLI binary as a normal
 * npm dependency (`@github/copilot`) — no separate global install needed.
 *
 * Authentication: the SDK supports two paths, and this provider accepts both:
 *   1. An explicit GitHub token (COPILOT_GITHUB_TOKEN / GH_TOKEN / GITHUB_TOKEN
 *      env var, or a token pasted via the sidecar's token-paste flow and
 *      persisted at TOKEN_DIR/copilot_token) — the deployed-container path,
 *      mirroring the Claude/Codex providers.
 *   2. Ambient "logged-in user" credentials from an interactive `copilot`
 *      login (the SDK's `useLoggedInUser` default) — useful for local
 *      development where the host's own Copilot CLI session is reused.
 *
 * Every request creates and tears down its own session; this provider does not
 * keep a long-lived client running between calls.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  CopilotClient,
  type PermissionRequest,
  type PermissionRequestResult,
} from "@github/copilot-sdk";
import type {
  AIProvider,
  ChatMessage,
  ProviderAuthState,
  ProviderResult,
} from "./types.js";

const TOKEN_DIR = process.env.TOKEN_DIR || "/home/sidecar/.config/sidecar";
const COPILOT_TOKEN_FILE = join(TOKEN_DIR, "copilot_token");

/** Session timeout (2 minutes), matching the Claude/Codex subprocess providers. */
const SESSION_TIMEOUT_MS = 120_000;
/** Maximum combined prompt size (chars) — same ceiling as the other providers. */
const MAX_PROMPT_LENGTH = 100_000;
/**
 * Default model when the caller doesn't specify one. Deliberately a Claude
 * model rather than a bare "gpt-5" id: Copilot's model catalog is
 * account/policy-dependent and evolves over time (verified live against
 * `client.listModels()` during development — plain "gpt-5" was not present,
 * only versioned ids like "gpt-5.5"), so this picks a widely available,
 * stable-sounding default rather than guessing at a moving target.
 */
const DEFAULT_MODEL = "claude-sonnet-4.5";

/** Read an explicitly configured GitHub token, preferring env vars over the stored file. */
function getExplicitToken(): string | null {
  const envToken =
    process.env.COPILOT_GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (envToken) return envToken;

  try {
    if (existsSync(COPILOT_TOKEN_FILE)) {
      return readFileSync(COPILOT_TOKEN_FILE, "utf-8").trim();
    }
  } catch {
    // File unreadable — treat as unconfigured
  }
  return null;
}

/**
 * Best-effort signal that an interactive `copilot` CLI login exists on this
 * host, for the ambient "logged-in user" auth path. This can't cheaply verify
 * the credentials are still valid without spawning a session — the same
 * limitation the Claude/Codex providers accept for their own stored tokens —
 * so actual validity is resolved lazily by the SDK on first use.
 */
function hasAmbientLogin(): boolean {
  const home = process.env.COPILOT_HOME || join(homedir(), ".copilot");
  return existsSync(join(home, "config.json"));
}

/** Resolve a caller-supplied model name to a Copilot model id, stripping the `copilot-` selector prefix. */
export function resolveModel(model?: string): string {
  if (!model) return DEFAULT_MODEL;
  const trimmed = model.trim();
  const lower = trimmed.toLowerCase();
  if (lower === "copilot") return DEFAULT_MODEL;
  const withoutPrefix = lower.startsWith("copilot-") ? trimmed.slice("copilot-".length) : trimmed;
  return withoutPrefix || DEFAULT_MODEL;
}

/**
 * Split chat messages into a system prompt (installed via `systemMessage:
 * { mode: "replace" }`) and the user-facing conversation turns, mirroring
 * claude.ts's splitSystemPrompt so the app's persona replaces the CLI's
 * default agent identity rather than leaking in as disownable quoted text.
 */
function splitSystemPrompt(messages: ChatMessage[]): {
  systemPrompt: string;
  conversation: string;
} {
  const systemParts: string[] = [];
  const turnParts: string[] = [];
  for (const m of messages) {
    if (m.role === "system") {
      systemParts.push(m.content);
    } else if (m.role === "assistant") {
      turnParts.push(`[Assistant]: ${m.content}`);
    } else {
      turnParts.push(m.content);
    }
  }
  const systemPrompt = systemParts.join("\n\n").trim();
  const conversation = turnParts.join("\n\n");
  const total = systemPrompt.length + conversation.length;
  if (total > MAX_PROMPT_LENGTH) {
    throw new Error(`Prompt too long (${total} chars, max ${MAX_PROMPT_LENGTH})`);
  }
  return { systemPrompt, conversation };
}

/**
 * Deny every tool-call request. The sidecar only needs plain chat
 * completions from Copilot, never file writes, shell commands, URL
 * fetches, or other agentic side effects — paired with `availableTools: []`
 * on the session, which keeps tools from being offered to the model at all.
 */
function denyAllTools(request: PermissionRequest): PermissionRequestResult {
  return {
    kind: "reject",
    feedback: `Tool execution ("${request.kind}") is disabled for this integration.`,
  };
}

export class CopilotProvider implements AIProvider {
  async checkAuth(): Promise<ProviderAuthState> {
    const token = getExplicitToken();
    const ambient = !token && hasAmbientLogin();
    return {
      authenticated: !!token || ambient,
      provider: "copilot",
      message: token
        ? "Copilot GitHub token configured"
        : ambient
          ? "Using ambient GitHub Copilot CLI login"
          : "No Copilot authentication found",
    };
  }

  async complete(messages: ChatMessage[], model?: string): Promise<ProviderResult> {
    return this.run(messages, model);
  }

  async stream(
    messages: ChatMessage[],
    model?: string,
    onChunk?: (text: string) => void,
  ): Promise<ProviderResult> {
    return this.run(messages, model, onChunk);
  }

  private async run(
    messages: ChatMessage[],
    model: string | undefined,
    onChunk?: (text: string) => void,
  ): Promise<ProviderResult> {
    const token = getExplicitToken();
    const cliModel = resolveModel(model);
    const { systemPrompt, conversation } = splitSystemPrompt(messages);

    const client = new CopilotClient({
      ...(token ? { gitHubToken: token } : {}),
    });

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await client.start();
      const session = await client.createSession({
        clientName: "glycemicgpt-ai-sidecar",
        model: cliModel,
        streaming: !!onChunk,
        availableTools: [],
        onPermissionRequest: denyAllTools,
        ...(systemPrompt
          ? { systemMessage: { mode: "replace" as const, content: systemPrompt } }
          : {}),
      });

      let content = "";
      try {
        await new Promise<void>((resolve, reject) => {
          timer = setTimeout(() => {
            reject(new Error("AI provider request timed out"));
          }, SESSION_TIMEOUT_MS);

          session.on("assistant.message_delta", (event) => {
            onChunk?.(event.data.deltaContent);
          });
          session.on("assistant.message", (event) => {
            content = event.data.content;
          });
          session.on("session.error", (event) => {
            reject(new Error(event.data.message || "Copilot session error"));
          });
          session.on("session.idle", () => resolve());

          // Listeners are registered above before sending so no early event is
          // missed; send() only queues the message and resolves once it's
          // accepted, so a rejection here means the message was never sent.
          session.send({ prompt: conversation }).catch(reject);
        });
      } finally {
        clearTimeout(timer);
        await session.disconnect().catch(() => {});
      }

      if (!content) {
        throw new Error("AI provider returned no usable output");
      }
      return { content, model: `copilot-${cliModel}` };
    } finally {
      await client.stop().catch(() => {});
    }
  }
}
