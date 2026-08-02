"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

import { Button, Icon } from "@/base";

import { twMerge } from "@/lib/ui/twMerge";
import { Switch } from "@/components/Switch";
import { SettingsRow } from "@/components/settings/SettingsRow";
import { LoadingState } from "@/components/LoadingState";

import {
  getCaregiverPermissions,
  updateCaregiverPermissions,
  listLinkedCaregivers,
  type CaregiverPermissions,
} from "@/lib/api";

interface PermissionToggle {
  key: keyof CaregiverPermissions;
  label: string;
  description: string;
  defaultValue: boolean;
}

const PERMISSION_TOGGLES: PermissionToggle[] = [
  {
    key: "can_view_glucose",
    label: "View current glucose",
    description: "See real-time glucose readings and trend",
    defaultValue: true,
  },
  {
    key: "can_view_history",
    label: "View glucose history",
    description: "See historical glucose charts and data",
    defaultValue: true,
  },
  {
    key: "can_view_iob",
    label: "View IoB/CoB data",
    description: "See insulin on board and carb data",
    defaultValue: true,
  },
  {
    key: "can_view_ai_suggestions",
    label: "View AI suggestions",
    description: "See AI-generated analysis and recommendations",
    defaultValue: false,
  },
  {
    key: "can_receive_alerts",
    label: "Receive emergency alerts",
    description: "Get notified during glucose emergencies",
    defaultValue: true,
  },
];

export interface CaregiverPermissionsPageProps {
  linkIdOverride?: string;
}

