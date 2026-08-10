"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { Button, Icon, type IconName } from "@/base";

/**
 * Stories 8.1 & 8.2: Caregiver Invitation Management & Permissions
 *
 * Allows diabetic users to create, view, and revoke caregiver invitations.
 * Also shows linked caregivers with a link to manage their data permissions.
 */

import { twMerge } from "@/lib/ui/twMerge";
import {
  listCaregiverInvitations,
  createCaregiverInvitation,
  revokeCaregiverInvitation,
  listLinkedCaregivers,
  type CaregiverInvitationListItem,
  type LinkedCaregiverItem,
} from "@/lib/api";
import { SettingsOfflineNotice } from "@/components/settings/SettingsOfflineNotice";
import { LoadingState } from "@/components/LoadingState";

const STATUS_CONFIG: Record<
  string,
  { label: string; className: string; icon: IconName }
> = {
  pending: {
    label: "Pending",
    className: "bg-signal-warning-fill/20 text-signal-warning-text",
    icon: "clock",
  },
  accepted: {
    label: "Accepted",
    className: "bg-signal-check-fill/20 text-signal-check-text",
    icon: "check",
  },
  expired: {
    label: "Expired",
    className: "bg-surface-secondary text-foreground-primary",
    icon: "circle-slash",
  },
  revoked: {
    label: "Revoked",
    className: "bg-signal-error-fill/20 text-signal-error-text",
    icon: "circle-slash",
  },
};

export interface CaregiversPageProps {
  embedded?: boolean;
  onManagePermissions?: (linkId: string) => void;
}

