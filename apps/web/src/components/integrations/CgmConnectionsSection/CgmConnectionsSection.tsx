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
  dexcomCredentialsSchema,
  getDexcomCredentialsValidationErrors,
  type DexcomCredentialsField,
  type DexcomCredentialsFormValues,
  type DexcomCredentialsValidationErrors,
} from "./cgmConnectionsSection.schema";
import type { CgmConnectionsSectionProps } from "./CgmConnectionsSection.types";
const EMPTY_DEXCOM_CREDENTIAL_ERRORS: DexcomCredentialsValidationErrors = {
  email: [],
  password: [],
};

const DEXCOM_REGION_LABELS: Record<string, string> = {
  US: "United States",
  OUS: "Outside US",
  JP: "Japan and Asia Pacific",
};

const DEXCOM_REGION_OPTIONS = [
  { label: "United States", value: "US" },
  {
    label: "Outside US (EU, UK, Canada, Australia, etc.)",
    value: "OUS",
  },
  { label: "Japan & Asia-Pacific", value: "JP" },
];

export function CgmConnectionsSection({
  dexcom,
  dexcomEmail,
  dexcomPassword,
  dexcomRegion,
  embedded = false,
  isDexcomConnecting,
  isOffline,
  onDexcomEmailChange,
  onDexcomPasswordChange,
  onDexcomRegionChange,
  onConnectDexcom,
  onDisconnectDexcom,
}: CgmConnectionsSectionProps) {
  const [credentialErrors, setCredentialErrors] =
    useState<DexcomCredentialsValidationErrors>(EMPTY_DEXCOM_CREDENTIAL_ERRORS);
  const isDexcomConnected = dexcom?.status === "connected";
  const connectedRegion = dexcom?.region
    ? (DEXCOM_REGION_LABELS[dexcom.region] ?? dexcom.region)
    : "Not available";

  const handleCredentialChange = (
    field: DexcomCredentialsField,
    value: string,
  ) => {
    const nextValues: DexcomCredentialsFormValues = {
      email: field === "email" ? value : dexcomEmail,
      password: field === "password" ? value : dexcomPassword,
    };
    const currentValidationErrors =
      getDexcomCredentialsValidationErrors(nextValues);

    if (field === "email") {
      onDexcomEmailChange(value);
    } else {
      onDexcomPasswordChange(value);
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

  const handleConnectDexcom = async () => {
    const validationResult = dexcomCredentialsSchema.safeParse({
      email: dexcomEmail,
      password: dexcomPassword,
    });

    if (!validationResult.success) {
      setCredentialErrors(
        getDexcomCredentialsValidationErrors({
          email: dexcomEmail,
          password: dexcomPassword,
        }),
      );
      return;
    }

    setCredentialErrors(EMPTY_DEXCOM_CREDENTIAL_ERRORS);
    await onConnectDexcom();
  };

  const content = (
    <ConnectionSettingsList>
      <ConnectionSettingsAccordion
        defaultOpen={false}
        icon="cgm"
        name="Dexcom G6/G7"
        status={dexcom?.status ?? null}
        updatedAt={dexcom?.last_sync_at ?? null}
      >
        <ConnectionSettingsForm
          status={dexcom?.status ?? null}
          lastError={dexcom?.last_error ?? null}
          onSubmit={handleConnectDexcom}
          onDisconnect={onDisconnectDexcom}
          isSubmitting={isDexcomConnecting}
          isOffline={isOffline}
        >
          {isDexcomConnected ? (
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
                  Open your Dexcom G6/G7 app and make sure Share is enabled
                  <span> and at least one follower has been invited</span>—
                  Dexcom only activates the Share API after the first follower
                  invite exists.
                </p>
              </ConnectionInfoCallout>
              <div className="grid gap-4 lg:grid-cols-[minmax(0,28rem)_minmax(0,20rem)] lg:items-start lg:gap-8">
                <div className="space-y-4">
                  <TextInput
                    autoComplete="email"
                    disabled={isDexcomConnecting}
                    errorMessages={credentialErrors.email}
                    id="dexcom-email"
                    label="Dexcom Share Email"
                    onChange={(event) =>
                      handleCredentialChange("email", event.target.value)
                    }
                    placeholder="you@example.com"
                    type="email"
                    value={dexcomEmail}
                  />
                  <PasswordTextInput
                    autoComplete="current-password"
                    disabled={isDexcomConnecting}
                    errorMessages={credentialErrors.password}
                    id="dexcom-password"
                    label="Dexcom Share Password"
                    onChange={(event) =>
                      handleCredentialChange("password", event.target.value)
                    }
                    value={dexcomPassword}
                  />
                </div>
                <SelectField
                  containerClassName="max-w-xs"
                  disabled={isDexcomConnecting}
                  helperText="Dexcom Share is regional. Pick the region that matches your account; a mismatch will look identical to a wrong password."
                  id="dexcom-region"
                  label="Region"
                  onChange={(event) => onDexcomRegionChange(event.target.value)}
                  options={DEXCOM_REGION_OPTIONS}
                  value={dexcomRegion}
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
    <ConnectionCollapsibleSection title="CGM Integrations" iconName="cgm">
      {content}
    </ConnectionCollapsibleSection>
  );
}