export function CaregiverPermissionsSettings({
  linkIdOverride,
}: CaregiverPermissionsPageProps = {}) {
  const params = useParams();
  const linkId = linkIdOverride ?? (params.linkId as string);

  const [permissions, setPermissions] = useState<CaregiverPermissions | null>(
    null,
  );
  const [caregiverEmail, setCaregiverEmail] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [originalPermissions, setOriginalPermissions] =
    useState<CaregiverPermissions | null>(null);

  const fetchPermissions = useCallback(async () => {
    try {
      setError(null);
      const [permData, caregiversData] = await Promise.all([
        getCaregiverPermissions(linkId),
        listLinkedCaregivers(),
      ]);
      setPermissions(permData.permissions);
      setOriginalPermissions(permData.permissions);

      // Find the caregiver email from the linked caregivers list
      const caregiver = caregiversData.caregivers.find(
        (cg) => cg.link_id === linkId,
      );
      if (caregiver) {
        setCaregiverEmail(caregiver.caregiver_email);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load permissions",
      );
    } finally {
      setIsLoading(false);
    }
  }, [linkId]);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  const handleToggle = (key: keyof CaregiverPermissions) => {
    if (!permissions || isSaving) return;

    const updated = { ...permissions, [key]: !permissions[key] };
    setPermissions(updated);
    setSuccess(null);

    // Check if there are unsaved changes
    if (originalPermissions) {
      const changed = Object.keys(updated).some(
        (k) =>
          updated[k as keyof CaregiverPermissions] !==
          originalPermissions[k as keyof CaregiverPermissions],
      );
      setHasChanges(changed);
    }
  };

  const handleSave = async () => {
    if (!permissions || !originalPermissions) return;

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    // Only send changed fields
    const changes: Partial<CaregiverPermissions> = {};
    for (const key of Object.keys(
      permissions,
    ) as (keyof CaregiverPermissions)[]) {
      if (permissions[key] !== originalPermissions[key]) {
        changes[key] = permissions[key];
      }
    }

    try {
      const result = await updateCaregiverPermissions(linkId, changes);
      setPermissions(result.permissions);
      setOriginalPermissions(result.permissions);
      setHasChanges(false);
      setSuccess("Permissions updated successfully");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update permissions",
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Link
            data-settings-back-link
            href="/settings/care-sharing"
            className="flex items-center gap-1 font_body_2 text-foreground-secondary hover:text-foreground-primary mb-2"
          >
            <Icon decorative icon="chevron" className="h-4 w-4 rotate-180" />
            Back to Caregivers
          </Link>
          <h1 className="font_poppins font_header_2">Caregiver Permissions</h1>
        </div>
        <LoadingState
          className="min-h-0 rounded-panel border border-border-default bg-surface-primary p-12"
          label="Loading permissions..."
        />
      </div>
    );
  }

  if (error && !permissions) {
    return (
      <div className="space-y-6">
        <div data-settings-page-header>
          <Link
            data-settings-back-link
            href="/settings/care-sharing"
            className="flex items-center gap-1 font_body_2 text-foreground-secondary hover:text-foreground-primary mb-2"
          >
            <Icon decorative icon="chevron" className="h-4 w-4 rotate-180" />
            Back to Caregivers
          </Link>
          <h1 className="font_poppins font_header_2">Caregiver Permissions</h1>
        </div>
        <div
          className="bg-signal-error-fill/10 rounded-panel p-6 border border-signal-error-text text-center"
          role="alert"
        >
          <Icon
            decorative
            icon="circle-slash"
            className="h-8 w-8 text-signal-error-text mx-auto mb-3"
          />
          <p className="text-signal-error-text">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div data-settings-page-header>
        <Link
          data-settings-back-link
          href="/settings/care-sharing"
          className="flex items-center gap-1 font_body_2 text-foreground-secondary hover:text-foreground-primary mb-2"
        >
          <Icon decorative icon="chevron" className="h-4 w-4 rotate-180" />
          Back to Caregivers
        </Link>
        <h1 className="font_poppins font_header_2">Caregiver Permissions</h1>
        {caregiverEmail && (
          <p className="text-foreground-secondary">
            Configure data access for{" "}
            <span className="text-accent">{caregiverEmail}</span>
          </p>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div
          className="bg-signal-error-fill/10 rounded-panel p-4 border border-signal-error-text"
          role="alert"
        >
          <div className="flex items-center gap-2">
            <Icon
              decorative
              icon="circle-slash"
              className="h-4 w-4 text-signal-error-text shrink-0"
            />
            <p className="font_body_2 text-signal-error-text">{error}</p>
          </div>
        </div>
      )}

      {/* Success state */}
      {success && (
        <div
          className="bg-signal-check-fill/10 rounded-panel p-4 border border-signal-check-text"
          role="status"
        >
          <div className="flex items-center gap-2">
            <Icon
              decorative
              icon="check"
              className="h-4 w-4 text-signal-check-text shrink-0"
            />
            <p className="font_body_2 text-signal-check-text">{success}</p>
          </div>
        </div>
      )}

      {/* Permission toggles */}
      {permissions && (
        <div className="bg-surface-primary rounded-panel border border-border-default p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-accent/10 rounded-panel">
              <Icon decorative icon="key" className="h-5 w-5 text-accent" />
            </div>
            <div data-settings-page-header>
              <h2 className="font_poppins font_header_4">Data Access</h2>
              <p className="font_body_3 text-foreground-secondary">
                Control what this caregiver can see and receive
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {PERMISSION_TOGGLES.map((toggle) => {
              const isEnabled = permissions[toggle.key];

              return (
                <SettingsRow
                  control={
                    <Switch
                      checked={isEnabled}
                      disabled={isSaving}
                      label={toggle.label}
                      onCheckedChange={() => handleToggle(toggle.key)}
                      visuallyHideLabel
                    />
                  }
                  description={toggle.description}
                  key={toggle.key}
                  label={toggle.label}
                />
              );
            })}
          </div>

          {/* Save button */}
          <div className="mt-6 flex items-center gap-3">
            <Button
              type="button"
              onClick={handleSave}
              disabled={!hasChanges || isSaving}
              className={twMerge(
                "flex items-center gap-2 px-4 py-2 rounded-panel font_ui_label",
                "bg-accent text-accent-foreground hover:bg-accent-hover",
                "transition-colors",
                "focus:outline-hidden focus-visible:ring-2 focus-visible:ring-border-active",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            >
              {isSaving ? (
                <Icon
                  decorative
                  icon="clock"
                  className="h-4 w-4 animate-spin"
                />
              ) : (
                <Icon decorative icon="check" className="h-4 w-4" />
              )}
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
            {hasChanges && (
              <p className="font_body_3 text-foreground-secondary">
                You have unsaved changes
              </p>
            )}
          </div>
        </div>
      )}

      {/* Info card */}
      <div className="bg-surface-elevated rounded-panel p-4 border border-border-default">
        <p className="font_body_3 text-foreground-primary">
          Changes take effect immediately after saving. Caregivers will only see
          data that you have enabled. Emergency alert permissions control
          whether this caregiver receives escalation notifications.
        </p>
      </div>
    </div>
  );
}

export default function CaregiverPermissionsPage() {
  return <CaregiverPermissionsSettings />;
}