export function CaregiversSettings({
  embedded = false,
  onManagePermissions,
}: CaregiversPageProps = {}) {
  const pathname = usePathname();
  const router = useRouter();
  const [invitations, setInvitations] = useState<CaregiverInvitationListItem[]>(
    [],
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [newInviteUrl, setNewInviteUrl] = useState<string | null>(null);
  const [linkedCaregivers, setLinkedCaregivers] = useState<
    LinkedCaregiverItem[]
  >([]);

  const fetchInvitations = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await listCaregiverInvitations();
      setInvitations(data.invitations);
      setIsOffline(false);
    } catch (err) {
      if (err instanceof Error && err.message.includes("401")) {
        router.replace(
          `/login?expired=true&redirect=${encodeURIComponent(pathname)}`,
        );
        return;
      }
      setIsOffline(true);
    } finally {
      setIsLoading(false);
    }
  }, [pathname, router]);

  const fetchLinkedCaregivers = useCallback(async () => {
    try {
      const data = await listLinkedCaregivers();
      setLinkedCaregivers(data.caregivers);
    } catch (err) {
      if (err instanceof Error && err.message.includes("401")) {
        router.replace(
          `/login?expired=true&redirect=${encodeURIComponent(pathname)}`,
        );
        return;
      }
      // Non-critical: linked caregivers section is supplementary.
      // Fetch failures here do not block invitation management.
    }
  }, [pathname, router]);

  useEffect(() => {
    fetchInvitations();
    fetchLinkedCaregivers();
  }, [fetchInvitations, fetchLinkedCaregivers]);

  const handleCreate = async () => {
    setIsCreating(true);
    setError(null);
    setSuccess(null);
    setNewInviteUrl(null);

    try {
      const invitation = await createCaregiverInvitation();
      setNewInviteUrl(invitation.invite_url);
      setSuccess(
        "Invitation created! Share the link below with your caregiver.",
      );
      await fetchInvitations();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create invitation",
      );
    } finally {
      setIsCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (
      !window.confirm(
        "Revoke this invitation? The caregiver will no longer be able to use this link.",
      )
    ) {
      return;
    }

    setRevokingId(id);
    setError(null);
    setSuccess(null);

    try {
      await revokeCaregiverInvitation(id);
      setSuccess("Invitation revoked");
      await fetchInvitations();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to revoke invitation",
      );
    } finally {
      setRevokingId(null);
    }
  };

  const handleCopy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      setTimeout(() => setCopiedUrl(null), 2000);
    } catch {
      setError("Failed to copy to clipboard");
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const pendingCount = invitations.filter((i) => i.status === "pending").length;

  return (
    <div className="space-y-6">
      {/* Page header */}
      {!embedded && (
        <div data-settings-page-header>
          <h1 className="font_poppins font_header_2">Caregiver Access</h1>
          <p className="text-foreground-secondary">
            Invite caregivers to monitor your glucose data via Telegram
          </p>
        </div>
      )}

      {/* Offline banner */}
      {isOffline && (
        <SettingsOfflineNotice
          onRetry={fetchInvitations}
          isRetrying={isLoading}
          message="Unable to connect to server. Caregiver management is unavailable."
        />
      )}

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

      {/* New invite URL */}
      {newInviteUrl && (
        <div className="bg-accent/10 rounded-panel p-4 border border-accent">
          <p className="font_body_2 text-accent mb-2">
            Share this link with your caregiver:
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-surface-secondary rounded-panel px-3 py-2 font_body_2 text-foreground-primary overflow-x-auto">
              {newInviteUrl}
            </code>
            <Button
              type="button"
              onClick={() => handleCopy(newInviteUrl)}
              className="shrink-0 p-2 rounded-panel bg-accent text-accent-foreground hover:bg-accent-hover transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-border-active"
              aria-label="Copy invite link"
            >
              {copiedUrl === newInviteUrl ? (
                <Icon decorative icon="check" className="h-4 w-4" />
              ) : (
                <Icon decorative icon="copy" className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="font_body_3 text-foreground-secondary mt-2">
            This link expires in 7 days. The caregiver will create an account
            using this link.
          </p>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <LoadingState
          className="min-h-0 rounded-panel border border-border-default bg-surface-primary p-12"
          label="Loading invitations..."
        />
      )}

      {/* Invitations list */}
      {!isLoading && (
        <div className="bg-surface-primary rounded-panel border border-border-default p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-accent/10 rounded-panel">
              <Icon
                decorative
                icon="person-add"
                className="h-5 w-5 text-accent"
              />
            </div>
            <div>
              <h2 className="font_poppins font_header_4">Invitations</h2>
              <p className="font_body_3 text-foreground-secondary">
                {pendingCount} pending,{" "}
                {invitations.filter((i) => i.status === "accepted").length}{" "}
                accepted
              </p>
            </div>
          </div>

          {invitations.length === 0 && (
            <div className="text-center py-8">
              <Icon
                decorative
                icon="person-add"
                className="h-10 w-10 text-foreground-secondary mx-auto mb-3"
              />
              <p className="text-foreground-secondary mb-1">
                No invitations yet
              </p>
              <p className="font_body_3 text-foreground-secondary">
                Create an invitation to give a caregiver access to your glucose
                data
              </p>
            </div>
          )}

          {invitations.length > 0 && (
            <div className="space-y-3 mb-4">
              {invitations.map((inv) => {
                const config =
                  STATUS_CONFIG[inv.status] || STATUS_CONFIG.pending;
                return (
                  <div
                    key={inv.id}
                    className="flex items-center justify-between bg-surface-secondary rounded-panel p-4 border border-border-default"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Icon
                          className="h-4 w-4 shrink-0"
                          decorative
                          icon={config.icon}
                        />
                        <span
                          className={twMerge(
                            "font_body_3 px-2 py-0.5 rounded-pill",
                            config.className,
                          )}
                        >
                          {config.label}
                        </span>
                      </div>
                      <div className="font_body_3 text-foreground-primary mt-1">
                        Created {formatDate(inv.created_at)} &middot; Expires{" "}
                        {formatDate(inv.expires_at)}
                      </div>
                      {inv.accepted_by_email && (
                        <div className="font_body_3 text-signal-check-text mt-1">
                          Accepted by {inv.accepted_by_email}
                        </div>
                      )}
                    </div>
                    {inv.status === "pending" && (
                      <Button
                        type="button"
                        onClick={() => handleRevoke(inv.id)}
                        disabled={revokingId === inv.id || isOffline}
                        className="shrink-0 ml-3 p-2 rounded-panel text-foreground-primary hover:text-signal-error-text hover:bg-signal-error-fill/10 transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-signal-error-text disabled:opacity-50 disabled:cursor-not-allowed"
                        aria-label={`Revoke invitation created ${formatDate(inv.created_at)} (${inv.id})`}
                      >
                        {revokingId === inv.id ? (
                          <Icon
                            decorative
                            icon="clock"
                            className="h-4 w-4 animate-spin"
                          />
                        ) : (
                          <Icon
                            decorative
                            icon="circle-slash"
                            className="h-4 w-4"
                          />
                        )}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Create button */}
          {pendingCount < 10 && (
            <Button
              type="button"
              onClick={handleCreate}
              disabled={isCreating || isOffline}
              title={
                isOffline
                  ? "Cannot create invitations while disconnected"
                  : undefined
              }
              className={twMerge(
                "flex items-center gap-2 px-4 py-2 rounded-panel font_ui_label",
                "bg-accent text-accent-foreground hover:bg-accent-hover",
                "transition-colors",
                "focus:outline-hidden focus-visible:ring-2 focus-visible:ring-border-active",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            >
              {isCreating ? (
                <Icon
                  decorative
                  icon="clock"
                  className="h-4 w-4 animate-spin"
                />
              ) : (
                <Icon decorative icon="person-add" className="h-4 w-4" />
              )}
              {isCreating ? "Creating..." : "Create Invitation"}
            </Button>
          )}

          {pendingCount >= 10 && (
            <p className="font_body_3 text-foreground-secondary">
              Maximum of 10 pending invitations reached
            </p>
          )}
        </div>
      )}

      {/* Linked caregivers */}
      {linkedCaregivers.length > 0 && (
        <div className="bg-surface-primary rounded-panel border border-border-default p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-signal-check-fill/10 rounded-panel">
              <Icon
                decorative
                icon="key"
                className="h-5 w-5 text-signal-check-text"
              />
            </div>
            <div>
              <h2 className="font_poppins font_header_4">Linked Caregivers</h2>
              <p className="font_body_3 text-foreground-secondary">
                {linkedCaregivers.length} caregiver
                {linkedCaregivers.length !== 1 ? "s" : ""} linked
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {linkedCaregivers.map((cg) => {
              const permCount = [
                cg.permissions.can_view_glucose,
                cg.permissions.can_view_history,
                cg.permissions.can_view_iob,
                cg.permissions.can_view_ai_suggestions,
                cg.permissions.can_receive_alerts,
              ].filter(Boolean).length;

              return (
                <div
                  key={cg.link_id}
                  className="flex items-center justify-between bg-surface-secondary rounded-panel p-4 border border-border-default"
                >
                  <div className="min-w-0">
                    <p className="font_ui_label text-foreground-primary truncate">
                      {cg.caregiver_email}
                    </p>
                    <p className="font_body_3 text-foreground-primary mt-0.5">
                      Linked{" "}
                      {new Date(cg.linked_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}{" "}
                      &middot; {permCount}/5 permissions enabled
                    </p>
                  </div>
                  {onManagePermissions ? (
                    <Button
                      className="shrink-0 ml-3 flex items-center gap-1.5 px-3 py-1.5 rounded-panel font_ui_caption text-foreground-primary bg-surface-secondary hover:bg-surface-primary transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-border-active"
                      onClick={() => onManagePermissions(cg.link_id)}
                      type="button"
                    >
                      <Icon decorative icon="gear" className="h-3.5 w-3.5" />
                      Permissions
                    </Button>
                  ) : (
                    <Link
                      href={`/settings/caregivers/${cg.link_id}/permissions`}
                      className="shrink-0 ml-3 flex items-center gap-1.5 px-3 py-1.5 rounded-panel font_ui_caption text-foreground-primary bg-surface-secondary hover:bg-surface-primary transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-border-active"
                    >
                      <Icon decorative icon="gear" className="h-3.5 w-3.5" />
                      Permissions
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Info card */}
      <div className="bg-surface-elevated rounded-panel p-4 border border-border-default">
        <h3 className="font_ui_label text-foreground-primary mb-2">
          How it works
        </h3>
        <ol className="font_body_3 text-foreground-primary space-y-1 list-decimal list-inside">
          <li>Create an invitation to generate a unique link</li>
          <li>Share the link with your caregiver</li>
          <li>They create an account using the link</li>
          <li>Once linked, they can check your glucose via Telegram bot</li>
        </ol>
      </div>
    </div>
  );
}

export default function CaregiversPage() {
  return <CaregiversSettings />;
}
