"use client";

import { useEffect, useRef, useState } from "react";

import { CaregiversSettings } from "../caregivers/CaregiversSettings";
import { CaregiverPermissionsSettings } from "../caregivers/[linkId]/permissions/CaregiverPermissionsSettings";
import EmergencyContactsPage from "../emergency-contacts/page";
import { EmergencyContactsEmbeddingContext } from "../emergency-contacts/emergencyContactsEmbeddingContext";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SettingsEmbeddedContent } from "@/components/settings/SettingsEmbeddedContent";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { PageHeader } from "@/components/PageHeader";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { settingsPageIcons } from "@/components/settings/settings-navigation";

export default function CareAndSharingSettingsPage() {
  const [selectedCaregiverId, setSelectedCaregiverId] = useState<string | null>(
    null,
  );
  const permissionsHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const caregiverId = new URLSearchParams(window.location.search).get(
      "caregiver",
    );
    if (caregiverId) setSelectedCaregiverId(caregiverId);
  }, []);

  useEffect(() => {
    if (selectedCaregiverId) permissionsHeadingRef.current?.focus();
  }, [selectedCaregiverId]);

  return (
    <SettingsPage>
      <PageHeader
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
          <EmergencyContactsEmbeddingContext.Provider value>
            <EmergencyContactsPage />
          </EmergencyContactsEmbeddingContext.Provider>
        </SettingsEmbeddedContent>
      </SettingsSection>

      <SettingsSection
        description="Invite caregivers and control access to your glucose data."
        id="caregiver-access"
        separated
        title="Caregiver Access"
      >
        <SettingsEmbeddedContent>
          <CaregiversSettings
            embedded
            onManagePermissions={setSelectedCaregiverId}
          />
        </SettingsEmbeddedContent>
      </SettingsSection>

      {selectedCaregiverId ? (
        <SettingsSection
          description="Control what this caregiver can see and receive."
          headingRef={permissionsHeadingRef}
          headingTabIndex={-1}
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
              embedded
              linkIdOverride={selectedCaregiverId}
            />
          </SettingsEmbeddedContent>
        </SettingsSection>
      ) : null}
    </SettingsPage>
  );
}
