import AIProviderPage from "../ai-provider/page";
import { ProfileSettings } from "../profile/ProfileSettings";
import ResearchSourcesPage from "../research-sources/page";
import {
  SettingsEmbeddedContent,
  SettingsPage,
  SettingsPageHeader,
  SettingsSection,
} from "@/components/settings";
import { settingsPageIcons } from "@/components/settings-new/settings-navigation";

export default function AISettingsPage() {
  return (
    <SettingsPage>
      <SettingsPageHeader
        description="Configure AI features, processing, and trusted research sources."
        icon={settingsPageIcons.ai}
        title="AI & Insights"
      />

      <SettingsSection
        description="Control AI assisted meal analysis and carbohydrate estimates."
        id="meal-intelligence"
        title="Meal Intelligence"
      >
        <ProfileSettings embedded sections={["meal"]} />
      </SettingsSection>

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
