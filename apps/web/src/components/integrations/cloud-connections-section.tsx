"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Icon, type IconName } from "@/base/Icon";
import { PasswordTextInput } from "@/components/PasswordTextInput";
import { SelectField } from "@/components/SelectField";
import { SettingsReadOnlyValue } from "@/components/settings/SettingsReadOnlyValue";
import { TextInput } from "@/components/TextInput";
import type { GlookoStatus, IntegrationResponse } from "@/lib/api";
import {
  TANDEM_COUNTRY_GROUPS,
  TANDEM_COUNTRY_LABELS,
} from "@/lib/tandem-countries";
import {
  ConnectionSettingsAccordion,
  ConnectionSettingsForm,
  ConnectionSettingsList,
  type ConnectionSettingsStatus,
} from "./ConnectionSettings";
import { ConnectionCollapsibleSection } from "./ConnectionSettings/ConnectionCollapsibleSection";
import { TandemSyncSettings } from "./TandemSyncSettings";
import { MedtronicImportCard } from "./medtronic-import-card";
import { MedtronicConnectCard } from "./medtronic-connect-card";
import { GlookoSyncCard } from "./glooko-sync-card";
import type { ConnectionTarget } from "./connection-navigation";
import {
  getTandemCredentialsValidationErrors,
  tandemCredentialsSchema,
  type TandemCredentialsField,
  type TandemCredentialsFormValues,
  type TandemCredentialsValidationErrors,
} from "./tandem-credentials-schema";
const EMPTY_TANDEM_CREDENTIAL_ERRORS: TandemCredentialsValidationErrors = {
  country: [],
  email: [],
  password: [],
};

type GlookoHeaderMetadata = {
  loadFailed: boolean;
  loaded: boolean;
  status: GlookoStatus | null;
};

function getGlookoHeaderStatus({
  loadFailed,
  loaded,
  status,
}: GlookoHeaderMetadata): ConnectionSettingsStatus {
  if (!loaded) return "pending";
  if (loadFailed) return "error";

  switch (status?.status) {
    case "connected":
      return "connected";
    case "error":
      return "error";
    case "pending":
      return "pending";
    default:
      return "disconnected";
  }
}

const TANDEM_COUNTRY_OPTIONS = TANDEM_COUNTRY_GROUPS.flatMap((group) =>
  group.options.map((option) => ({
    label: option.label,
    value: option.code,
  })),
);

interface CloudConnectionsSectionProps {
  category?: "all" | "insulin-pumps" | "third-party";
  embedded?: boolean;
  tandem: IntegrationResponse | null;
  tandemEmail: string;
  tandemPassword: string;
  tandemCountry: string;
  isTandemConnecting: boolean;
  isOffline: boolean;
  openConnection?: ConnectionTarget;
  onTandemEmailChange: (value: string) => void;
  onTandemPasswordChange: (value: string) => void;
  onTandemCountryChange: (value: string) => void;
  onConnectTandem: () => Promise<void>;
  onDisconnectTandem: () => Promise<void>;
}

interface GlookoReferralProps {
  defaultOpen: boolean;
  description: string;
  icon: IconName;
  sourceName: string;
}

function GlookoReferral({
  defaultOpen,
  description,
  icon,
  sourceName,
}: GlookoReferralProps) {
  return (
    <ConnectionCollapsibleSection
      defaultOpen={defaultOpen}
      headerContent={
        <span className="flex min-w-0 items-center gap-3">
          <Icon
            className="h-5 w-5 text-foreground-secondary"
            decorative
            icon={icon}
          />
          <span className="truncate font_body_2 text-foreground-primary">
            {sourceName}
          </span>
        </span>
      }
      title={sourceName}
      variant="subsection"
    >
      <div>
        <p className="font_body_3 text-foreground-secondary">{description}</p>
        <Link
          className="font_poppins font_body_3 mt-4 inline-flex min-h-10 items-center rounded-button bg-accent px-4 text-accent-foreground transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-active"
          href="/settings/connections?tab=third-party&connection=glooko"
        >
          Go to Glooko connection settings
        </Link>
      </div>
    </ConnectionCollapsibleSection>
  );
}

