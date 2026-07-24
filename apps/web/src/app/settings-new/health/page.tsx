import { ProfileSettings } from "../profile/ProfileSettings";
import GlucoseRangePage from "../glucose-range/page";
import InsulinConfigPage from "../insulin/page";
import SafetyLimitsPage from "../safety-limits/page";
import {
  SettingsEmbeddedContent,
  SettingsPage,
  SettingsPageHeader,
  SettingsSection,
} from "@/components/settings";
import { settingsPageIcons } from "@/components/settings-new/settings-navigation";

export default function HealthSettingsPage() {
  return (
    <SettingsPage>
      <SettingsPageHeader
        description="Configure how Lumose interprets glucose and insulin data."
        icon={settingsPageIcons.health}
        title="Glucose & Insulin"
      />

      <SettingsSection
        description="Choose how glucose values are displayed throughout Lumose."
        id="display"
        title="Display"
      >
        <ProfileSettings embedded sections={["glucose"]} />
      </SettingsSection>

      <SettingsSection
        description="Set the ranges used by charts, analysis, and time in range calculations."
        id="glucose-ranges"
        separated
        title="Glucose Ranges"
      >
        <SettingsEmbeddedContent>
          <GlucoseRangePage />
        </SettingsEmbeddedContent>
      </SettingsSection>

      <SettingsSection
        description="Configure insulin action for insulin on board calculations."
        id="insulin-action"
        separated
        title="Insulin Action"
      >
        <SettingsEmbeddedContent>
          <InsulinConfigPage />
        </SettingsEmbeddedContent>
      </SettingsSection>

      <SettingsSection
        description="Review the platform constraints applied to glucose data and insulin delivery."
        id="safety-limits"
        separated
        title="Safety Limits"
      >
        <SettingsEmbeddedContent>
          <SafetyLimitsPage />
        </SettingsEmbeddedContent>
      </SettingsSection>
    </SettingsPage>
  );
}
