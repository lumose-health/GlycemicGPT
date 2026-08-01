import DataRetentionPage from "../data/page";
import { SettingsEmbeddedContent } from "@/components/settings/SettingsEmbeddedContent";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { PageHeader } from "@/components/PageHeader";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { settingsPageIcons } from "@/components/settings/settings-navigation";

export default function DataPrivacySettingsPage() {
  return (
    <SettingsPage>
      <PageHeader
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
