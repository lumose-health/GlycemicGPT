import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const UI_VERSION_HEADER = "x-glycemicgpt-ui-version";
const REQUEST_TIMEOUT_MS = 5_000;
const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standaloneServer = path.join(webRoot, ".next", "standalone", "server.js");
const standaloneLauncher = path.join(
  webRoot,
  "scripts",
  "launch-standalone-on-ephemeral-port.mjs",
);
const serverOutput = [];

const server = spawn(process.execPath, [standaloneLauncher, standaloneServer], {
  cwd: webRoot,
  env: { ...process.env, HOSTNAME: "localhost", PORT: "" },
  stdio: ["ignore", "pipe", "pipe", "ipc"],
});

for (const stream of [server.stdout, server.stderr]) {
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => serverOutput.push(chunk));
}

function fail(message) {
  throw new Error(`${message}\n\nNext output:\n${serverOutput.join("")}`);
}

async function waitForBoundPort() {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Next did not bind to an ephemeral port within 30 seconds."));
    }, 30_000);

    const cleanup = () => {
      clearTimeout(timeout);
      server.off("error", onError);
      server.off("exit", onExit);
      server.off("message", onMessage);
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const onExit = (code) => {
      cleanup();
      reject(
        new Error(`Next exited with code ${String(code)} before binding.`),
      );
    };
    const onMessage = (message) => {
      if (!message || typeof message !== "object" || !("port" in message)) {
        return;
      }

      const boundPort = message.port;
      if (!Number.isInteger(boundPort) || boundPort <= 0) {
        return;
      }

      cleanup();
      resolve(boundPort);
    };

    server.once("error", onError);
    server.once("exit", onExit);
    server.on("message", onMessage);
  });
}

let port;

function fetchLocal(route, init = {}) {
  return fetch(`http://localhost:${port}${route}`, {
    ...init,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

async function waitUntilReady() {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      fail(`Next exited with code ${server.exitCode} before becoming ready.`);
    }

    try {
      await fetchLocal("/", { redirect: "manual" });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  fail(`Next did not become ready on its bound port.`);
}

function assertHeaderContains(response, header, expected, route, variant) {
  const value = response.headers.get(header);
  if (!value?.toLowerCase().split(/\s*,\s*/).includes(expected.toLowerCase())) {
    fail(
      `${variant} ${route} returned ${header}: ${String(value)}; expected ${expected}.`,
    );
  }
}

function assertStaticRewriteCache(response, route, variant) {
  const cacheControl = response.headers.get("cache-control");
  const nextCache = response.headers.get("x-nextjs-cache");

  if (!cacheControl || !/\bs-maxage=\d+\b/i.test(cacheControl)) {
    fail(
      `${variant} ${route} returned Cache-Control: ${String(cacheControl)}; expected a shared-cache lifetime from the prerendered target.`,
    );
  }

  if (nextCache !== "HIT") {
    fail(
      `${variant} ${route} returned x-nextjs-cache: ${String(nextCache)}; expected HIT from the prerendered target.`,
    );
  }
}

async function fetchVariant(route, legacy) {
  const response = await fetchLocal(route, {
    headers: legacy ? { [UI_VERSION_HEADER]: "legacy" } : undefined,
    redirect: "manual",
  });
  const variant = legacy ? "legacy" : "default";

  if (response.status !== 200) {
    fail(`${variant} ${route} returned ${response.status}; expected 200.`);
  }

  assertHeaderContains(response, "vary", UI_VERSION_HEADER, route, variant);
  assertStaticRewriteCache(response, route, variant);

  return response.text();
}

try {
  port = await waitForBoundPort();
  await waitUntilReady();

  for (const route of ["/", "/login", "/register"]) {
    const [defaultBody, legacyBody] = await Promise.all([
      fetchVariant(route, false),
      fetchVariant(route, true),
    ]);

    if (defaultBody === legacyBody) {
      fail(`${route} returned identical bodies for the default and legacy UI.`);
    }
  }

  console.log(
    "Verified production UI variants use separate shared-cache entries while retaining Next prerender cache hits.",
  );
} finally {
  server.kill("SIGTERM");
}
