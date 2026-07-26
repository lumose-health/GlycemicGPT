import IntegrationsPage from "../integrations/page";
import {
  SettingsEmbeddedContent,
  SettingsPage,
  SettingsPageHeader,
  SettingsSection,
} from "@/components/settings";
import { settingsPageIcons } from "@/components/settings/settings-navigation";

export default function ConnectionsSettingsPage() {
  return (
    <SettingsPage>
      <SettingsPageHeader
        description="Connect the services that provide glucose, pump, and forecast data."
        icon={settingsPageIcons.connections}
        title="Connections"
      />

      <SettingsSection id="data-sources" title="Data Sources & Services">
        <SettingsEmbeddedContent>
          <IntegrationsPage />
        </SettingsEmbeddedContent>
      </SettingsSection>
    </SettingsPage>
  );
}
