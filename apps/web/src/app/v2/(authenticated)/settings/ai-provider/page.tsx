"use client";

import { Button, Icon } from "@/base";
import { useState, useEffect, useCallback } from "react";

import {
  getAIProvider,
  configureAIProvider,
  configureSubscriptionProvider,
  testAIProvider,
  deleteAIProvider,
  startSubscriptionAuth,
  submitSubscriptionToken,
  getSubscriptionAuthStatus,
  revokeSubscriptionAuth,
  getSidecarHealth,
  type AIProviderConfigResponse,
  type AIProviderType,
  type AIProviderStatus,
  type SidecarProviderName,
  type SubscriptionAuthStatusResponse,
  type SidecarHealthResponse,
} from "@/lib/api";
import { SettingsOfflineNotice } from "@/components/settings/SettingsOfflineNotice";

// Provider definitions grouped by category
interface ProviderOption {
  value: AIProviderType;
  label: string;
  description: string;
  requiresBaseUrl: boolean;
  requiresApiKey: boolean;
  requiresModelName: boolean;
  apiKeyPlaceholder: string;
  apiKeyHint: string;
  baseUrlPlaceholder?: string;
  modelPlaceholder?: string;
  pricingHint: string;
}

// Mapping from frontend provider type to sidecar provider name
const SUBSCRIPTION_SIDECAR_MAP: Record<string, SidecarProviderName> = {
  claude_subscription: "claude",
  chatgpt_subscription: "codex",
  copilot_subscription: "copilot",
};

// Human-readable label for each sidecar provider, used across the auth UI
const SIDECAR_PROVIDER_LABELS: Record<SidecarProviderName, string> = {
  claude: "Claude",
  codex: "ChatGPT",
  copilot: "GitHub Copilot",
};

const SUBSCRIPTION_PROVIDERS: ProviderOption[] = [
  {
    value: "claude_subscription",
    label: "Claude Subscription",
    description:
      "Use your Claude Max/Pro subscription via the built-in AI sidecar.",
    requiresBaseUrl: false,
    requiresApiKey: false,
    requiresModelName: false,
    apiKeyPlaceholder: "not-needed",
    apiKeyHint: "",
    modelPlaceholder: "claude-sonnet-4-5-20250929",
    pricingHint: "Unlimited usage with your subscription",
  },
  {
    value: "chatgpt_subscription",
    label: "ChatGPT Subscription",
    description:
      "Use your ChatGPT Plus/Team subscription via the built-in AI sidecar.",
    requiresBaseUrl: false,
    requiresApiKey: false,
    requiresModelName: false,
    apiKeyPlaceholder: "not-needed",
    apiKeyHint: "",
    modelPlaceholder: "gpt-4o",
    pricingHint: "Unlimited usage with your subscription",
  },
  {
    value: "copilot_subscription",
    label: "GitHub Copilot",
    description:
      "Use your GitHub Copilot subscription via the built-in AI sidecar.",
    requiresBaseUrl: false,
    requiresApiKey: false,
    requiresModelName: false,
    apiKeyPlaceholder: "not-needed",
    apiKeyHint: "",
    modelPlaceholder: "copilot-claude-sonnet-4.5",
    pricingHint: "Uses your existing GitHub Copilot subscription",
  },
];

const API_PROVIDERS: ProviderOption[] = [
  {
    value: "claude_api",
    label: "Claude API (Anthropic)",
    description:
      "Direct Anthropic API. Supports Claude Sonnet, Opus, and Haiku models.",
    requiresBaseUrl: false,
    requiresApiKey: true,
    requiresModelName: false,
    apiKeyPlaceholder: "sk-ant-...",
    apiKeyHint: "Get your API key from console.anthropic.com",
    modelPlaceholder: "claude-sonnet-4-5-20250929",
    pricingHint: "Pay-per-token",
  },
  {
    value: "openai_api",
    label: "OpenAI API",
    description: "Direct OpenAI API. Supports GPT-4o and other OpenAI models.",
    requiresBaseUrl: false,
    requiresApiKey: true,
    requiresModelName: false,
    apiKeyPlaceholder: "sk-...",
    apiKeyHint: "Get your API key from platform.openai.com",
    modelPlaceholder: "gpt-4o",
    pricingHint: "Pay-per-token",
  },
];

const SELF_HOSTED_PROVIDERS: ProviderOption[] = [
  {
    value: "openai_compatible",
    label: "Custom OpenAI-Compatible",
    description:
      "Any OpenAI-compatible endpoint: LiteLLM, Ollama, vLLM, or other self-hosted models.",
    requiresBaseUrl: true,
    requiresApiKey: false,
    requiresModelName: true,
    apiKeyPlaceholder: "optional-key",
    apiKeyHint: "Only required if your endpoint needs authentication.",
    baseUrlPlaceholder: "http://localhost:11434/v1",
    modelPlaceholder: "llama3.1:70b",
    pricingHint: "Free (self-hosted)",
  },
];

const ALL_PROVIDERS = [
  ...SUBSCRIPTION_PROVIDERS,
  ...API_PROVIDERS,
  ...SELF_HOSTED_PROVIDERS,
];

const PROVIDER_LABELS: Record<AIProviderType, string> = {
  claude_subscription: "Claude Subscription",
  chatgpt_subscription: "ChatGPT Subscription",
  copilot_subscription: "GitHub Copilot",
  claude_api: "Claude API (Anthropic)",
  openai_api: "OpenAI API",
  openai_compatible: "Custom OpenAI-Compatible",
  claude: "Claude (Legacy)",
  openai: "OpenAI (Legacy)",
};

