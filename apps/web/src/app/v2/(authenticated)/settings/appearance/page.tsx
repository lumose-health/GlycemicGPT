import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { PageHeader } from "@/components/PageHeader";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { settingsPageIcons } from "@/components/settings/settings-navigation";

export default function AppearancePage() {
  return (
    <SettingsPage>
      <PageHeader
        description="Choose how Lumose looks. Your selection applies immediately and is saved in this browser."
        icon={settingsPageIcons.appearance}
        title="Appearance"
      />
      <SettingsSection headingId="appearance-theme-heading" title="Theme">
        <ThemeSwitcher
          idPrefix="settings-appearance-theme"
          variant="settings"
        />
      </SettingsSection>
    </SettingsPage>
  );
}
