import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import {
  SettingsPage,
  SettingsPageHeader,
  SettingsSection,
} from "@/components/settings";
import { settingsPageIcons } from "@/components/settings-new/settings-navigation";

export default function AppearancePage() {
  return (
    <SettingsPage>
      <SettingsPageHeader
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
