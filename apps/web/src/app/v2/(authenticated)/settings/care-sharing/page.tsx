"use client";

import { useEffect, useState } from "react";

import { CaregiversSettings } from "../caregivers/CaregiversSettings";
import { CaregiverPermissionsSettings } from "../caregivers/[linkId]/permissions/CaregiverPermissionsSettings";
import EmergencyContactsPage from "../emergency-contacts/page";
import { SecondaryButton } from "@/components/SecondaryButton";
import {
  SettingsEmbeddedContent,
  SettingsPage,
  SettingsPageHeader,
  SettingsSection,
} from "@/components/settings";
import { settingsPageIcons } from "@/components/settings/settings-navigation";

export default function CareAndSharingSettingsPage() {
  const [selectedCaregiverId, setSelectedCaregiverId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    const caregiverId = new URLSearchParams(window.location.search).get(
      "caregiver",
    );
    if (caregiverId) setSelectedCaregiverId(caregiverId);
  }, []);

  return (
    <SettingsPage>
      <SettingsPageHeader
        description="Manage the people Lumose contacts and the people who can access your data."
        icon={settingsPageIcons.careSharing}
        title="Care & Sharing"
      />

      <SettingsSection
        description="Manage contacts used when alerts escalate."
        id="emergency-contacts"
        title="Emergency Contacts"
      >
        <SettingsEmbeddedContent>
          <EmergencyContactsPage />
        </SettingsEmbeddedContent>
      </SettingsSection>

      <SettingsSection
        description="Invite caregivers and control access to your glucose data."
        id="caregiver-access"
        separated
        title="Caregiver Access"
      >
        <SettingsEmbeddedContent>
          <CaregiversSettings onManagePermissions={setSelectedCaregiverId} />
        </SettingsEmbeddedContent>
      </SettingsSection>

      {selectedCaregiverId ? (
        <SettingsSection
          description="Control what this caregiver can see and receive."
          id="caregiver-permissions"
          separated
          title="Caregiver Permissions"
        >
          <div className="mb-6">
            <SecondaryButton onClick={() => setSelectedCaregiverId(null)}>
              Close Permissions
            </SecondaryButton>
          </div>
          <SettingsEmbeddedContent>
            <CaregiverPermissionsSettings
              linkIdOverride={selectedCaregiverId}
            />
          </SettingsEmbeddedContent>
        </SettingsSection>
      ) : null}
    </SettingsPage>
  );
}
