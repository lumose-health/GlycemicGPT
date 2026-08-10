"use client";

import AlertSettingsPage from "../alerts/page";
import BriefDeliveryPage from "../brief-delivery/page";
import { CommunicationsSettings } from "../communications/CommunicationsSettings";
import TelegramSettingsPage from "../telegram/page";
import { SettingsEmbeddedContent } from "@/components/settings/SettingsEmbeddedContent";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { PageHeader } from "@/components/PageHeader";
import { LoadingState } from "@/components/LoadingState";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { settingsPageIcons } from "@/components/settings/settings-navigation";

import { useUserContext } from "@/providers/user-provider";

export default function AlarmsNotificationSettingsPage() {
  const { isLoading, user } = useUserContext();
  const isCaregiver = user?.role === "caregiver";

  return (
    <SettingsPage>
      <PageHeader
        description="Control alerts, daily briefs, and the channels used to reach you."
        icon={settingsPageIcons.alarmsNotification}
        title="Alarms & Notifications"
      />

      {isLoading ? (
        <LoadingState label="Loading alarm and notification settings" />
      ) : null}

      {!isLoading && !isCaregiver ? (
        <SettingsSection
          description="Choose the conditions that generate glucose and insulin alerts."
          id="alert-triggers"
          title="Alert Triggers"
        >
          <SettingsEmbeddedContent>
            <AlertSettingsPage />
          </SettingsEmbeddedContent>
        </SettingsSection>
      ) : null}

      {!isLoading && !isCaregiver ? (
        <SettingsSection
          description="Choose when and where your daily glucose brief is delivered."
          id="daily-briefs"
          separated
          title="Daily Briefs"
        >
          <SettingsEmbeddedContent>
            <BriefDeliveryPage />
          </SettingsEmbeddedContent>
        </SettingsSection>
      ) : null}

      {!isLoading ? (
        <SettingsSection
          description="Manage the services Lumose can use to send notifications."
          id="delivery-channels"
          separated={!isCaregiver}
          title="Delivery Channels"
        >
          <SettingsEmbeddedContent>
            <CommunicationsSettings telegramHref="#telegram" />
          </SettingsEmbeddedContent>
        </SettingsSection>
      ) : null}

      {!isLoading ? (
        <SettingsSection
          description="Configure the Telegram bot and link your Telegram account."
          id="telegram"
          separated
          title="Telegram"
        >
          <SettingsEmbeddedContent>
            <TelegramSettingsPage />
          </SettingsEmbeddedContent>
        </SettingsSection>
      ) : null}
    </SettingsPage>
  );
}
