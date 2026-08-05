"use client";

import { useState, useEffect, useCallback, useContext } from "react";
import { usePathname, useRouter } from "next/navigation";

import { Button, Icon } from "@/base";

import { twMerge } from "@/lib/ui/twMerge";
import {
  getEmergencyContacts,
  createEmergencyContact,
  updateEmergencyContact,
  deleteEmergencyContact,
  type EmergencyContact,
} from "@/lib/api";
import { SettingsOfflineNotice } from "@/components/settings/SettingsOfflineNotice";
import { SelectField } from "@/components/SelectField";
import { TextInput } from "@/components/TextInput";
import { LoadingState } from "@/components/LoadingState";
import {
  emergencyContactSchema,
  type EmergencyContactFields,
} from "./emergencyContact.schema";
import { EmergencyContactsEmbeddingContext } from "./emergencyContactsEmbeddingContext";

const MAX_CONTACTS = 3;

interface ContactFormData {
  name: string;
  telegram_username: string;
  priority: "primary" | "secondary";
}

const EMPTY_FORM: ContactFormData = {
  name: "",
  telegram_username: "",
  priority: "primary",
};

export default function EmergencyContactsPage() {
  const embedded = useContext(EmergencyContactsEmbeddingContext);
  const pathname = usePathname();
  const router = useRouter();
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);

  // Form state
  const [formData, setFormData] = useState<ContactFormData>({ ...EMPTY_FORM });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [validationErrors, setValidationErrors] = useState<
    Partial<Record<keyof EmergencyContactFields, string>>
  >({});

  const fetchContacts = useCallback(async () => {
    try {
      setError(null);
      const data = await getEmergencyContacts();
      setContacts(data.contacts);
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

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const parsedFields = emergencyContactSchema.safeParse(formData);
    if (!parsedFields.success) {
      const fieldErrors = parsedFields.error.flatten().fieldErrors;
      setValidationErrors({
        name: fieldErrors.name?.[0],
        priority: fieldErrors.priority?.[0],
        telegram_username: fieldErrors.telegram_username?.[0],
      });
      return;
    }
    setValidationErrors({});
    setIsSubmitting(true);

    try {
      if (editingId) {
        await updateEmergencyContact(editingId, {
          name: parsedFields.data.name,
          telegram_username: parsedFields.data.telegram_username,
          priority: parsedFields.data.priority,
        });
        setSuccess("Contact updated successfully");
      } else {
        await createEmergencyContact(parsedFields.data);
        setSuccess("Contact added successfully");
      }

      setFormData({ ...EMPTY_FORM });
      setEditingId(null);
      setShowForm(false);
      await fetchContacts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save contact");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (contact: EmergencyContact) => {
    setFormData({
      name: contact.name,
      telegram_username: contact.telegram_username,
      priority: contact.priority,
    });
    setEditingId(contact.id);
    setShowForm(true);
    setValidationErrors({});
    setError(null);
    setSuccess(null);
  };

  const handleDelete = async (contactId: string) => {
    if (
      !window.confirm("Remove this emergency contact? This cannot be undone.")
    ) {
      return;
    }

    setDeletingId(contactId);
    setError(null);
    setSuccess(null);

    try {
      await deleteEmergencyContact(contactId);
      setSuccess("Contact removed");
      await fetchContacts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete contact");
    } finally {
      setDeletingId(null);
    }
  };

  const handleCancel = () => {
    setFormData({ ...EMPTY_FORM });
    setEditingId(null);
    setShowForm(false);
    setError(null);
    setValidationErrors({});
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      {!embedded && (
        <div data-settings-page-header>
          <h1 className="font_poppins font_header_2">Emergency Contacts</h1>
          <p className="text-foreground-secondary">
            Manage contacts for automatic alert escalation via Telegram
          </p>
        </div>
      )}

      {/* Offline banner */}
      {isOffline && (
        <SettingsOfflineNotice
          onRetry={fetchContacts}
          isRetrying={isLoading}
          message="Unable to connect to server. Contact management is unavailable."
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

      {/* Loading state */}
      {isLoading && (
        <LoadingState
          className="min-h-0 rounded-panel border border-border-default bg-surface-primary p-12"
          label="Loading contacts..."
        />
      )}

      {/* Contact list */}
      {!isLoading && (
        <div className="bg-surface-primary rounded-panel border border-border-default p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-accent/10 rounded-panel">
              <Icon decorative icon="people" className="h-5 w-5 text-accent" />
            </div>
            <div>
              <h2 className="font_poppins font_header_4">Contacts</h2>
              <p className="font_body_3 text-foreground-secondary">
                {contacts.length} of {MAX_CONTACTS} contacts configured
              </p>
            </div>
          </div>

          {contacts.length === 0 && !showForm && (
            <div className="text-center py-8">
              <Icon
                decorative
                icon="people"
                className="h-10 w-10 text-foreground-secondary mx-auto mb-3"
              />
              <p className="text-foreground-secondary mb-1">
                No emergency contacts yet
              </p>
              <p className="font_body_3 text-foreground-secondary">
                Add contacts who can be notified when you&apos;re unresponsive
                to alerts
              </p>
            </div>
          )}

          {contacts.length > 0 && (
            <div className="space-y-3 mb-4">
              {contacts.map((contact) => (
                <div
                  key={contact.id}
                  className="flex items-center justify-between bg-surface-secondary rounded-panel p-4 border border-border-default"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font_ui_label text-foreground-primary truncate">
                        {contact.name}
                      </span>
                      <span
                        className={twMerge(
                          "font_body_3 px-2 py-0.5 rounded-pill",
                          contact.priority === "primary"
                            ? "bg-accent/20 text-accent"
                            : "bg-surface-secondary text-foreground-primary",
                        )}
                      >
                        {contact.priority}
                      </span>
                    </div>
                    <span className="font_body_3 text-foreground-primary">
                      @{contact.telegram_username}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <Button
                      type="button"
                      onClick={() => handleEdit(contact)}
                      disabled={isOffline}
                      className="p-2 rounded-panel text-foreground-primary hover:text-foreground-primary hover:bg-surface-secondary transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-border-active disabled:opacity-50 disabled:cursor-not-allowed"
                      aria-label={`Edit ${contact.name}`}
                    >
                      <Icon decorative icon="gear" className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      onClick={() => handleDelete(contact.id)}
                      disabled={deletingId === contact.id || isOffline}
                      className="p-2 rounded-panel text-foreground-primary hover:text-signal-error-text hover:bg-signal-error-fill/10 transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-signal-error-text disabled:opacity-50 disabled:cursor-not-allowed"
                      aria-label={`Delete ${contact.name}`}
                    >
                      {deletingId === contact.id ? (
                        <Icon
                          decorative
                          icon="clock"
                          className="h-4 w-4 animate-spin"
                        />
                      ) : (
                        <Icon decorative icon="trash" className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add button */}
          {!showForm && contacts.length < MAX_CONTACTS && (
            <Button
              type="button"
              onClick={() => {
                setShowForm(true);
                setError(null);
                setSuccess(null);
              }}
              disabled={isOffline}
              title={
                isOffline ? "Cannot add contacts while disconnected" : undefined
              }
              className={twMerge(
                "flex items-center gap-2 px-4 py-2 rounded-panel font_ui_label",
                "bg-accent text-accent-foreground hover:bg-accent-hover",
                "transition-colors",
                "focus:outline-hidden focus-visible:ring-2 focus-visible:ring-border-active",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            >
              <Icon decorative icon="person-add" className="h-4 w-4" />
              Add Contact
            </Button>
          )}

          {!showForm && contacts.length >= MAX_CONTACTS && (
            <p className="font_body_3 text-foreground-secondary">
              Maximum of {MAX_CONTACTS} contacts reached
            </p>
          )}

          {/* Add/Edit form */}
          {showForm && (
            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font_ui_label text-foreground-secondary">
                  {editingId ? "Edit Contact" : "Add Contact"}
                </h3>
                <Button
                  type="button"
                  onClick={handleCancel}
                  className="p-1 rounded-panel text-foreground-secondary hover:text-foreground-primary focus:outline-hidden focus-visible:ring-2 focus-visible:ring-border-active"
                  aria-label="Cancel"
                >
                  <Icon decorative icon="circle-slash" className="h-4 w-4" />
                </Button>
              </div>

              <TextInput
                errorMessage={validationErrors.name}
                helperText="Name of the emergency contact"
                id="contact-name"
                label="Name"
                maxLength={100}
                onChange={(event) => {
                  setFormData({ ...formData, name: event.target.value });
                  setValidationErrors((errors) => ({
                    ...errors,
                    name: undefined,
                  }));
                }}
                placeholder="e.g. Mom"
                required
                type="text"
                value={formData.name}
              />

              <TextInput
                errorMessage={validationErrors.telegram_username}
                helperText="5 to 32 characters using letters, numbers, and underscores"
                id="contact-telegram"
                label="Telegram Username"
                leadingAdornment={<span aria-hidden="true">@</span>}
                maxLength={32}
                minLength={5}
                onChange={(event) => {
                  setFormData({
                    ...formData,
                    telegram_username: event.target.value,
                  });
                  setValidationErrors((errors) => ({
                    ...errors,
                    telegram_username: undefined,
                  }));
                }}
                placeholder="username"
                required
                type="text"
                value={formData.telegram_username}
              />

              <SelectField
                errorMessage={validationErrors.priority}
                helperText="Primary contacts are notified first during escalation"
                id="contact-priority"
                label="Priority"
                onChange={(event) => {
                  setFormData({
                    ...formData,
                    priority: event.target.value as "primary" | "secondary",
                  });
                  setValidationErrors((errors) => ({
                    ...errors,
                    priority: undefined,
                  }));
                }}
                options={[
                  { label: "Primary", value: "primary" },
                  { label: "Secondary", value: "secondary" },
                ]}
                value={formData.priority}
              />

              <div className="flex items-center gap-3 pt-2">
                <Button
                  type="submit"
                  disabled={isSubmitting || isOffline}
                  title={
                    isOffline ? "Cannot save while disconnected" : undefined
                  }
                  className={twMerge(
                    "flex items-center gap-1.5 px-4 py-2 rounded-panel font_ui_label",
                    "bg-accent text-accent-foreground hover:bg-accent-hover",
                    "transition-colors",
                    "focus:outline-hidden focus-visible:ring-2 focus-visible:ring-border-active",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                  )}
                >
                  {isSubmitting ? (
                    <Icon
                      decorative
                      icon="clock"
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <Icon
                      decorative
                      icon="check"
                      className="h-4 w-4"
                      aria-hidden="true"
                    />
                  )}
                  {isSubmitting
                    ? "Saving..."
                    : editingId
                      ? "Update Contact"
                      : "Add Contact"}
                </Button>
                <Button
                  type="button"
                  onClick={handleCancel}
                  disabled={isSubmitting}
                  className={twMerge(
                    "px-4 py-2 rounded-panel font_ui_label",
                    "bg-surface-secondary text-foreground-primary hover:bg-surface-primary",
                    "transition-colors",
                    "focus:outline-hidden focus-visible:ring-2 focus-visible:ring-border-active",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                  )}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
