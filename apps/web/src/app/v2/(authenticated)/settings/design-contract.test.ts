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
  "safety-limits/page.tsx",
  "telegram/page.tsx",
] as const;

const SETTINGS_ROOT = path.join(
  process.cwd(),
  "src/app/v2/(authenticated)/settings",
);
const WEB_ROOT = process.cwd();

const RAW_PALETTE_UTILITY =
  /\b(?:bg|border|ring|text)-(?:amber|blue|cyan|gray|green|indigo|orange|purple|red|slate|violet|white|yellow)-\d+/;
const UNTOKENTIZED_RADIUS = /\brounded-(?!(?:button|panel|pill)\b)/;
const NON_POPPINS_FONT =
  /\b(?:font_metric_(?:label|caption)|font-(?:mono|sans|serif)|font_jetbrains_mono)\b/;

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

  it("scopes Poppins typography and defines all settings radius values in the foundation", () => {
    const settingsPageSource = fs.readFileSync(
      path.join(
        WEB_ROOT,
        "src/components/settings/SettingsPage/SettingsPage.module.css",
      ),
      "utf8",
    );
    const radiusSource = fs.readFileSync(
      path.join(WEB_ROOT, "src/styles/config/radius.css"),
      "utf8",
    );

    expect(settingsPageSource).toContain("var(--font-poppins)");
    expect(radiusSource).toContain("--radius-button");
    expect(radiusSource).toContain("--radius-panel");
    expect(radiusSource).toContain("--radius-pill");
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
    expect(legacySource).not.toContain("cgm-connections-section");
    expect(legacySource).not.toContain("cloud-connections-section");
    expect(legacySource).not.toContain('presentation="lumose"');

    expect(lumoseSource).toContain(
      "@/components/integrations/cgm-connections-section",
    );
    expect(lumoseSource).toContain(
      "@/components/integrations/cloud-connections-section",
    );
    expect(lumoseSource).not.toContain("cgm-integrations-section");
    expect(lumoseSource).not.toContain("cloud-sync-section");
    expect(lumoseSource).toContain('presentation="lumose"');
  });
});
