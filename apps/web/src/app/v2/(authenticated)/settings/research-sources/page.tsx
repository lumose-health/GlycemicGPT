"use client";

import { useState, useEffect, useCallback } from "react";

import { Button, Icon } from "@/base";
import { SelectField } from "@/components/SelectField";
import { TextInput } from "@/components/TextInput";
import { LoadingState } from "@/components/LoadingState";

import {
  getResearchSources,
  addResearchSource,
  deleteResearchSource,
  triggerResearch,
  getResearchSuggestions,
  type ResearchSource,
  type ResearchSuggestion,
} from "@/lib/api";
import {
  getResearchSourceValidationErrors,
  researchSourceSchema,
  type ResearchSourceField,
  type ResearchSourceFormValues,
  type ResearchSourceValidationErrors,
} from "./researchSourceSchema";

const CATEGORY_OPTIONS = [
  { label: "Select category...", value: "" },
  { label: "Insulin / Medication", value: "insulin" },
  { label: "Insulin Pump", value: "pump" },
  { label: "CGM", value: "cgm" },
  { label: "Clinical Guidelines", value: "guidelines" },
  { label: "Other", value: "other" },
];

const EMPTY_VALIDATION_ERRORS: ResearchSourceValidationErrors = {
  category: [],
  name: [],
  url: [],
};

