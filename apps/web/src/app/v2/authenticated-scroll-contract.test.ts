import fs from "node:fs";
import path from "node:path";

const AUTHENTICATED_ROOT = path.join(
  process.cwd(),
  "src/app/v2/(authenticated)",
);
const AUTHENTICATED_SHELL_COMPONENTS = [
  path.join(
    process.cwd(),
    "src/components/AuthDisclaimerGate/AuthDisclaimerGate.tsx",
  ),
  path.join(
    process.cwd(),
    "src/components/integrations/NightscoutOnboarding/NightscoutOnboarding.tsx",
  ),
];

function collectPageFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) return collectPageFiles(entryPath);
    return entry.name === "page.tsx" ? [entryPath] : [];
  });
}

describe("authenticated V2 scroll contract", () => {
  it.each([
    ...collectPageFiles(AUTHENTICATED_ROOT),
    ...AUTHENTICATED_SHELL_COMPONENTS,
  ])(
    "%s leaves viewport height and document overflow to AppShell",
    (pagePath) => {
      const source = fs.readFileSync(pagePath, "utf8");

      expect(source).not.toMatch(/\b(?:h-screen|min-h-screen)\b/);
    },
  );
});
