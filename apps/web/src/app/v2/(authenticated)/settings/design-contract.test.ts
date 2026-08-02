import fs from "node:fs";
import path from "node:path";

const MIGRATED_MODULES = [
  "ai-provider/page.tsx",
  "alerts/page.tsx",
  "brief-delivery/page.tsx",
  "caregivers/CaregiversSettings.tsx",
  "caregivers/[linkId]/permissions/CaregiverPermissionsSettings.tsx",
  "communications/CommunicationsSettings.tsx",
  "data/page.tsx",
  "emergency-contacts/page.tsx",
  "glucose-range/page.tsx",
  "insulin/page.tsx",
  "integrations/page.tsx",
  "research-sources/page.tsx",
  "safety-limits/page.tsx",
  "telegram/page.tsx",
] as const;

const COMPOSED_FORM_MODULES = [
  "alerts/page.tsx",
  "brief-delivery/page.tsx",
  "communications/CommunicationsSettings.tsx",
  "glucose-range/page.tsx",
  "insulin/page.tsx",
  "research-sources/page.tsx",
  "safety-limits/page.tsx",
  "telegram/page.tsx",
] as const;

const SETTINGS_ROOT = path.join(
  process.cwd(),
  "src/app/v2/(authenticated)/settings",
);
const WEB_ROOT = process.cwd();
const SOURCE_ROOT = path.join(WEB_ROOT, "src");

const SHARED_CONTROL_ROOTS = [
  "base/",
  "components/Checkbox/",
  "components/PasswordTextInput/",
  "components/SelectField/",
  "components/Switch/",
  "components/TextAreaField/",
  "components/TextInput/",
] as const;

const RAW_PALETTE_UTILITY =
  /\b(?:bg|border|ring|text)-(?:amber|blue|cyan|gray|green|indigo|orange|purple|red|slate|violet|white|yellow)-\d+/;
const UNTOKENTIZED_RADIUS = /\brounded-(?!(?:button|panel|pill)\b)/;
const NON_POPPINS_FONT =
  /\b(?:font_metric_(?:label|caption)|font-(?:mono|sans|serif)|font_jetbrains_mono)\b/;

function findSettingsEntryModules(directory = SETTINGS_ROOT): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) return findSettingsEntryModules(entryPath);
    if (!entry.name.endsWith(".tsx") || entry.name.endsWith(".test.tsx")) {
      return [];
    }

    return [entryPath];
  });
}

function resolveSourceImport(
  fromFile: string,
  importPath: string,
): string | null {
  const unresolved = importPath.startsWith("@/")
    ? path.join(SOURCE_ROOT, importPath.slice(2))
    : importPath.startsWith(".")
      ? path.resolve(path.dirname(fromFile), importPath)
      : null;

  if (!unresolved) return null;

  const candidates = [
    unresolved,
    `${unresolved}.ts`,
    `${unresolved}.tsx`,
    path.join(unresolved, "index.ts"),
    path.join(unresolved, "index.tsx"),
  ];

  return (
    candidates.find(
      (candidate) =>
        fs.existsSync(candidate) && fs.statSync(candidate).isFile(),
    ) ?? null
  );
}

