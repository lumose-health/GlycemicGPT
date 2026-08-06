import AIProviderPage from "../ai-provider/page";
import { ProfileSettings } from "../profile/ProfileSettings";
import ResearchSourcesPage from "../research-sources/page";
import { SettingsEmbeddedContent } from "@/components/settings/SettingsEmbeddedContent";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { PageHeader } from "@/components/PageHeader";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { settingsPageIcons } from "@/components/settings/settings-navigation";

export default function AISettingsPage() {
  return (
    <SettingsPage>
      <PageHeader
        description="Configure AI features, processing, and trusted research sources."
        icon={settingsPageIcons.ai}
        title="AI & Insight"
      />

      <ProfileSettings embedded preferenceLabelAs="h2" sections={["meal"]} />

      <SettingsSection
        description="Choose where Lumose sends data for AI analysis."
        id="ai-provider"
        separated
        title="AI Provider"
      >
        <SettingsEmbeddedContent>
          <AIProviderPage />
        </SettingsEmbeddedContent>
      </SettingsSection>

      <SettingsSection
        description="Manage clinical documentation used to ground AI insights."
        id="research-sources"
        separated
        title="Research Sources"
      >
        <SettingsEmbeddedContent>
          <ResearchSourcesPage />
        </SettingsEmbeddedContent>
      </SettingsSection>
    </SettingsPage>
  );
}