/**
 * Cloud Sync: pull pump data from a vendor's cloud (no Bluetooth pairing
 * required). One subsection per vendor -- Tandem t:connect, Medtronic CareLink,
 * and Insulet Omnipod (via Glooko). Each subsection owns the full cloud
 * integration for that vendor: connecting the account AND the sync controls.
 */
export function CloudConnectionsSection({
  category = "all",
  embedded = false,
  tandem,
  tandemEmail,
  tandemPassword,
  tandemCountry,
  isTandemConnecting,
  isOffline,
  openConnection,
  onTandemEmailChange,
  onTandemPasswordChange,
  onTandemCountryChange,
  onConnectTandem,
  onDisconnectTandem,
}: CloudConnectionsSectionProps) {
  const [credentialErrors, setCredentialErrors] =
    useState<TandemCredentialsValidationErrors>(EMPTY_TANDEM_CREDENTIAL_ERRORS);
  const [glookoHeaderMetadata, setGlookoHeaderMetadata] =
    useState<GlookoHeaderMetadata>({
      loadFailed: false,
      loaded: false,
      status: null,
    });
  const showInsulinPumps = category === "all" || category === "insulin-pumps";
  const showThirdParty = category === "all" || category === "third-party";
  const isTandemConnected = tandem?.status === "connected";
  const connectedCountry = tandem?.region
    ? (TANDEM_COUNTRY_LABELS[tandem.region] ?? tandem.region)
    : "Not available";

  const handleGlookoStatusChange = useCallback(
    (status: GlookoStatus | null, loadFailed = false) => {
      setGlookoHeaderMetadata({ loadFailed, loaded: true, status });
    },
    [],
  );

  const handleCredentialChange = (
    field: TandemCredentialsField,
    value: string,
  ) => {
    const nextValues: TandemCredentialsFormValues = {
      country: field === "country" ? value : tandemCountry,
      email: field === "email" ? value : tandemEmail,
      password: field === "password" ? value : tandemPassword,
    };
    const currentValidationErrors =
      getTandemCredentialsValidationErrors(nextValues);

    if (field === "country") {
      onTandemCountryChange(value);
    } else if (field === "email") {
      onTandemEmailChange(value);
    } else {
      onTandemPasswordChange(value);
    }

    setCredentialErrors((visibleErrors) => ({
      country: visibleErrors.country.filter((error) =>
        currentValidationErrors.country.includes(error),
      ),
      email: visibleErrors.email.filter((error) =>
        currentValidationErrors.email.includes(error),
      ),
      password: visibleErrors.password.filter((error) =>
        currentValidationErrors.password.includes(error),
      ),
    }));
  };

  const handleConnectTandem = async () => {
    const values: TandemCredentialsFormValues = {
      country: tandemCountry,
      email: tandemEmail,
      password: tandemPassword,
    };
    const validationResult = tandemCredentialsSchema.safeParse(values);

    if (!validationResult.success) {
      setCredentialErrors(getTandemCredentialsValidationErrors(values));
      return;
    }

    setCredentialErrors(EMPTY_TANDEM_CREDENTIAL_ERRORS);
    await onConnectTandem();
  };

  const content = (
    <div className="space-y-4">
      {showInsulinPumps ? (
        <>
          <ConnectionSettingsList>
            <ConnectionSettingsAccordion
              defaultOpen={!embedded}
              icon="insulin-pump"
              name="Tandem t:connect"
              status={tandem?.status ?? null}
              updatedAt={tandem?.last_sync_at ?? null}
            >
              <div className="space-y-6">
                <ConnectionSettingsForm
                  actionsClassName={
                    isTandemConnected
                      ? "mt-6 border-t border-border-default pt-6"
                      : undefined
                  }
                  isOffline={isOffline}
                  isSubmitting={isTandemConnecting}
                  lastError={tandem?.last_error ?? null}
                  onDisconnect={onDisconnectTandem}
                  onSubmit={handleConnectTandem}
                  status={tandem?.status ?? null}
                >
                  {isTandemConnected ? (
                    <div className="space-y-6">
                      <div className="border-b border-border-default pb-6">
                        <dl className="grid gap-6 rounded-panel bg-surface-secondary p-4 sm:grid-cols-2 sm:p-6">
                          <SettingsReadOnlyValue
                            label="Country"
                            labelClassName="text-foreground-primary"
                            value={connectedCountry}
                          />
                        </dl>
                      </div>
                      <TandemSyncSettings isOffline={isOffline} />
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid gap-4 lg:grid-cols-[minmax(0,28rem)_minmax(0,20rem)] lg:items-start lg:gap-8">
                        <div className="space-y-4">
                          <TextInput
                            autoComplete="email"
                            disabled={isTandemConnecting}
                            errorMessages={credentialErrors.email}
                            id="tandem-email"
                            label="Tandem t:connect Email"
                            onChange={(event) =>
                              handleCredentialChange(
                                "email",
                                event.target.value,
                              )
                            }
                            placeholder="you@example.com"
                            type="email"
                            value={tandemEmail}
                          />
                          <PasswordTextInput
                            autoComplete="current-password"
                            disabled={isTandemConnecting}
                            errorMessages={credentialErrors.password}
                            id="tandem-password"
                            label="Tandem t:connect Password"
                            onChange={(event) =>
                              handleCredentialChange(
                                "password",
                                event.target.value,
                              )
                            }
                            value={tandemPassword}
                          />
                        </div>
                        <SelectField
                          containerClassName="max-w-xs"
                          disabled={isTandemConnecting}
                          errorMessage={credentialErrors.country[0]}
                          helperText="Choose the country where your t:connect account is registered."
                          id="tandem-country"
                          label="Country"
                          onChange={(event) =>
                            handleCredentialChange(
                              "country",
                              event.target.value,
                            )
                          }
                          options={TANDEM_COUNTRY_OPTIONS}
                          value={tandemCountry}
                        />
                      </div>
                    </div>
                  )}
                </ConnectionSettingsForm>
              </div>
            </ConnectionSettingsAccordion>
          </ConnectionSettingsList>

          <ConnectionCollapsibleSection
            defaultOpen={!embedded}
            title="Medtronic CareLink"
            variant="subsection"
          >
            <div className="space-y-4">
              {/* Automatic sync (CarePartner/Connect) -- ongoing recent data. */}
              <MedtronicConnectCard isOffline={isOffline} />
              {/* Manual historical import -- deep backfill from the CareLink site. */}
              <MedtronicImportCard isOffline={isOffline} />
            </div>
          </ConnectionCollapsibleSection>

          {category === "insulin-pumps" ? (
            <>
              <GlookoReferral
                defaultOpen={!embedded}
                description="Omnipod 5 does not offer Lumose a direct connection and uploads its data to Glooko instead. Connect the Glooko account that receives your Omnipod data."
                icon="insulin-pump"
                sourceName="Omnipod"
              />
              <GlookoReferral
                defaultOpen={!embedded}
                description="NovoPen 6 and NovoPen Echo Plus do not offer Lumose a direct connection. Their dose data reaches Lumose through the Glooko account you use when scanning your pen."
                icon="syringe"
                sourceName="NovoPen"
              />
            </>
          ) : null}
        </>
      ) : null}

      {showThirdParty ? (
        <ConnectionSettingsList>
          <ConnectionSettingsAccordion
            defaultOpen={!embedded || openConnection === "glooko"}
            icon="link"
            name={category === "all" ? "Omnipod / Glooko" : "Glooko"}
            status={getGlookoHeaderStatus(glookoHeaderMetadata)}
            updatedAt={glookoHeaderMetadata.status?.last_sync_at ?? null}
          >
            {/* Omnipod 5 uploads to Glooko only -- continuous sync + one-time
                historical import live in the one card. */}
            <GlookoSyncCard
              isOffline={isOffline}
              onStatusChange={handleGlookoStatusChange}
            />
          </ConnectionSettingsAccordion>
        </ConnectionSettingsList>
      ) : null}
    </div>
  );

  if (embedded) {
    return content;
  }

  return (
    <ConnectionCollapsibleSection title="Cloud Sync" iconName="insulin-pump">
      {content}
    </ConnectionCollapsibleSection>
  );
}