function collectSettingsComponentGraph(): string[] {
  const pending = findSettingsEntryModules();
  const visited = new Set<string>();
  const allowedRoots = [
    path.join(SOURCE_ROOT, "app/v2"),
    path.join(SOURCE_ROOT, "base"),
    path.join(SOURCE_ROOT, "components"),
    path.join(SOURCE_ROOT, "compositions"),
  ];
  const importPattern =
    /(?:import|export)\s+(?:type\s+)?(?:[^"'`;]*?\sfrom\s+)?["']([^"']+)["']/g;

  while (pending.length > 0) {
    const filePath = pending.pop();
    if (!filePath || visited.has(filePath)) continue;
    visited.add(filePath);

    const source = fs.readFileSync(filePath, "utf8");
    for (const match of source.matchAll(importPattern)) {
      const resolved = resolveSourceImport(filePath, match[1]);
      if (
        resolved &&
        allowedRoots.some((root) =>
          resolved.startsWith(`${root}${path.sep}`),
        ) &&
        !resolved.includes(".test.") &&
        !resolved.includes(".spec.")
      ) {
        pending.push(resolved);
      }
    }
  }

  return [...visited].sort();
}

function relativeSourcePath(filePath: string): string {
  return path.relative(SOURCE_ROOT, filePath);
}

function rawNonRadioControls(source: string): string[] {
  const controls = source.match(/<(?:input|select|textarea)\b[\s\S]*?>/g) ?? [];
  return controls.filter(
    (control) =>
      !/^<input\b/.test(control) || !/\btype=["']radio["']/.test(control),
  );
}

function hasUnsupportedSurfaceTextPairing(source: string): boolean {
  const stringLiterals = source.match(/["'`][^"'`\n]+["'`]/g) ?? [];

  return stringLiterals.some((literal) => {
    const classes = literal.slice(1, -1).split(/\s+/);
    const hasSecondarySurface = classes.some((className) =>
      /^bg-surface-(?:secondary|tertiary)(?:\/\d+)?$/.test(className),
    );
    return hasSecondarySurface && classes.includes("text-foreground-secondary");
  });
}

describe("redesigned settings source contract", () => {
  it.each(MIGRATED_MODULES)(
    "%s uses the Lumose UI foundation without legacy styling dependencies",
    (modulePath) => {
      const source = fs.readFileSync(
        path.join(SETTINGS_ROOT, modulePath),
        "utf8",
      );

      expect(source).not.toContain("lucide-react");
      expect(source).not.toContain('from "clsx"');
      expect(source).not.toContain("dark:");
      expect(source).not.toContain("@/components/ui/");
      expect(source).not.toContain("@/app/dashboard/settings");
      expect(source).not.toMatch(RAW_PALETTE_UTILITY);
      expect(source).not.toMatch(UNTOKENTIZED_RADIUS);
      expect(source).not.toMatch(NON_POPPINS_FONT);
    },
  );

  it.each(COMPOSED_FORM_MODULES)(
    "%s composes shared fields instead of rendering raw inputs",
    (modulePath) => {
      const source = fs.readFileSync(
        path.join(SETTINGS_ROOT, modulePath),
        "utf8",
      );

      expect(source).not.toMatch(/<input\b/);
    },
  );

  it("checks every imported V2 settings component for foundation dependencies", () => {
    const violations = collectSettingsComponentGraph().flatMap((filePath) => {
      const source = fs.readFileSync(filePath, "utf8");
      const modulePath = relativeSourcePath(filePath);
      const moduleViolations: string[] = [];

      if (source.includes("lucide-react"))
        moduleViolations.push("lucide-react");
      if (/from ["'](?:clsx|classnames|tailwind-merge)["']/.test(source)) {
        moduleViolations.push("direct class composition dependency");
      }
      if (/className=\{`/.test(source)) {
        moduleViolations.push("template string class composition");
      }
      if (source.includes("dark:")) moduleViolations.push("dark variant");
      if (RAW_PALETTE_UTILITY.test(source)) {
        moduleViolations.push("raw palette utility");
      }
      if (hasUnsupportedSurfaceTextPairing(source)) {
        moduleViolations.push("unsupported surface and text contrast pairing");
      }

      return moduleViolations.map((violation) => `${modulePath}: ${violation}`);
    });

    expect(violations).toEqual([]);
  });

  it("checks imported V2 settings product components for shared form controls", () => {
    const violations = collectSettingsComponentGraph().flatMap((filePath) => {
      const modulePath = relativeSourcePath(filePath);
      const isSettingsFeatureModule =
        modulePath.startsWith("app/v2/(authenticated)/settings/") ||
        modulePath.startsWith("components/integrations/");
      if (!isSettingsFeatureModule) return [];
      if (SHARED_CONTROL_ROOTS.some((root) => modulePath.startsWith(root))) {
        return [];
      }

      return rawNonRadioControls(fs.readFileSync(filePath, "utf8")).map(
        (control) =>
          `${modulePath}: ${control.split(/\s+/).slice(0, 3).join(" ")}`,
      );
    });

    expect(violations).toEqual([]);
  });

  it("scopes Poppins typography without descendant overrides and defines all settings radius values in the foundation", () => {
    const settingsPageSource = fs.readFileSync(
      path.join(
        WEB_ROOT,
        "src/components/settings/SettingsPage/SettingsPage.tsx",
      ),
      "utf8",
    );
    const radiusSource = fs.readFileSync(
      path.join(WEB_ROOT, "src/styles/config/radius.css"),
      "utf8",
    );

    expect(settingsPageSource).toContain("font_poppins");
    expect(settingsPageSource).not.toContain("!important");
    expect(radiusSource).toContain("--radius-button");
    expect(radiusSource).toContain("--radius-panel");
    expect(radiusSource).toContain("--radius-pill");
  });

  it("uses the Lumose loading mark for shared content loading", () => {
    const loadingStateSource = fs.readFileSync(
      path.join(WEB_ROOT, "src/components/LoadingState/LoadingState.tsx"),
      "utf8",
    );

    expect(loadingStateSource).toContain("LumoseLoadingLogo");
    expect(loadingStateSource).not.toContain("animate-spin");
  });

  it("keeps legacy and Lumose connection sections on separate imports", () => {
    const legacySource = fs.readFileSync(
      path.join(WEB_ROOT, "src/app/dashboard/settings/integrations/page.tsx"),
      "utf8",
    );
    const lumoseSource = fs.readFileSync(
      path.join(SETTINGS_ROOT, "integrations/IntegrationsSettings.tsx"),
      "utf8",
    );

    expect(legacySource).toContain(
      "@/components/integrations/cgm-integrations-section",
    );
    expect(legacySource).toContain(
      "@/components/integrations/cloud-sync-section",
    );
    expect(legacySource).not.toContain("CgmConnectionsSection");
    expect(legacySource).not.toContain("CloudConnectionsSection");
    expect(legacySource).toContain(
      "@/components/integrations/nightscout-integrations-section",
    );

    expect(lumoseSource).toContain(
      "@/components/integrations/CgmConnectionsSection",
    );
    expect(lumoseSource).toContain(
      "@/components/integrations/CloudConnectionsSection",
    );
    expect(lumoseSource).not.toContain("cgm-integrations-section");
    expect(lumoseSource).not.toContain("cloud-sync-section");
    expect(lumoseSource).toContain(
      "@/components/integrations/NightscoutConnectionSettings",
    );
    expect(lumoseSource).not.toContain(
      "@/components/integrations/nightscout-integrations-section",
    );
  });

  it("does not adapt legacy connection markup through the embedded CSS shim", () => {
    const connectionsSource = fs.readFileSync(
      path.join(SETTINGS_ROOT, "connections/page.tsx"),
      "utf8",
    );

    expect(connectionsSource).not.toContain("SettingsEmbeddedContent");
  });
});