const STATUS_CONFIG: Record<
  AIProviderStatus,
  { label: string; color: string; bg: string }
> = {
  connected: {
    label: "Connected",
    color: "text-signal-check-text",
    bg: "bg-signal-check-fill/10",
  },
  error: {
    label: "Error",
    color: "text-signal-error-text",
    bg: "bg-signal-error-fill/10",
  },
  pending: {
    label: "Pending",
    color: "text-signal-warning-text",
    bg: "bg-signal-warning-fill/10",
  },
};

export default function AIProviderPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [config, setConfig] = useState<AIProviderConfigResponse | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [providerType, setProviderType] =
    useState<AIProviderType>("claude_api");
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [modelName, setModelName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  // Empty string = "use the default" -- carried as a string for input
  // ergonomics and parsed at submit. Backend bounds 256-32768.
  const [maxResponseTokens, setMaxResponseTokens] = useState("");

  // Action state
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Subscription authentication state.
  const [subscriptionToken, setSubscriptionToken] = useState("");
  const [isSubmittingToken, setIsSubmittingToken] = useState(false);
  const [sidecarHealth, setSidecarHealth] =
    useState<SidecarHealthResponse | null>(null);
  const [subscriptionAuth, setSubscriptionAuth] =
    useState<SubscriptionAuthStatusResponse | null>(null);
  const [authInstructions, setAuthInstructions] = useState<string | null>(null);
  const [isRevokingAuth, setIsRevokingAuth] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [isConfiguringSubscription, setIsConfiguringSubscription] =
    useState(false);
  const [isStartingAuth, setIsStartingAuth] = useState(false);

  const selectedProvider =
    ALL_PROVIDERS.find((p) => p.value === providerType) || API_PROVIDERS[0];

  const isSubscription = providerType in SUBSCRIPTION_SIDECAR_MAP;
  const sidecarProvider = SUBSCRIPTION_SIDECAR_MAP[providerType] || null;

  const handleProviderSwitch = (newType: AIProviderType) => {
    setProviderType(newType);
    // Clear form fields to prevent stale data from hidden fields being sent
    setApiKey("");
    setBaseUrl("");
    setModelName("");
    setMaxResponseTokens("");
    setSubscriptionToken("");
    setAuthInstructions(null);
    // Clear stale messages from previous provider context
    setError(null);
    setSuccess(null);
    setConfirmRevoke(false);
  };

  // Auto-clear success message
  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(null), 5000);
    return () => clearTimeout(timer);
  }, [success]);

  const fetchConfig = useCallback(async () => {
    try {
      const data = await getAIProvider();
      setConfig(data);
      // Map legacy provider types to their modern equivalents
      const knownType = ALL_PROVIDERS.some(
        (p) => p.value === data.provider_type,
      )
        ? data.provider_type
        : "claude_api";
      setProviderType(knownType);
      setModelName(data.model_name || "");
      setBaseUrl(data.base_url || "");
      setMaxResponseTokens(
        data.max_response_tokens != null
          ? String(data.max_response_tokens)
          : "",
      );
      setIsOffline(false);
    } catch (err) {
      const is401 = err instanceof Error && err.message.includes("401");
      const is404 = err instanceof Error && err.message.includes("404");
      if (is404) {
        setConfig(null);
        setIsOffline(false);
      } else if (!is401) {
        setIsOffline(true);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  // Fetch subscription auth state when subscription provider is selected
  const fetchSubscriptionStatus = useCallback(async () => {
    const [health, auth] = await Promise.all([
      getSidecarHealth().catch(() => null),
      getSubscriptionAuthStatus().catch(() => null),
    ]);
    setSidecarHealth(health);
    setSubscriptionAuth(auth);
  }, []);

  useEffect(() => {
    if (isSubscription) {
      fetchSubscriptionStatus();
    }
  }, [isSubscription, fetchSubscriptionStatus]);

  const handleStartAuth = async () => {
    if (!sidecarProvider) return;
    setIsStartingAuth(true);
    setError(null);
    try {
      const result = await startSubscriptionAuth(sidecarProvider);
      setAuthInstructions(result.instructions);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to start auth flow",
      );
    } finally {
      setIsStartingAuth(false);
    }
  };

  const handleSubmitToken = async () => {
    if (!sidecarProvider || !subscriptionToken.trim()) return;
    setIsSubmittingToken(true);
    setError(null);
    setSuccess(null);
    try {
      await submitSubscriptionToken(sidecarProvider, subscriptionToken.trim());
      setSubscriptionToken("");
      setAuthInstructions(null);
      await fetchSubscriptionStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit token");
      setIsSubmittingToken(false);
      return;
    }

    // Auto-configure the provider in the DB via the sidecar endpoint
    try {
      const result = await configureSubscriptionProvider({
        sidecar_provider: sidecarProvider,
        model_name: modelName.trim() || null,
      });
      setConfig(result);
      setSuccess("Token accepted and provider configured via sidecar.");
    } catch (err) {
      // Token was accepted but DB configuration failed
      setSuccess("Token accepted.");
      setError(
        err instanceof Error
          ? `Provider configuration failed: ${err.message}`
          : "Token accepted, but failed to save provider configuration. Click 'Save Configuration' to retry.",
      );
    } finally {
      setIsSubmittingToken(false);
    }
  };

  const handleConfigureSubscription = async () => {
    if (!sidecarProvider) return;
    setIsConfiguringSubscription(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await configureSubscriptionProvider({
        sidecar_provider: sidecarProvider,
        model_name: modelName.trim() || null,
      });
      setConfig(result);
      setSuccess("Subscription provider configured successfully.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to configure subscription provider",
      );
    } finally {
      setIsConfiguringSubscription(false);
    }
  };

  const handleRevokeAuth = async () => {
    if (!sidecarProvider) return;
    setIsRevokingAuth(true);
    setError(null);
    setSuccess(null);
    let configRemovalFailed = false;
    try {
      await revokeSubscriptionAuth(sidecarProvider);
      // Also remove the DB config since the sidecar auth is gone
      if (config?.sidecar_provider === sidecarProvider) {
        try {
          await deleteAIProvider();
        } catch {
          configRemovalFailed = true;
        }
        setConfig(null);
      }
      if (configRemovalFailed) {
        setSuccess("Sidecar auth revoked.");
        setError(
          "Failed to remove provider configuration. Use 'Remove AI Provider' to clean up.",
        );
      } else {
        setSuccess("Subscription auth revoked and provider removed.");
      }
      // Clear form state
      setModelName("");
      setSubscriptionToken("");
      setAuthInstructions(null);
      setConfirmRevoke(false);
      await fetchSubscriptionStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke auth");
      setConfirmRevoke(false);
    } finally {
      setIsRevokingAuth(false);
    }
  };

  const handleSave = async () => {
    // Validate required fields based on provider
    if (selectedProvider.requiresApiKey && !apiKey.trim()) {
      setError("Please enter an API key");
      return;
    }
    if (selectedProvider.requiresBaseUrl && !baseUrl.trim()) {
      setError("Please enter a base URL for this provider type");
      return;
    }
    if (selectedProvider.requiresModelName && !modelName.trim()) {
      setError("Please enter a model name for this provider type");
      return;
    }
    // Pre-validate max_response_tokens locally so the user gets an
    // immediate error rather than a 422 round-trip. Empty string =
    // "use server default" -> send null.
    let maxTokens: number | null = null;
    const trimmedMax = maxResponseTokens.trim();
    if (trimmedMax !== "") {
      const parsed = Number(trimmedMax);
      if (!Number.isInteger(parsed) || parsed < 256 || parsed > 32768) {
        setError(
          "Max response tokens must be a whole number between 256 and 32768 (or leave blank to use the default)",
        );
        return;
      }
      maxTokens = parsed;
    }

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await configureAIProvider({
        provider_type: providerType,
        api_key: apiKey.trim() || "not-needed",
        model_name: modelName.trim() || null,
        base_url: baseUrl.trim() || null,
        max_response_tokens: maxTokens,
      });
      setConfig(result);
      setApiKey("");
      setSuccess("AI provider configured successfully");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to configure AI provider",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await testAIProvider();
      if (result.success) {
        setSuccess(result.message);
        await fetchConfig();
      } else {
        setError(result.message);
        await fetchConfig();
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to test AI provider",
      );
    } finally {
      setIsTesting(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    setError(null);
    setSuccess(null);

    try {
      await deleteAIProvider();
      setConfig(null);
      setConfirmDelete(false);
      setApiKey("");
      setModelName("");
      setBaseUrl("");
      setMaxResponseTokens("");
      setSubscriptionToken("");
      setAuthInstructions(null);
      setProviderType("claude_api");
      setSuccess("AI provider configuration removed");
      // Refresh sidecar auth state (backend revokes sidecar auth on delete)
      await fetchSubscriptionStatus().catch(() => {});
    } catch (err) {
      setConfirmDelete(false);
      setError(
        err instanceof Error ? err.message : "Failed to remove AI provider",
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const isConfigured = config !== null;
  const statusInfo = config ? STATUS_CONFIG[config.status] : null;

  // Determine if save button should be enabled
  const canSave = (() => {
    if (isOffline || isSaving) return false;
    if (selectedProvider.requiresApiKey && !apiKey.trim()) return false;
    if (selectedProvider.requiresBaseUrl && !baseUrl.trim()) return false;
    if (selectedProvider.requiresModelName && !modelName.trim()) return false;
    return true;
  })();

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Back link */}

      {/* Page header */}
      <div className="flex items-center gap-3" data-settings-page-header>
        <div className="p-3 bg-surface-secondary rounded-panel">
          <Icon decorative icon="lightbulb" className="h-6 w-6 text-accent" />
        </div>
        <div>
          <h1 className="font_poppins font_header_2">AI Provider</h1>
          <p className="text-foreground-secondary font_body_2">
            Configure your AI provider for glucose analysis and insights
          </p>
        </div>
      </div>

      {/* Data-handling banner -- vendor-agnostic disclosure. Rendered
          regardless of configured state so returning users with a
          cloud provider already configured also see this. */}
      <div
        role="note"
        aria-label="Data handling notice"
        className="bg-signal-warning-fill/10 border border-signal-warning-text rounded-panel p-4 flex gap-3"
      >
        <Icon
          decorative
          icon="link"
          className="h-5 w-5 text-signal-warning-text shrink-0 mt-0.5"
          aria-hidden="true"
        />
        <div className="space-y-1">
          <p className="font_ui_label text-signal-warning-text">
            Your choice below determines where your data is processed.
          </p>
          <p className="font_body_3 text-foreground-secondary leading-relaxed">
            Cloud-hosted AI providers receive your glucose, insulin, pump, and
            therapy data for analysis, subject to that provider&apos;s
            data-handling policy. Locally-hosted AI providers keep that data on
            your own network. Review the notes on each section below before
            choosing.
          </p>
        </div>
      </div>

      {/* Offline banner */}
      {isOffline && (
        <SettingsOfflineNotice
          onRetry={async () => {
            setIsRetrying(true);
            await fetchConfig();
            setIsRetrying(false);
          }}
          isRetrying={isRetrying}
          message="Unable to connect to server. AI provider settings are unavailable."
        />
      )}

      {/* Error banner */}
      {error && (
        <div
          role="alert"
          className="bg-signal-error-fill/10 border border-signal-error-text text-signal-error-text rounded-panel px-4 py-3 font_body_2"
        >
          {error}
        </div>
      )}

      {/* Success banner */}
      {success && (
        <div
          role="status"
          className="bg-signal-check-fill/10 border border-signal-check-text text-signal-check-text rounded-panel px-4 py-3 font_body_2"
        >
          {success}
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div
          className="bg-surface-primary rounded-panel p-12 border border-border-default text-center"
          role="status"
          aria-label="Loading AI provider configuration"
        >
          <Icon
            decorative
            icon="clock"
            className="h-8 w-8 text-accent animate-spin mx-auto mb-3"
          />
          <p className="text-foreground-secondary">
            Loading AI configuration...
          </p>
        </div>
      )}

      {/* Current configuration status */}
      {!isLoading && isConfigured && (
        <div className="bg-surface-primary rounded-panel p-6 border border-border-default space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {config.status === "connected" ? (
                <Icon
                  decorative
                  icon="link"
                  className="h-5 w-5 text-signal-check-text"
                />
              ) : (
                <Icon
                  decorative
                  icon="circle-slash"
                  className="h-5 w-5 text-signal-error-text"
                />
              )}
              <h2 className="font_poppins font_header_4">
                Current Configuration
              </h2>
            </div>
            {statusInfo && (
              <span
                className={`inline-flex items-center gap-1.5 ${statusInfo.bg} ${statusInfo.color} font_ui_caption px-2.5 py-1 rounded-pill`}
              >
                <Icon decorative icon="check" className="h-3.5 w-3.5" />
                {statusInfo.label}
              </span>
            )}
          </div>

          <div className="bg-surface-secondary rounded-panel p-4 space-y-3">
            <div className="flex items-center justify-between font_body_2">
              <span className="text-foreground-secondary">Provider</span>
              <span className="text-foreground-primary font_ui_label">
                {PROVIDER_LABELS[config.provider_type] || config.provider_type}
              </span>
            </div>
            {config.sidecar_provider ? (
              <div className="flex items-center justify-between font_body_2">
                <span className="text-foreground-secondary">
                  Authentication
                </span>
                <span className="text-signal-check-text font_body_3 flex items-center gap-1">
                  <Icon decorative icon="link" className="h-3 w-3" />
                  Managed by sidecar
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-between font_body_2">
                <span className="text-foreground-secondary">API Key</span>
                <span className="text-foreground-primary font_poppins font_body_3">
                  {config.masked_api_key}
                </span>
              </div>
            )}
            {config.base_url && (
              <div className="flex items-center justify-between font_body_2">
                <span className="text-foreground-secondary">Base URL</span>
                <span className="text-foreground-primary font_poppins font_body_3 truncate max-w-[200px]">
                  {config.base_url}
                </span>
              </div>
            )}
            {config.model_name && (
              <div className="flex items-center justify-between font_body_2">
                <span className="text-foreground-secondary">Model</span>
                <span className="text-foreground-primary font_poppins font_body_3">
                  {config.model_name}
                </span>
              </div>
            )}
            {config.last_validated_at && (
              <div className="flex items-center justify-between font_body_2">
                <span className="text-foreground-secondary">
                  Last Validated
                </span>
                <span className="text-foreground-primary font_body_3">
                  {new Date(config.last_validated_at).toLocaleString()}
                </span>
              </div>
            )}
            {config.last_error && (
              <div className="bg-signal-error-fill/10 border border-signal-error-text rounded-panel px-3 py-2 mt-2">
                <p className="font_body_3 text-signal-error-text">
                  {config.last_error}
                </p>
              </div>
            )}
          </div>

          {/* Action buttons for configured state */}
          <div className="flex flex-col gap-2">
            <Button
              onClick={handleTest}
              disabled={isTesting || isDeleting || isOffline}
              title={isOffline ? "Cannot test while disconnected" : undefined}
              className="w-full bg-surface-secondary hover:bg-surface-secondary disabled:opacity-50 disabled:cursor-not-allowed text-foreground-primary font_ui_label rounded-panel px-4 py-3 transition-colors flex items-center justify-center gap-2"
              aria-label="Test connection"
            >
              {isTesting ? (
                <Icon
                  decorative
                  icon="clock"
                  className="h-4 w-4 animate-spin"
                />
              ) : (
                <Icon decorative icon="lightbulb" className="h-4 w-4" />
              )}
              Test Connection
            </Button>

            {!confirmDelete ? (
              <Button
                onClick={() => setConfirmDelete(true)}
                disabled={isTesting || isDeleting || isOffline}
                title={
                  isOffline ? "Cannot remove while disconnected" : undefined
                }
                className="w-full text-signal-error-text hover:text-signal-error-text disabled:opacity-50 disabled:cursor-not-allowed font_body_2 transition-colors flex items-center justify-center gap-2 py-2"
                aria-label="Remove AI provider"
              >
                <Icon decorative icon="trash" className="h-4 w-4" />
                Remove AI Provider
              </Button>
            ) : (
              <div className="bg-signal-error-fill/10 border border-signal-error-text rounded-panel p-4 space-y-3">
                <p className="text-signal-error-text font_body_2">
                  Are you sure? Removing the AI provider will disable all AI
                  features including daily briefs, insights, and chat.
                </p>
                <div className="flex gap-2">
                  <Button
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="flex-1 bg-surface-fixed-critical hover:opacity-90 disabled:opacity-50 text-foreground-fixed-light font_ui_label rounded-panel px-3 py-2 transition-colors"
                  >
                    {isDeleting ? (
                      <Icon
                        decorative
                        icon="clock"
                        className="h-4 w-4 animate-spin mx-auto"
                      />
                    ) : (
                      "Yes, Remove"
                    )}
                  </Button>
                  <Button
                    onClick={() => setConfirmDelete(false)}
                    className="flex-1 bg-surface-secondary hover:bg-surface-secondary text-foreground-primary font_ui_label rounded-panel px-3 py-2 transition-colors"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Configuration form */}
      {!isLoading && (
        <div className="bg-surface-primary rounded-panel p-6 border border-border-default space-y-5">
          <div className="flex items-center gap-2">
            <Icon decorative icon="key" className="h-5 w-5 text-accent" />
            <h2 className="font_poppins font_header_4">
              {isConfigured ? "Update Configuration" : "Set Up AI Provider"}
            </h2>
          </div>

          {!isConfigured && (
            <p className="text-foreground-secondary font_body_2">
              Lumose uses your own AI (BYOAI) to analyze glucose data and
              generate insights. Choose from subscription plans, direct API
              keys, or self-hosted models below. Your credentials are encrypted
              before storage and never shared.
            </p>
          )}

          {/* Provider selection by category */}
          <div className="space-y-4">
            {/* Subscription Plans */}
            <div>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <Icon
                  decorative
                  icon="link-external"
                  className="h-4 w-4 text-accent"
                />
                <label className="font_ui_label text-foreground-secondary">
                  Subscription Plans
                </label>
                <span className="font_body_3 text-accent bg-accent/10 px-2 py-0.5 rounded-pill">
                  Unlimited usage
                </span>
                <span className="font_body_3 text-signal-warning-text bg-signal-warning-fill/10 px-2 py-0.5 rounded-pill">
                  Cloud
                </span>
              </div>
              <p className="font_body_3 text-foreground-secondary mb-2 leading-relaxed">
                Your glucose, insulin, pump, and therapy data are transmitted to
                the AI provider&apos;s servers for analysis. Review the
                provider&apos;s data-handling policy before configuring.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {SUBSCRIPTION_PROVIDERS.map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    onClick={() => handleProviderSwitch(option.value)}
                    disabled={isOffline}
                    className={`text-left p-3 rounded-panel border transition-colors ${
                      providerType === option.value
                        ? "border-accent bg-accent/10"
                        : "border-border-default bg-surface-secondary hover:border-border-hover hover:border-border-hover"
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                    aria-pressed={providerType === option.value}
                    aria-label={`Select ${option.label}`}
                  >
                    <p className="font_ui_label text-foreground-primary">
                      {option.label}
                    </p>
                    <p className="font_body_3 text-foreground-secondary mt-0.5">
                      {option.description}
                    </p>
                  </Button>
                ))}
              </div>
            </div>

            {/* Pay-Per-Token APIs */}
            <div>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <Icon
                  decorative
                  icon="key"
                  className="h-4 w-4 text-signal-warning-text"
                />
                <label className="font_ui_label text-foreground-secondary">
                  Pay-Per-Token APIs
                </label>
                <span className="font_body_3 text-signal-warning-text bg-signal-warning-fill/10 px-2 py-0.5 rounded-pill">
                  Usage-based pricing
                </span>
                <span className="font_body_3 text-signal-warning-text bg-signal-warning-fill/10 px-2 py-0.5 rounded-pill">
                  Cloud
                </span>
              </div>
              <p className="font_body_3 text-foreground-secondary mb-2 leading-relaxed">
                Your glucose, insulin, pump, and therapy data are transmitted to
                the AI provider&apos;s servers for analysis. Review the
                provider&apos;s data-handling policy before configuring.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {API_PROVIDERS.map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    onClick={() => handleProviderSwitch(option.value)}
                    disabled={isOffline}
                    className={`text-left p-3 rounded-panel border transition-colors ${
                      providerType === option.value
                        ? "border-accent bg-accent/10"
                        : "border-border-default bg-surface-secondary hover:border-border-hover hover:border-border-hover"
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                    aria-pressed={providerType === option.value}
                    aria-label={`Select ${option.label}`}
                  >
                    <p className="font_ui_label text-foreground-primary">
                      {option.label}
                    </p>
                    <p className="font_body_3 text-foreground-secondary mt-0.5">
                      {option.description}
                    </p>
                  </Button>
                ))}
              </div>
            </div>

            {/* Custom Endpoint (self-hosted local OR cloud router) */}
            <div>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <Icon
                  decorative
                  icon="desktop-device"
                  className="h-4 w-4 text-signal-warning-text"
                />
                <label className="font_ui_label text-foreground-secondary">
                  Custom Endpoint
                </label>
                <span className="font_body_3 text-signal-warning-text bg-signal-warning-fill/10 px-2 py-0.5 rounded-pill">
                  Local or cloud (depends on endpoint)
                </span>
              </div>
              <p className="font_body_3 text-foreground-secondary mb-2 leading-relaxed">
                Your data is sent to whatever endpoint you configure here. If
                you run a model locally on your own hardware (e.g., Ollama,
                vLLM, llama.cpp on your own machine or network), your data stays
                on your network.{" "}
                <strong className="text-signal-warning-text">
                  If you point this at a cloud AI router or hosted gateway (any
                  third-party service that forwards requests to upstream cloud
                  models), your data will leave your network and be processed by
                  that service and its upstream providers
                </strong>{" "}
                -- even though this section is labelled for self-hosting. You
                are responsible for understanding where your configured endpoint
                routes traffic.
              </p>
              <div className="grid grid-cols-1 gap-2">
                {SELF_HOSTED_PROVIDERS.map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    onClick={() => handleProviderSwitch(option.value)}
                    disabled={isOffline}
                    className={`text-left p-3 rounded-panel border transition-colors ${
                      providerType === option.value
                        ? "border-accent bg-accent/10"
                        : "border-border-default bg-surface-secondary hover:border-border-hover hover:border-border-hover"
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                    aria-pressed={providerType === option.value}
                    aria-label={`Select ${option.label}`}
                  >
                    <p className="font_ui_label text-foreground-primary">
                      {option.label}
                    </p>
                    <p className="font_body_3 text-foreground-secondary mt-0.5">
                      {option.description}
                    </p>
                  </Button>
                ))}
              </div>
            </div>
          </div>

          {/* Dynamic form fields based on selected provider */}
          <div className="space-y-4 border-t border-border-default pt-4">
            <p className="font_body_3 text-foreground-secondary">
              {selectedProvider.pricingHint}
            </p>

            {/* Subscription provider: token paste flow */}
            {isSubscription && (
              <div className="space-y-4">
                {/* Sidecar status */}
                <div className="flex items-center gap-2 font_body_2">
                  <span className="text-foreground-secondary">AI Sidecar:</span>
                  {sidecarHealth === null ? (
                    <span className="text-foreground-secondary">
                      Checking...
                    </span>
                  ) : sidecarHealth.available ? (
                    <span className="text-signal-check-text flex items-center gap-1">
                      <Icon decorative icon="link" className="h-3.5 w-3.5" />
                      Ready
                    </span>
                  ) : (
                    <span className="text-signal-error-text flex items-center gap-1">
                      <Icon
                        decorative
                        icon="circle-slash"
                        className="h-3.5 w-3.5"
                      />
                      Unavailable
                    </span>
                  )}
                </div>

                {/* Optional model name for subscription providers (always visible) */}
                <div className="space-y-2">
                  <label
                    htmlFor="sub-model-name"
                    className="block font_ui_label text-foreground-secondary"
                  >
                    Model Name{" "}
                    <span className="text-foreground-secondary font-normal">
                      (optional)
                    </span>
                  </label>
                  <input
                    id="sub-model-name"
                    type="text"
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                    placeholder={selectedProvider.modelPlaceholder}
                    disabled={
                      isOffline ||
                      isConfiguringSubscription ||
                      isSubmittingToken
                    }
                    className="w-full bg-surface-secondary border border-border-default rounded-panel px-4 py-3 text-foreground-primary placeholder:text-foreground-secondary focus:outline-hidden focus:ring-2 focus:ring-border-active focus:border-transparent disabled:opacity-50 font_body_2"
                  />
                  <p className="font_body_3 text-foreground-secondary">
                    Leave blank to use the default model.
                  </p>
                </div>

                {/* Current auth status for this provider */}
                {subscriptionAuth?.sidecar_available &&
                  sidecarProvider &&
                  (() => {
                    const providerAuth = subscriptionAuth[sidecarProvider];
                    const isAuthed = providerAuth?.authenticated === true;
                    // Check if DB config already matches this sidecar provider
                    const isAlreadyConfigured =
                      config?.sidecar_provider === sidecarProvider;

                    if (isAuthed) {
                      return (
                        <div className="space-y-4">
                          <div className="bg-signal-check-fill/10 border border-signal-check-text rounded-panel p-4 space-y-3">
                            <div className="flex items-center gap-2">
                              <Icon
                                decorative
                                icon="check"
                                className="h-5 w-5 text-signal-check-text"
                              />
                              <span className="text-signal-check-text font_ui_label">
                                {SIDECAR_PROVIDER_LABELS[sidecarProvider]}{" "}
                                subscription connected via sidecar
                              </span>
                            </div>
                            {!confirmRevoke ? (
                              <Button
                                onClick={() => setConfirmRevoke(true)}
                                disabled={isRevokingAuth || isOffline}
                                className="text-signal-error-text hover:text-signal-error-text disabled:opacity-50 font_body_2 transition-colors flex items-center gap-1"
                              >
                                <Icon
                                  decorative
                                  icon="trash"
                                  className="h-3.5 w-3.5"
                                />
                                Sign out
                              </Button>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="font_body_3 text-signal-error-text">
                                  This will remove your auth token and provider
                                  config.
                                </span>
                                <Button
                                  onClick={handleRevokeAuth}
                                  disabled={isRevokingAuth || isOffline}
                                  className="text-signal-error-text hover:text-signal-error-text disabled:opacity-50 font_ui_caption transition-colors flex items-center gap-1"
                                >
                                  {isRevokingAuth ? (
                                    <Icon
                                      decorative
                                      icon="clock"
                                      className="h-3.5 w-3.5 animate-spin"
                                    />
                                  ) : (
                                    "Confirm"
                                  )}
                                </Button>
                                <Button
                                  onClick={() => setConfirmRevoke(false)}
                                  className="text-foreground-secondary hover:text-foreground-primary font_body_3 transition-colors"
                                >
                                  Cancel
                                </Button>
                              </div>
                            )}
                          </div>

                          {/* Save/Update configuration button */}
                          <Button
                            onClick={handleConfigureSubscription}
                            disabled={isOffline || isConfiguringSubscription}
                            className="w-full bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-accent-foreground font_ui_label rounded-panel px-4 py-3 transition-colors flex items-center justify-center gap-2"
                          >
                            {isConfiguringSubscription ? (
                              <Icon
                                decorative
                                icon="clock"
                                className="h-4 w-4 animate-spin"
                              />
                            ) : (
                              <Icon
                                decorative
                                icon="check"
                                className="h-4 w-4"
                              />
                            )}
                            {isAlreadyConfigured
                              ? "Update Configuration"
                              : "Save Configuration"}
                          </Button>
                        </div>
                      );
                    }

                    return null;
                  })()}

                {/* Token paste form (shown when not authenticated) */}
                {(!subscriptionAuth?.sidecar_available ||
                  !(
                    sidecarProvider &&
                    subscriptionAuth?.[sidecarProvider]?.authenticated
                  )) && (
                  <div className="space-y-3">
                    {!authInstructions ? (
                      <Button
                        onClick={handleStartAuth}
                        disabled={
                          isOffline ||
                          isStartingAuth ||
                          !sidecarHealth?.available
                        }
                        className="w-full bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-accent-foreground font_ui_label rounded-panel px-4 py-3 transition-colors flex items-center justify-center gap-2"
                      >
                        {isStartingAuth ? (
                          <Icon
                            decorative
                            icon="clock"
                            className="h-4 w-4 animate-spin"
                          />
                        ) : (
                          <Icon decorative icon="key" className="h-4 w-4" />
                        )}
                        Sign in with{" "}
                        {sidecarProvider
                          ? SIDECAR_PROVIDER_LABELS[sidecarProvider]
                          : ""}
                      </Button>
                    ) : (
                      <>
                        <div className="bg-surface-secondary rounded-panel p-4 space-y-2">
                          <p className="font_body_2 text-foreground-secondary font_ui_label">
                            How to get your token:
                          </p>
                          <p className="font_body_3 text-foreground-secondary leading-relaxed">
                            {authInstructions}
                          </p>
                        </div>
                        <div className="space-y-2">
                          <label
                            htmlFor="subscription-token"
                            className="block font_ui_label text-foreground-secondary"
                          >
                            Paste your token
                          </label>
                          <textarea
                            id="subscription-token"
                            value={subscriptionToken}
                            onChange={(e) =>
                              setSubscriptionToken(e.target.value)
                            }
                            placeholder="Paste the token from the CLI command..."
                            disabled={isOffline || isSubmittingToken}
                            autoComplete="off"
                            spellCheck={false}
                            maxLength={5000}
                            rows={3}
                            className="w-full bg-surface-secondary border border-border-default rounded-panel px-4 py-3 text-foreground-primary placeholder:text-foreground-secondary focus:outline-hidden focus:ring-2 focus:ring-border-active focus:border-transparent disabled:opacity-50 font_poppins font_body_3 resize-vertical"
                          />
                        </div>
                        <Button
                          onClick={handleSubmitToken}
                          disabled={
                            isOffline ||
                            isSubmittingToken ||
                            !subscriptionToken.trim()
                          }
                          className="w-full bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-accent-foreground font_ui_label rounded-panel px-4 py-3 transition-colors flex items-center justify-center gap-2"
                        >
                          {isSubmittingToken ? (
                            <Icon
                              decorative
                              icon="clock"
                              className="h-4 w-4 animate-spin"
                            />
                          ) : (
                            <Icon decorative icon="check" className="h-4 w-4" />
                          )}
                          Connect
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Non-subscription providers: standard form fields */}
            {!isSubscription && (
              <>
                {/* Base URL input (shown for self-hosted) */}
                {selectedProvider.requiresBaseUrl && (
                  <div className="space-y-2">
                    <label
                      htmlFor="base-url"
                      className="block font_ui_label text-foreground-secondary"
                    >
                      Base URL <span className="text-signal-error-text">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Icon
                          decorative
                          icon="link-external"
                          className="h-4 w-4 text-foreground-secondary"
                        />
                      </div>
                      <input
                        id="base-url"
                        type="url"
                        value={baseUrl}
                        onChange={(e) => setBaseUrl(e.target.value)}
                        placeholder={selectedProvider.baseUrlPlaceholder}
                        disabled={isOffline || isSaving}
                        className="w-full bg-surface-secondary border border-border-default rounded-panel pl-10 pr-4 py-3 text-foreground-primary placeholder:text-foreground-secondary focus:outline-hidden focus:ring-2 focus:ring-border-active focus:border-transparent disabled:opacity-50 font_poppins font_body_2"
                      />
                    </div>
                    <p className="font_body_3 text-foreground-secondary">
                      The URL of your self-hosted endpoint (e.g.,
                      http://your-server:11434/v1)
                    </p>
                  </div>
                )}

                {/* API Key input */}
                <div className="space-y-2">
                  <label
                    htmlFor="api-key"
                    className="block font_ui_label text-foreground-secondary"
                  >
                    API Key{" "}
                    {selectedProvider.requiresApiKey ? (
                      <span className="text-signal-error-text">*</span>
                    ) : (
                      <span className="text-foreground-secondary font-normal">
                        (optional)
                      </span>
                    )}
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Icon
                        decorative
                        icon="key"
                        className="h-4 w-4 text-foreground-secondary"
                      />
                    </div>
                    <input
                      id="api-key"
                      type={showApiKey ? "text" : "password"}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder={selectedProvider.apiKeyPlaceholder}
                      disabled={isOffline || isSaving}
                      autoComplete="off"
                      className="w-full bg-surface-secondary border border-border-default rounded-panel pl-10 pr-12 py-3 text-foreground-primary placeholder:text-foreground-secondary focus:outline-hidden focus:ring-2 focus:ring-border-active focus:border-transparent disabled:opacity-50 font_poppins font_body_2"
                    />
                    <Button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-foreground-secondary hover:text-foreground-primary transition-colors"
                      aria-label={showApiKey ? "Hide API key" : "Show API key"}
                    >
                      {showApiKey ? (
                        <Icon decorative icon="eye-slash" className="h-4 w-4" />
                      ) : (
                        <Icon decorative icon="eye" className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <p className="font_body_3 text-foreground-secondary">
                    {selectedProvider.apiKeyHint}
                  </p>
                </div>

                {/* Model Name input */}
                <div className="space-y-2">
                  <label
                    htmlFor="model-name"
                    className="block font_ui_label text-foreground-secondary"
                  >
                    Model Name{" "}
                    {selectedProvider.requiresModelName ? (
                      <span className="text-signal-error-text">*</span>
                    ) : (
                      <span className="text-foreground-secondary font-normal">
                        (optional)
                      </span>
                    )}
                  </label>
                  <input
                    id="model-name"
                    type="text"
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                    placeholder={selectedProvider.modelPlaceholder}
                    disabled={isOffline || isSaving}
                    className="w-full bg-surface-secondary border border-border-default rounded-panel px-4 py-3 text-foreground-primary placeholder:text-foreground-secondary focus:outline-hidden focus:ring-2 focus:ring-border-active focus:border-transparent disabled:opacity-50 font_body_2"
                  />
                  <p className="font_body_3 text-foreground-secondary">
                    {selectedProvider.requiresModelName
                      ? "Required: specify which model to use on your endpoint."
                      : "Leave blank to use the default model."}
                  </p>
                </div>

                {/* Max response tokens — issue #554 fix for thinking
                    models. The platform-level default is 1200 (web)
                    / 800 (Telegram); raise this when running a model
                    that emits internal reasoning tokens. */}
                <div className="space-y-2">
                  <label
                    htmlFor="max-response-tokens"
                    className="block font_ui_label text-foreground-secondary"
                  >
                    Max response tokens{" "}
                    <span className="text-foreground-secondary font-normal">
                      (optional)
                    </span>
                  </label>
                  <input
                    id="max-response-tokens"
                    type="number"
                    inputMode="numeric"
                    min={256}
                    max={32768}
                    step={64}
                    value={maxResponseTokens}
                    onChange={(e) => setMaxResponseTokens(e.target.value)}
                    placeholder="1200 (default)"
                    disabled={isOffline || isSaving}
                    aria-describedby="max-response-tokens-hint"
                    className="w-full bg-surface-secondary border border-border-default rounded-panel px-4 py-3 text-foreground-primary placeholder:text-foreground-secondary focus:outline-hidden focus:ring-2 focus:ring-border-active focus:border-transparent disabled:opacity-50 font_body_2"
                  />
                  <p
                    id="max-response-tokens-hint"
                    className="font_body_3 text-foreground-secondary"
                  >
                    Per-response cap the AI is allowed to spend. Leave blank to
                    use the default.{" "}
                    <strong>If you&apos;re using a thinking model</strong>{" "}
                    (Qwen3, DeepSeek-R1, o1-style models), raise this to 4096 or
                    higher -- their internal reasoning tokens count against the
                    same budget, so the default can be exhausted before any
                    visible response is produced.
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Save button (only for non-subscription providers) */}
          {!isSubscription && (
            <Button
              onClick={handleSave}
              disabled={!canSave}
              title={
                isOffline
                  ? "Cannot save while disconnected"
                  : !canSave
                    ? "Fill in required fields first"
                    : undefined
              }
              className="w-full bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-accent-foreground font_ui_label rounded-panel px-4 py-3 transition-colors flex items-center justify-center gap-2"
              aria-label={
                isConfigured ? "Update AI provider" : "Save and validate"
              }
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
              {isConfigured ? "Update Configuration" : "Save & Validate"}
            </Button>
          )}
        </div>
      )}

      {/* Info card */}
      <div className="bg-surface-elevated rounded-panel p-4 border border-border-default">
        <div className="flex items-start gap-2">
          <Icon
            decorative
            icon="lightbulb"
            className="h-4 w-4 text-foreground-secondary mt-0.5 shrink-0"
          />
          <p className="font_body_3 text-foreground-secondary">
            Your credentials are encrypted before storage and only used to
            communicate with your chosen AI provider. We never share your
            credentials with third parties. The connection is validated before
            saving -- invalid configurations will not be stored.
          </p>
        </div>
      </div>
    </div>
  );
}
