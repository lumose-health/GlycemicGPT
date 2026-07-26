import DataRetentionPage from "../data/page";
import {
  SettingsEmbeddedContent,
  SettingsPage,
  SettingsPageHeader,
  SettingsSection,
} from "@/components/settings";
import { settingsPageIcons } from "@/components/settings/settings-navigation";

export default function DataPrivacySettingsPage() {
  return (
    <SettingsPage>
      <SettingsPageHeader
        description="Review storage, retention, exports, reports, and data deletion."
        icon={settingsPageIcons.dataPrivacy}
        title="Data & Privacy"
      />

      <SettingsSection id="data-management" title="Data Management">
        <SettingsEmbeddedContent>
          <DataRetentionPage />
        </SettingsEmbeddedContent>
      </SettingsSection>
    </SettingsPage>
  );
}
