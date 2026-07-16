/**
 * Tests for the GitHub Copilot SDK provider wrapper.
 *
 * These test the provider logic (auth detection, model resolution) without
 * spawning the actual Copilot runtime — the same scope providers.test.ts
 * uses for the Claude/Codex CLI wrappers.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("CopilotProvider", () => {
  let tokenDir: string;
  let homeDir: string;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    tokenDir = mkdtempSync(join(tmpdir(), "copilot-token-test-"));
    homeDir = mkdtempSync(join(tmpdir(), "copilot-home-test-"));
    process.env.TOKEN_DIR = tokenDir;
    process.env.COPILOT_HOME = join(homeDir, ".copilot-missing");
    delete process.env.COPILOT_GITHUB_TOKEN;
    delete process.env.GH_TOKEN;
    delete process.env.GITHUB_TOKEN;
    vi.resetModules();
  });

  afterEach(() => {
    rmSync(tokenDir, { recursive: true, force: true });
    rmSync(homeDir, { recursive: true, force: true });
    process.env = { ...originalEnv };
  });

  it("reports unauthenticated with no token and no ambient login", async () => {
    const { CopilotProvider } = await import("../src/providers/copilot.js");
    const state = await new CopilotProvider().checkAuth();
    expect(state.authenticated).toBe(false);
    expect(state.provider).toBe("copilot");
  });

  it("reports authenticated when COPILOT_GITHUB_TOKEN is set", async () => {
    process.env.COPILOT_GITHUB_TOKEN = "test-copilot-token-dummy";
    const { CopilotProvider } = await import("../src/providers/copilot.js");
    const state = await new CopilotProvider().checkAuth();
    expect(state.authenticated).toBe(true);
  });

  it("reports authenticated when GH_TOKEN is set", async () => {
    process.env.GH_TOKEN = "test-gh-token-dummy";
    const { CopilotProvider } = await import("../src/providers/copilot.js");
    const state = await new CopilotProvider().checkAuth();
    expect(state.authenticated).toBe(true);
  });

  it("reports authenticated when a token file exists", async () => {
    writeFileSync(join(tokenDir, "copilot_token"), "test-copilot-file-token-dummy");
    const { CopilotProvider } = await import("../src/providers/copilot.js");
    const state = await new CopilotProvider().checkAuth();
    expect(state.authenticated).toBe(true);
  });

  it("reports authenticated via ambient CLI login when no explicit token is configured", async () => {
    const copilotHome = join(homeDir, ".copilot");
    mkdirSync(copilotHome, { recursive: true });
    writeFileSync(join(copilotHome, "config.json"), "{}");
    process.env.COPILOT_HOME = copilotHome;
    const { CopilotProvider } = await import("../src/providers/copilot.js");
    const state = await new CopilotProvider().checkAuth();
    expect(state.authenticated).toBe(true);
    expect(state.message).toMatch(/ambient/i);
  });

  it("prefers an explicit token's message over the ambient login message", async () => {
    const copilotHome = join(homeDir, ".copilot");
    mkdirSync(copilotHome, { recursive: true });
    writeFileSync(join(copilotHome, "config.json"), "{}");
    process.env.COPILOT_HOME = copilotHome;
    process.env.COPILOT_GITHUB_TOKEN = "test-copilot-token-dummy";
    const { CopilotProvider } = await import("../src/providers/copilot.js");
    const state = await new CopilotProvider().checkAuth();
    expect(state.authenticated).toBe(true);
    expect(state.message).toMatch(/token configured/i);
  });

  it("resolveModel strips the copilot- selector prefix", async () => {
    const { resolveModel } = await import("../src/providers/copilot.js");
    expect(resolveModel("copilot-gpt-5.5")).toBe("gpt-5.5");
    expect(resolveModel("copilot-claude-sonnet-4.5")).toBe("claude-sonnet-4.5");
  });

  it("resolveModel treats a bare 'copilot' selector as the default model", async () => {
    const { resolveModel } = await import("../src/providers/copilot.js");
    expect(resolveModel("copilot")).toBe(resolveModel());
  });

  it("resolveModel passes through a plain model id unchanged", async () => {
    const { resolveModel } = await import("../src/providers/copilot.js");
    expect(resolveModel("gemini-3.1-pro-preview")).toBe("gemini-3.1-pro-preview");
  });

  it("resolveModel defaults when no model is given", async () => {
    const { resolveModel } = await import("../src/providers/copilot.js");
    expect(resolveModel()).toBeTruthy();
    expect(resolveModel("")).toBe(resolveModel());
  });
});