export default function ResearchSourcesPage() {
  const [sources, setSources] = useState<ResearchSource[]>([]);
  const [suggestions, setSuggestions] = useState<ResearchSuggestion[]>([]);
  const [basedOn, setBasedOn] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [researching, setResearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Add source form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [adding, setAdding] = useState(false);
  const [hasAttemptedAdd, setHasAttemptedAdd] = useState(false);
  const [validationErrors, setValidationErrors] =
    useState<ResearchSourceValidationErrors>(EMPTY_VALIDATION_ERRORS);

  const getAddFormValues = (
    field?: ResearchSourceField,
    value?: string,
  ): ResearchSourceFormValues => ({
    category: (field === "category"
      ? value
      : newCategory) as ResearchSourceFormValues["category"],
    name: field === "name" ? (value ?? "") : newName,
    url: field === "url" ? (value ?? "") : newUrl,
  });

  const resetAddForm = useCallback(() => {
    setShowAddForm(false);
    setNewUrl("");
    setNewName("");
    setNewCategory("");
    setHasAttemptedAdd(false);
    setValidationErrors(EMPTY_VALIDATION_ERRORS);
  }, []);

  const handleAddFormChange = (field: ResearchSourceField, value: string) => {
    if (field === "url") setNewUrl(value);
    if (field === "name") setNewName(value);
    if (field === "category") setNewCategory(value);

    if (hasAttemptedAdd) {
      setValidationErrors(
        getResearchSourceValidationErrors(getAddFormValues(field, value)),
      );
    }
  };

  const loadData = useCallback(async () => {
    try {
      const [sourcesData, suggestionsData] = await Promise.all([
        getResearchSources(),
        getResearchSuggestions(),
      ]);
      setSources(sourcesData.sources);
      setSuggestions(suggestionsData.suggestions);
      setBasedOn(suggestionsData.based_on);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAddSource = useCallback(
    async (url: string, name: string, category?: string) => {
      setAdding(true);
      setError(null);
      try {
        await addResearchSource(url, name, category);
        setSuccess(`Added: ${name}`);
        resetAddForm();
        await loadData();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add source");
      } finally {
        setAdding(false);
      }
    },
    [loadData, resetAddForm],
  );

  const handleAddFormSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setHasAttemptedAdd(true);

    const result = researchSourceSchema.safeParse(getAddFormValues());
    if (!result.success) {
      setValidationErrors(
        getResearchSourceValidationErrors(getAddFormValues()),
      );
      return;
    }

    setValidationErrors(EMPTY_VALIDATION_ERRORS);
    await handleAddSource(
      result.data.url,
      result.data.name,
      result.data.category || undefined,
    );
  };

  const handleDelete = useCallback(
    async (sourceId: string, sourceName: string) => {
      setError(null);
      try {
        await deleteResearchSource(sourceId);
        setSuccess(`Removed: ${sourceName}`);
        await loadData();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to delete source",
        );
      }
    },
    [loadData],
  );

  const handleResearch = useCallback(async () => {
    setResearching(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await triggerResearch();
      const parts = [];
      if (result.new > 0) parts.push(`${result.new} new`);
      if (result.updated > 0) parts.push(`${result.updated} updated`);
      if (result.unchanged > 0) parts.push(`${result.unchanged} unchanged`);
      if (result.errors > 0) parts.push(`${result.errors} errors`);
      setSuccess(`Research complete: ${parts.join(", ")}`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Research failed");
    } finally {
      setResearching(false);
    }
  }, [loadData]);

  if (loading) {
    return (
      <LoadingState
        className="h-full min-h-0"
        label="Loading research sources..."
      />
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3" data-settings-page-header>
        <Icon decorative icon="book-open" className="h-6 w-6 text-accent" />
        <div>
          <h1 className="font_poppins font_header_2 text-foreground-primary">
            AI Research Sources
          </h1>
          <p className="text-foreground-secondary">
            The AI researches these URLs for clinical documentation about your
            devices and medications
          </p>
        </div>
      </div>

      {/* Status messages */}
      {error && (
        <div className="bg-signal-error-fill/10 border border-signal-error-text text-signal-error-text px-4 py-3 rounded-panel">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-signal-check-fill/10 border border-signal-check-text text-signal-check-text px-4 py-3 rounded-panel">
          {success}
        </div>
      )}

      {/* Suggestions based on user config */}
      {suggestions.length > 0 && (
        <div className="bg-accent/10 border border-accent rounded-panel p-4 space-y-3">
          <div className="flex items-center gap-2 text-accent text-accent">
            <Icon decorative icon="lightbulb" className="h-5 w-5" />
            <span className="font_ui_label">Suggested Sources</span>
          </div>
          <p className="font_body_2 text-foreground-secondary text-foreground-secondary">
            Based on your configuration
            {basedOn.insulin && ` (${basedOn.insulin})`}
            {basedOn.pump && ` + ${basedOn.pump} pump`}
            {basedOn.cgm && ` + ${basedOn.cgm} CGM`}, we recommend these
            sources:
          </p>
          <div className="space-y-2">
            {suggestions.map((suggestion) => (
              <div
                key={suggestion.url}
                className="flex items-center justify-between bg-surface-primary bg-surface-secondary border border-accent border-transparent rounded-panel px-3 py-2"
              >
                <div>
                  <p className="font_ui_label text-foreground-primary">
                    {suggestion.name}
                  </p>
                  <p className="font_body_3 text-foreground-secondary text-foreground-secondary truncate max-w-md">
                    {suggestion.url}
                  </p>
                </div>
                <Button
                  onClick={() =>
                    handleAddSource(
                      suggestion.url,
                      suggestion.name,
                      suggestion.category,
                    )
                  }
                  disabled={adding}
                  className="px-3 py-1 bg-accent hover:bg-accent-hover text-accent-foreground font_body_2 rounded-panel transition-colors disabled:opacity-50"
                >
                  Add
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Configured sources */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font_poppins font_header_4 text-foreground-primary">
            Configured Sources ({sources.length})
          </h2>
          <div className="flex gap-2">
            <Button
              onClick={handleResearch}
              disabled={researching || sources.length === 0}
              className="flex items-center gap-2 px-3 py-2 bg-accent hover:bg-accent-hover text-accent-foreground font_body_2 rounded-panel transition-colors disabled:opacity-50"
            >
              {researching ? (
                <Icon
                  decorative
                  icon="clock"
                  className="h-4 w-4 animate-spin"
                />
              ) : (
                <Icon decorative icon="clock" className="h-4 w-4" />
              )}
              Research Now
            </Button>
            <Button
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-2 px-3 py-2 bg-accent hover:bg-accent-hover text-accent-foreground font_body_2 rounded-panel transition-colors"
            >
              <Icon decorative icon="person-add" className="h-4 w-4" />
              Add Source
            </Button>
          </div>
        </div>

        {sources.length === 0 && !showAddForm && (
          <div className="text-center py-12 bg-surface-secondary border border-border-default border-transparent rounded-panel">
            <Icon
              decorative
              icon="book-open"
              className="h-12 w-12 text-foreground-primary text-foreground-primary mx-auto mb-3"
            />
            <p className="text-foreground-primary text-foreground-primary">
              No research sources configured
            </p>
            <p className="font_body_2 text-foreground-primary text-foreground-primary mt-1">
              Add sources above or use the suggested sources based on your
              devices
            </p>
          </div>
        )}

        {sources.map((source) => (
          <div
            key={source.id}
            className="bg-surface-primary/50 border border-border-default border-border-default rounded-panel p-4"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <p className="font_ui_label text-foreground-primary">
                  {source.name}
                </p>
                <p className="font_body_2 text-foreground-secondary text-foreground-secondary truncate">
                  {source.url}
                </p>
                <div className="flex gap-3 mt-2 font_body_3 text-foreground-secondary text-foreground-secondary">
                  {source.category && (
                    <span className="bg-surface-secondary bg-surface-tertiary px-2 py-0.5 rounded-panel">
                      {source.category}
                    </span>
                  )}
                  {source.last_researched_at ? (
                    <span>
                      Last researched:{" "}
                      {new Date(source.last_researched_at).toLocaleDateString()}
                    </span>
                  ) : (
                    <span>Not yet researched</span>
                  )}
                </div>
              </div>
              <Button
                onClick={() => handleDelete(source.id, source.name)}
                className="text-foreground-secondary hover:text-signal-error-text transition-colors p-1"
                title="Remove source"
              >
                <Icon decorative icon="trash" className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Add source form */}
      {showAddForm && (
        <form
          className="bg-surface-primary/50 border border-border-default border-border-default rounded-panel p-4 space-y-3"
          noValidate
          onSubmit={handleAddFormSubmit}
        >
          <h3 className="font_ui_label text-foreground-primary">
            Add Research Source
          </h3>
          <TextInput
            errorMessages={validationErrors.url}
            helperText="HTTPS required"
            id="research-source-url"
            label="URL"
            onChange={(event) => handleAddFormChange("url", event.target.value)}
            placeholder="https://www.example.com/documentation"
            type="url"
            value={newUrl}
          />
          <TextInput
            errorMessages={validationErrors.name}
            id="research-source-name"
            label="Name"
            onChange={(event) =>
              handleAddFormChange("name", event.target.value)
            }
            placeholder="e.g., Humalog Prescribing Information"
            type="text"
            value={newName}
          />
          <SelectField
            errorMessage={validationErrors.category[0]}
            id="research-source-category"
            label="Category"
            onChange={(event) =>
              handleAddFormChange("category", event.target.value)
            }
            optionalText="Optional"
            options={CATEGORY_OPTIONS}
            value={newCategory}
          />
          <div className="flex gap-2 pt-2">
            <Button
              disabled={adding}
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-accent-foreground font_body_2 rounded-panel transition-colors disabled:opacity-50"
              type="submit"
            >
              {adding ? "Adding..." : "Add Source"}
            </Button>
            <Button
              onClick={resetAddForm}
              className="px-4 py-2 bg-surface-secondary bg-surface-tertiary hover:bg-surface-tertiary hover:bg-surface-tertiary text-foreground-primary text-foreground-primary font_body_2 rounded-panel transition-colors"
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
