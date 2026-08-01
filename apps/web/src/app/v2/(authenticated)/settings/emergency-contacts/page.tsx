"use client";

import { useState, useEffect, useCallback } from "react";

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

  const fetchContacts = useCallback(async () => {
    try {
      setError(null);
      const data = await getEmergencyContacts();
      setContacts(data.contacts);
      setIsOffline(false);
    } catch (err) {
      if (!(err instanceof Error && err.message.includes("401"))) {
        setIsOffline(true);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      if (editingId) {
        await updateEmergencyContact(editingId, {
          name: formData.name,
          telegram_username: formData.telegram_username,
          priority: formData.priority,
        });
        setSuccess("Contact updated successfully");
      } else {
        await createEmergencyContact(formData);
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
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div data-settings-page-header>
        <h1 className="font_poppins font_header_2">Emergency Contacts</h1>
        <p className="text-foreground-secondary">
          Manage contacts for automatic alert escalation via Telegram
        </p>
      </div>

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
        <div
          className="bg-surface-primary rounded-panel p-12 border border-border-default text-center"
          role="status"
          aria-label="Loading emergency contacts"
        >
          <Icon
            decorative
            icon="clock"
            className="h-8 w-8 text-accent animate-spin mx-auto mb-3"
          />
          <p className="text-foreground-secondary">Loading contacts...</p>
        </div>
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
                            : "bg-surface-tertiary text-foreground-secondary",
                        )}
                      >
                        {contact.priority}
                      </span>
                    </div>
                    <span className="font_body_3 text-foreground-secondary">
                      @{contact.telegram_username}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <Button
                      type="button"
                      onClick={() => handleEdit(contact)}
                      disabled={isOffline}
                      className="p-2 rounded-panel text-foreground-secondary hover:text-foreground-primary hover:bg-surface-secondary transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-border-active disabled:opacity-50 disabled:cursor-not-allowed"
                      aria-label={`Edit ${contact.name}`}
                    >
                      <Icon decorative icon="gear" className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      onClick={() => handleDelete(contact.id)}
                      disabled={deletingId === contact.id || isOffline}
                      className="p-2 rounded-panel text-foreground-secondary hover:text-signal-error-text hover:bg-signal-error-fill/10 transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-signal-error-text disabled:opacity-50 disabled:cursor-not-allowed"
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

              <div>
                <label
                  htmlFor="contact-name"
                  className="block font_ui_label text-foreground-secondary mb-1"
                >
                  Name
                </label>
                <input
                  id="contact-name"
                  type="text"
                  required
                  maxLength={100}
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className={twMerge(
                    "w-full rounded-panel border px-3 py-2 font_body_2",
                    "bg-surface-secondary border-border-default text-foreground-primary",
                    "focus:outline-hidden focus:ring-2 focus:ring-border-active focus:border-transparent",
                    "placeholder:text-foreground-secondary",
                  )}
                  placeholder="e.g. Mom"
                  aria-describedby="name-hint"
                />
                <p
                  id="name-hint"
                  className="font_body_3 text-foreground-secondary mt-1"
                >
                  Name of the emergency contact
                </p>
              </div>

              <div>
                <label
                  htmlFor="contact-telegram"
                  className="block font_ui_label text-foreground-secondary mb-1"
                >
                  Telegram Username
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-foreground-secondary font_body_2">
                    @
                  </span>
                  <input
                    id="contact-telegram"
                    type="text"
                    required
                    minLength={5}
                    maxLength={32}
                    value={formData.telegram_username}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        telegram_username: e.target.value,
                      })
                    }
                    className={twMerge(
                      "w-full rounded-panel border px-3 py-2 font_body_2",
                      "bg-surface-secondary border-border-default text-foreground-primary",
                      "focus:outline-hidden focus:ring-2 focus:ring-border-active focus:border-transparent",
                      "placeholder:text-foreground-secondary",
                    )}
                    placeholder="username"
                    aria-describedby="telegram-hint"
                  />
                </div>
                <p
                  id="telegram-hint"
                  className="font_body_3 text-foreground-secondary mt-1"
                >
                  5-32 characters, letters, numbers, and underscores
                </p>
              </div>

              <div>
                <label
                  htmlFor="contact-priority"
                  className="block font_ui_label text-foreground-secondary mb-1"
                >
                  Priority
                </label>
                <select
                  id="contact-priority"
                  value={formData.priority}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      priority: e.target.value as "primary" | "secondary",
                    })
                  }
                  className={twMerge(
                    "w-full rounded-panel border px-3 py-2 font_body_2",
                    "bg-surface-secondary border-border-default text-foreground-primary",
                    "focus:outline-hidden focus:ring-2 focus:ring-border-active focus:border-transparent",
                  )}
                  aria-describedby="priority-hint"
                >
                  <option value="primary">Primary</option>
                  <option value="secondary">Secondary</option>
                </select>
                <p
                  id="priority-hint"
                  className="font_body_3 text-foreground-secondary mt-1"
                >
                  Primary contacts are notified first during escalation
                </p>
              </div>

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
                    "bg-surface-secondary text-foreground-secondary hover:bg-surface-secondary",
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
