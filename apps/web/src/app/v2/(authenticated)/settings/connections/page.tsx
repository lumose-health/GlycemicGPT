import IntegrationsSettings from "../integrations/IntegrationsSettings";
import { SettingsEmbeddedContent } from "@/components/settings/SettingsEmbeddedContent";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { PageHeader } from "@/components/PageHeader";
import { parseConnectionTarget } from "@/components/integrations/connection-navigation";
import {
  SettingsTabs,
  type SettingsTabItem,
} from "@/components/settings/SettingsTabs";
import { settingsPageIcons } from "@/components/settings/settings-navigation";

const connectionTabs = [
  {
    href: "/settings/connections?tab=cgm",
    icon: "cgm",
    label: "CGM",
    value: "cgm",
  },
  {
    href: "/settings/connections?tab=insulin-pumps",
    icon: "insulin-pump",
    label: "Insulin delivery",
    value: "insulin-pumps",
  },
  {
    href: "/settings/connections?tab=third-party",
    icon: "link",
    label: "Third party integrations",
    value: "third-party",
  },
] satisfies SettingsTabItem<ConnectionsTab>[];

type ConnectionsTab = "cgm" | "insulin-pumps" | "third-party";

type ConnectionsSettingsPageProps = {
  searchParams?: Promise<{
    connection?: string | string[];
    tab?: string | string[];
  }>;
};

function parseConnectionsTab(
  value: string | string[] | undefined,
): ConnectionsTab {
  const tab = Array.isArray(value) ? value[0] : value;
  if (tab === "insulin-pumps" || tab === "third-party") return tab;
  return "cgm";
}

export default async function ConnectionsSettingsPage({
  searchParams,
}: ConnectionsSettingsPageProps) {
  const params = searchParams ? await searchParams : undefined;
  const activeTab = parseConnectionsTab(params?.tab);
  const openConnection = parseConnectionTarget(params?.connection);

  return (
    <SettingsPage>
      <PageHeader
        description="Connect the services that provide glucose, pump, and forecast data."
        icon={settingsPageIcons.connections}
        title="Connections"
      />

      <div className="space-y-8">
        <SettingsTabs
          aria-label="Connection types"
          idPrefix="connections"
          items={connectionTabs}
          value={activeTab}
        />

        <SettingsEmbeddedContent>
          <IntegrationsSettings
            activeTab={activeTab}
            openConnection={openConnection}
          />
        </SettingsEmbeddedContent>
      </div>
    </SettingsPage>
  );
}
