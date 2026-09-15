"use client";

import { useState } from "react";
import { PasswordTextInput } from "@/components/PasswordTextInput";
import { SelectField } from "@/components/SelectField";
import { SettingsReadOnlyValue } from "@/components/settings/SettingsReadOnlyValue";
import { TextInput } from "@/components/TextInput";
import {
  ConnectionInfoCallout,
  ConnectionSettingsAccordion,
  ConnectionSettingsForm,
  ConnectionSettingsList,
} from "../ConnectionSettings";
import { ConnectionCollapsibleSection } from "../ConnectionSettings/ConnectionCollapsibleSection";
import {
  libreLinkUpCredentialsSchema,
  getLibreLinkUpCredentialsValidationErrors,
  type LibreLinkUpCredentialsField,
  type LibreLinkUpCredentialsFormValues,
  type LibreLinkUpCredentialsValidationErrors,
} from "./libreLinkUpConnectionsSection.schema";
import type { LibreLinkUpConnectionsSectionProps } from "./LibreLinkUpConnectionsSection.types";

const EMPTY_LIBRELINKUP_CREDENTIAL_ERRORS: LibreLinkUpCredentialsValidationErrors =
  {
    email: [],
    password: [],
  };

// LibreLinkUp accounts are bound to a regional server (pylibrelinkup APIUrl
// members). The follower must use the same region as the account sharing to
// them. Keep this list aligned with the backend's request-schema pattern.
const LIBRELINKUP_REGION_LABELS: Record<string, string> = {
  US: "United States",
  EU: "Europe",
  EU2: "Europe 2",
  DE: "Germany",
  FR: "France",
  CA: "Canada",
  AU: "Australia",
  AP: "Asia-Pacific",
  AE: "Middle East",
  JP: "Japan",
  LA: "Latin America",
  RU: "Russia",
};

const LIBRELINKUP_REGION_OPTIONS = Object.entries(
  LIBRELINKUP_REGION_LABELS,
).map(([value, label]) => ({ label: `${label} (${value})`, value }));

export const LIBRELINKUP_REGION_VALUES = Object.keys(LIBRELINKUP_REGION_LABELS);

export function LibreLinkUpConnectionsSection({
  librelinkup,
  librelinkupEmail,
  librelinkupPassword,
  librelinkupRegion,
  embedded = false,
  isLibreLinkUpConnecting,
  isOffline,
  onLibreLinkUpEmailChange,
  onLibreLinkUpPasswordChange,
  onLibreLinkUpRegionChange,
  onConnectLibreLinkUp,
  onDisconnectLibreLinkUp,
}: LibreLinkUpConnectionsSectionProps) {
  const [credentialErrors, setCredentialErrors] =
    useState<LibreLinkUpCredentialsValidationErrors>(
      EMPTY_LIBRELINKUP_CREDENTIAL_ERRORS,
    );
  const isLibreLinkUpConnected = librelinkup?.status === "connected";
  const connectedRegion = librelinkup?.region
    ? (LIBRELINKUP_REGION_LABELS[librelinkup.region] ?? librelinkup.region)
    : "Not available";

  const handleCredentialChange = (
    field: LibreLinkUpCredentialsField,
    value: string,
  ) => {
    const nextValues: LibreLinkUpCredentialsFormValues = {
      email: field === "email" ? value : librelinkupEmail,
      password: field === "password" ? value : librelinkupPassword,
    };
    const currentValidationErrors =
      getLibreLinkUpCredentialsValidationErrors(nextValues);

    if (field === "email") {
      onLibreLinkUpEmailChange(value);
    } else {
      onLibreLinkUpPasswordChange(value);
    }

    setCredentialErrors((visibleErrors) => ({
      email: visibleErrors.email.filter((error) =>
        currentValidationErrors.email.includes(error),
      ),
      password: visibleErrors.password.filter((error) =>
        currentValidationErrors.password.includes(error),
      ),
    }));
  };

  const handleConnectLibreLinkUp = async () => {
    const validationResult = libreLinkUpCredentialsSchema.safeParse({
      email: librelinkupEmail,
      password: librelinkupPassword,
    });

    if (!validationResult.success) {
      setCredentialErrors(
        getLibreLinkUpCredentialsValidationErrors({
          email: librelinkupEmail,
          password: librelinkupPassword,
        }),
      );
      return;
    }

    setCredentialErrors(EMPTY_LIBRELINKUP_CREDENTIAL_ERRORS);
    await onConnectLibreLinkUp();
  };

  const content = (
    <ConnectionSettingsList>
      <ConnectionSettingsAccordion
        defaultOpen={false}
        icon="cgm"
        name="FreeStyle Libre (LibreLinkUp)"
        status={librelinkup?.status ?? null}
        updatedAt={librelinkup?.last_sync_at ?? null}
      >
        <ConnectionSettingsForm
          status={librelinkup?.status ?? null}
          lastError={librelinkup?.last_error ?? null}
          onSubmit={handleConnectLibreLinkUp}
          onDisconnect={onDisconnectLibreLinkUp}
          isSubmitting={isLibreLinkUpConnecting}
          isOffline={isOffline}
        >
          {isLibreLinkUpConnected ? (
            <dl className="grid gap-6 sm:grid-cols-2">
              <SettingsReadOnlyValue
                label="Region"
                labelClassName="text-foreground-primary"
                value={connectedRegion}
              />
            </dl>
          ) : (
            <div className="space-y-4">
              <ConnectionInfoCallout title="Before connecting">
                <p>
                  Open the LibreLinkUp app and accept the sharing invitation
                  from the person whose sensor you follow (often yourself, via
                  the FreeStyle Libre app)—LibreLinkUp only returns data once at
                  least one connection has been accepted.
                </p>
              </ConnectionInfoCallout>
              <div className="grid gap-4 lg:grid-cols-[minmax(0,28rem)_minmax(0,20rem)] lg:items-start lg:gap-8">
                <div className="space-y-4">
                  <TextInput
                    autoComplete="email"
                    disabled={isLibreLinkUpConnecting}
                    errorMessages={credentialErrors.email}
                    id="librelinkup-email"
                    label="LibreLinkUp Email"
                    onChange={(event) =>
                      handleCredentialChange("email", event.target.value)
                    }
                    placeholder="you@example.com"
                    type="email"
                    value={librelinkupEmail}
                  />
                  <PasswordTextInput
                    autoComplete="current-password"
                    disabled={isLibreLinkUpConnecting}
                    errorMessages={credentialErrors.password}
                    id="librelinkup-password"
                    label="LibreLinkUp Password"
                    onChange={(event) =>
                      handleCredentialChange("password", event.target.value)
                    }
                    value={librelinkupPassword}
                  />
                </div>
                <SelectField
                  containerClassName="max-w-xs"
                  disabled={isLibreLinkUpConnecting}
                  helperText="LibreLinkUp is regional. Pick the region of the account that shares to you; a mismatch will look identical to a wrong password."
                  id="librelinkup-region"
                  label="Region"
                  onChange={(event) =>
                    onLibreLinkUpRegionChange(event.target.value)
                  }
                  options={LIBRELINKUP_REGION_OPTIONS}
                  value={librelinkupRegion}
                />
              </div>
            </div>
          )}
        </ConnectionSettingsForm>
      </ConnectionSettingsAccordion>
    </ConnectionSettingsList>
  );

  if (embedded) {
    return content;
  }

  return (
    <ConnectionCollapsibleSection title="FreeStyle Libre" iconName="cgm">
      {content}
    </ConnectionCollapsibleSection>
  );
}
