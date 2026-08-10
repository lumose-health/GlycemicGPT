import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import path from "node:path";

const UI_VERSION_HEADER = "x-glycemicgpt-ui-version";
const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standaloneServer = path.join(webRoot, ".next", "standalone", "server.js");
const serverOutput = [];

async function getAvailablePort() {
  const portReservation = createServer();
  await new Promise((resolve, reject) => {
    portReservation.once("error", reject);
    portReservation.listen(0, "localhost", resolve);
  });

  const address = portReservation.address();
  if (!address || typeof address === "string") {
    portReservation.close();
    throw new Error("Could not reserve a port for the production cache test.");
  }

  await new Promise((resolve, reject) => {
    portReservation.close((error) => (error ? reject(error) : resolve()));
  });
  return address.port;
}

const port = await getAvailablePort();

const server = spawn(process.execPath, [standaloneServer], {
  cwd: webRoot,
  env: { ...process.env, HOSTNAME: "localhost", PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
});

for (const stream of [server.stdout, server.stderr]) {
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => serverOutput.push(chunk));
}

function fail(message) {
  throw new Error(`${message}\n\nNext output:\n${serverOutput.join("")}`);
}

async function waitUntilReady() {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      fail(`Next exited with code ${server.exitCode} before becoming ready.`);
    }

    try {
      await fetch(`http://localhost:${port}/`, { redirect: "manual" });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  fail(`Next did not become ready on its reserved port.`);
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
  const response = await fetch(`http://localhost:${port}${route}`, {
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
