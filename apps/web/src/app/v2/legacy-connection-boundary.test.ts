import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const WEB_ROOT = process.cwd();
const V2_ROOT = path.join(WEB_ROOT, "src/app/v2");

const LEGACY_CONNECTION_HASHES = {
  "src/components/integrations/cgm-integrations-section.tsx":
    "574f7b5d1fdcbfa9009556aad455555ea9e2e5d747044495929b4341d656912b",
  "src/components/integrations/cgm-source-picker.tsx":
    "420bbefa3d25b49e4519c86a6415664f940532defad555d51da574f872810635",
  "src/components/integrations/cloud-sync-section.tsx":
    "01e2cc849e49bf89bfbd29b112d580c8cd863a31a48a074f52fae563cba53d0a",
  "src/components/integrations/forecast-source-picker.tsx":
    "80efb388811c0727dae011a604d160223cbb7f24aacd0d4006d7decd223726c8",
  "src/components/integrations/glooko-sync-card.tsx":
    "44e6ee568554bd9715628e953ae317f05d813c9f0691bc500172def3680115cb",
  "src/components/integrations/integration-card.tsx":
    "2a07c611defe61bac3f6ed58f17e3b6857fa92463fa118bb5aabba0a45ae7c73",
  "src/components/integrations/medtronic-connect-card.tsx":
    "15d80f81bcc41c731427ef70ca6ae0fe08f4cabc07353e5099fcd2538fb665c8",
  "src/components/integrations/medtronic-import-card.tsx":
    "4174bcc0b24a082c80d3cd20159f8310f2c1ac6192bfd20f7bbf74b05789b668",
  "src/components/integrations/nightscout-integrations-section.tsx":
    "6f417148c10496268c455caf1de2e24bc2b8feb7f011cc7f6e0ffaa764f73582",
  "src/components/integrations/nightscout-onboarding-wizard.tsx":
    "9f4508cf0df74608b083410f79eecbae361ddf5a861c4a03b090b00579c55b6d",
  "src/components/integrations/tandem-sync-card.tsx":
    "2e9d8afdcec7e73bd63bd52d03c203a02baababffe53512c0f804f4627a29aa3",
} as const;

const LEGACY_CONNECTION_MODULES = new Set(
  Object.keys(LEGACY_CONNECTION_HASHES).map((file) => path.join(WEB_ROOT, file)),
);
const IMPORT_SOURCE = /(?:from\s+|import\s*\()["']([^"']+)["']/g;

function resolveLocalImport(importer: string, importSource: string): string | null {
  const unresolved = importSource.startsWith("@/")
    ? path.join(WEB_ROOT, "src", importSource.slice(2))
    : importSource.startsWith(".")
      ? path.resolve(path.dirname(importer), importSource)
      : null;

  if (!unresolved) return null;

  for (const candidate of [
    unresolved,
    `${unresolved}.ts`,
    `${unresolved}.tsx`,
    path.join(unresolved, "index.ts"),
    path.join(unresolved, "index.tsx"),
  ]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  return null;
}

function collectReachableModules(entry: string): Set<string> {
  const visited = new Set<string>();
  const pending = [entry];

  while (pending.length > 0) {
    const modulePath = pending.pop();
    if (!modulePath || visited.has(modulePath)) continue;

    visited.add(modulePath);
    const source = fs.readFileSync(modulePath, "utf8");
    for (const match of source.matchAll(IMPORT_SOURCE)) {
      const resolved = resolveLocalImport(modulePath, match[1]);
      if (resolved && !visited.has(resolved)) pending.push(resolved);
    }
  }

  return visited;
}

function collectV2SourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) return collectV2SourceFiles(entryPath);
    if (!/\.(?:ts|tsx)$/.test(entry.name) || /\.test\.(?:ts|tsx)$/.test(entry.name)) {
      return [];
    }

    return [entryPath];
  });
}

describe("V2 connection component boundary", () => {
  it.each(Object.entries(LEGACY_CONNECTION_HASHES))(
    "keeps legacy %s byte identical to develop",
    (relativePath, expectedHash) => {
      const source = fs.readFileSync(path.join(WEB_ROOT, relativePath));
      const hash = createHash("sha256").update(source).digest("hex");

      expect(hash).toBe(expectedHash);
    },
  );

  it("does not reach legacy connection components from V2", () => {
    const reachableModules = new Set(
      collectV2SourceFiles(V2_ROOT).flatMap((entry) => [
        ...collectReachableModules(entry),
      ]),
    );
    const reachableLegacyModules = [...reachableModules]
      .filter((modulePath) => LEGACY_CONNECTION_MODULES.has(modulePath))
      .map((modulePath) => path.relative(WEB_ROOT, modulePath))
      .sort();

    expect(reachableLegacyModules).toEqual([]);
  });
});
