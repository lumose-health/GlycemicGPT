"use client";

import { Button, Icon } from "@/base";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

import {
  generateTelegramCode,
  getTelegramBotConfig,
  getTelegramStatus,
  saveTelegramBotToken,
  removeTelegramBotToken,
  sendTelegramTestMessage,
  TelegramBotConfigResponse,
  TelegramStatusResponse,
  TelegramVerificationCodeResponse,
  unlinkTelegram,
} from "@/lib/api";
import { SettingsOfflineNotice } from "@/components/settings/SettingsOfflineNotice";
import { TextInput } from "@/components/TextInput";
import { LoadingState } from "@/components/LoadingState";
import { twMerge } from "@/lib/ui/twMerge";

type PageState = "loading" | "not_linked" | "code_generated" | "linked";

export default function TelegramSettingsPage() {
  const [pageState, setPageState] = useState<PageState>("loading");
  const [status, setStatus] = useState<TelegramStatusResponse | null>(null);
  const [codeData, setCodeData] =
    useState<TelegramVerificationCodeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [copied, setCopied] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  // Bot configuration state.
  const [botConfig, setBotConfig] = useState<TelegramBotConfigResponse | null>(
    null,
  );
  const [botToken, setBotToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [botActionLoading, setBotActionLoading] = useState(false);
  const [confirmRemoveBot, setConfirmRemoveBot] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const botConfigured = botConfig?.configured === true;

  const clearTimers = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, []);

  const fetchBotConfig = useCallback(async () => {
    try {
      const data = await getTelegramBotConfig();
      setBotConfig(data);
      return data;
    } catch {
      // If bot-config endpoint fails, treat as not configured
      setBotConfig({
        configured: false,
        bot_username: null,
        configured_at: null,
      });
      return null;
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await getTelegramStatus();
      setStatus(data);
      setIsOffline(false);
      if (data.linked) {
        setPageState("linked");
        clearTimers();
      } else if (pageState !== "code_generated") {
        setPageState("not_linked");
      }
    } catch (err) {
      const is401 = err instanceof Error && err.message.includes("401");
      const is503 = err instanceof Error && err.message.includes("503");
      if (!is401 && !is503) {
        setIsOffline(true);
      }
      // 503 means bot not configured - not an offline state
      if (is503) {
        setIsOffline(false);
      }
      if (pageState === "loading") {
        setPageState("not_linked");
      }
    }
  }, [clearTimers, pageState]);

  // Initial load
  useEffect(() => {
    const init = async () => {
      await fetchBotConfig();
      await fetchStatus();
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => clearTimers();
  }, [clearTimers]);

  const handleValidateToken = async () => {
    if (!botToken.trim()) return;
    setError(null);
    setSuccess(null);
    setBotActionLoading(true);

    try {
      const result = await saveTelegramBotToken(botToken.trim());
      if (result.valid) {
        setBotConfig({
          configured: true,
          bot_username: result.bot_username,
          configured_at: new Date().toISOString(),
        });
        setBotToken("");
        setSuccess(`Bot token validated! Connected as @${result.bot_username}`);
        // Re-fetch status now that bot is configured
        await fetchStatus();
      } else {
        setError(
          "Token validation failed. Please check the token and try again.",
        );
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to validate bot token",
      );
    } finally {
      setBotActionLoading(false);
    }
  };

  const handleRemoveBotToken = async () => {
    setError(null);
    setSuccess(null);
    setBotActionLoading(true);

    try {
      await removeTelegramBotToken();
      setBotConfig({
        configured: false,
        bot_username: null,
        configured_at: null,
      });
      setConfirmRemoveBot(false);
      setSuccess("Bot token removed.");
    } catch (err) {
      setConfirmRemoveBot(false);
      setError(
        err instanceof Error ? err.message : "Failed to remove bot token",
      );
    } finally {
      setBotActionLoading(false);
    }
  };

  const handleGenerateCode = async () => {
    setError(null);
    setSuccess(null);
    setActionLoading(true);

    try {
      const data = await generateTelegramCode();
      setCodeData(data);
      setPageState("code_generated");

      // Start countdown timer
      const expiresAt = new Date(data.expires_at).getTime();
      const updateCountdown = () => {
        const remaining = Math.max(
          0,
          Math.floor((expiresAt - Date.now()) / 1000),
        );
        setTimeLeft(remaining);
        if (remaining <= 0) {
          clearTimers();
          setPageState("not_linked");
          setCodeData(null);
          setError("Verification code expired. Please generate a new one.");
        }
      };
      updateCountdown();
      countdownRef.current = setInterval(updateCountdown, 1000);

      // Start polling for verification
      pollRef.current = setInterval(async () => {
        try {
          const statusData = await getTelegramStatus();
          if (statusData.linked) {
            setStatus(statusData);
            setPageState("linked");
            setSuccess("Telegram account linked successfully!");
            setCodeData(null);
            clearTimers();
          }
        } catch {
          // Silently ignore poll errors
        }
      }, 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate code");
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnlink = async () => {
    setError(null);
    setSuccess(null);
    setActionLoading(true);

    try {
      await unlinkTelegram();
      setStatus(null);
      setPageState("not_linked");
      setSuccess("Telegram account disconnected.");
      setConfirmDisconnect(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to unlink");
    } finally {
      setActionLoading(false);
    }
  };

  const handleTestMessage = async () => {
    setError(null);
    setSuccess(null);
    setActionLoading(true);

    try {
      await sendTelegramTestMessage();
      setSuccess("Test message sent! Check your Telegram.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to send test message",
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleCopyCode = async () => {
    if (!codeData) return;
    try {
      await navigator.clipboard.writeText(`/start ${codeData.code}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setSuccess("Select and copy the command manually.");
    }
  };

  const formatTimeLeft = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Back link */}
      <Link
        data-settings-back-link
        href="/settings/alarms-notification#delivery-channels"
        className="inline-flex items-center gap-2 text-foreground-secondary hover:text-foreground-primary transition-colors font_body_2"
      >
        <Icon decorative icon="chevron" className="h-4 w-4 rotate-180" />
        Back to Communications
      </Link>

      {/* Page header */}
      <div className="flex items-center gap-3" data-settings-page-header>
        <div className="p-3 bg-surface-secondary rounded-panel">
          <Icon
            decorative
            icon="chat-bubbles"
            className="h-6 w-6 text-accent"
          />
        </div>
        <div>
          <h1 className="font_poppins font_header_2">Telegram</h1>
          <p className="text-foreground-secondary font_body_2">
            Configure bot setup and link your Telegram account
          </p>
        </div>
      </div>

      {/* Offline banner */}
      {isOffline && (
        <SettingsOfflineNotice
          onRetry={async () => {
            setIsRetrying(true);
            await fetchBotConfig();
            await fetchStatus();
            setIsRetrying(false);
          }}
          isRetrying={isRetrying}
          message="Unable to connect to server. Telegram settings are unavailable."
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

      {/* ================================================================ */}
      {/* Step 1: Bot setup for administrators */}
      {/* ================================================================ */}
      <div className="bg-surface-primary rounded-panel p-6 border border-border-default space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon
              decorative
              icon="chat-bubbles"
              className="h-5 w-5 text-accent"
            />
            <h2 className="font_poppins font_header_4">Bot Setup</h2>
          </div>
          {botConfigured && (
            <span className="inline-flex items-center gap-1.5 bg-signal-check-fill/10 text-signal-check-text font_ui_caption px-2.5 py-1 rounded-pill">
              <Icon decorative icon="check" className="h-3.5 w-3.5" />
              Configured
            </span>
          )}
        </div>

        {botConfigured ? (
          /* Bot is configured - show status */
          <div className="space-y-4">
            <div className="bg-surface-secondary rounded-panel p-4 space-y-2">
              <div className="flex items-center justify-between font_body_2">
                <span className="text-foreground-primary">Bot Username</span>
                <span className="text-foreground-primary font_poppins">
                  @{botConfig.bot_username}
                </span>
              </div>
              {botConfig.configured_at && (
                <div className="flex items-center justify-between font_body_2">
                  <span className="text-foreground-primary">Configured On</span>
                  <span className="text-foreground-primary">
                    {new Date(botConfig.configured_at).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>

            {/* Remove bot token */}
            {!confirmRemoveBot ? (
              <Button
                onClick={() => setConfirmRemoveBot(true)}
                disabled={isOffline || botActionLoading}
                title={
                  isOffline
                    ? "Cannot remove token while disconnected"
                    : undefined
                }
                className="w-full text-signal-error-text hover:text-signal-error-text disabled:opacity-50 disabled:cursor-not-allowed font_body_2 transition-colors flex items-center justify-center gap-2 py-2"
                aria-label="Remove bot token"
              >
                <Icon decorative icon="trash" className="h-4 w-4" />
                Remove Bot Token
              </Button>
            ) : (
              <div className="bg-signal-error-fill/10 border border-signal-error-text rounded-panel p-4 space-y-3">
                <p className="text-signal-error-text font_body_2">
                  Are you sure? Removing the bot token will disable all Telegram
                  notifications.
                </p>
                <div className="flex gap-2">
                  <Button
                    onClick={handleRemoveBotToken}
                    disabled={botActionLoading}
                    className="flex-1 bg-surface-fixed-critical hover:opacity-90 disabled:opacity-50 text-foreground-fixed-light font_ui_label rounded-panel px-3 py-2 transition-colors"
                  >
                    {botActionLoading ? (
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
                    onClick={() => setConfirmRemoveBot(false)}
                    className="flex-1 bg-surface-secondary hover:bg-surface-secondary text-foreground-primary font_ui_label rounded-panel px-3 py-2 transition-colors"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Bot is NOT configured - show setup form */
          <div className="space-y-4">
            <p className="text-foreground-secondary font_body_2">
              A Telegram bot token is required before users can link their
              accounts. Create a bot via{" "}
              <span className="text-foreground-primary font_poppins">
                @BotFather
              </span>{" "}
              on Telegram to get a token.
            </p>

            <div className="space-y-3">
              <h3 className="font_ui_label text-foreground-secondary">
                How to get a bot token:
              </h3>
              <ol className="list-decimal list-inside space-y-2 font_body_2 text-foreground-secondary">
                <li>
                  Open Telegram and search for{" "}
                  <span className="text-foreground-primary font_poppins">
                    @BotFather
                  </span>
                </li>
                <li>
                  Send{" "}
                  <span className="font_poppins text-foreground-primary">
                    /newbot
                  </span>{" "}
                  and follow the prompts
                </li>
                <li>Copy the bot token provided by BotFather</li>
                <li>Paste it below and click &quot;Validate Token&quot;</li>
              </ol>
            </div>

            {/* Token input */}
            <div className="space-y-2">
              <TextInput
                disabled={isOffline}
                id="bot-token"
                label="Bot Token"
                leadingAdornment={
                  <Icon
                    decorative
                    icon="key"
                    className="h-4 w-4 text-foreground-secondary"
                  />
                }
                onChange={(e) => setBotToken(e.target.value)}
                placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyz"
                trailingAdornment={
                  <Button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="flex items-center text-foreground-secondary transition-colors hover:text-foreground-primary"
                    aria-label={showToken ? "Hide token" : "Show token"}
                  >
                    <Icon
                      decorative
                      icon={showToken ? "eye-slash" : "eye"}
                      className="h-4 w-4"
                    />
                  </Button>
                }
                type={showToken ? "text" : "password"}
                value={botToken}
              />
            </div>

            {/* Validate button */}
            <Button
              onClick={handleValidateToken}
              disabled={!botToken.trim() || botActionLoading || isOffline}
              title={
                isOffline
                  ? "Cannot validate token while disconnected"
                  : !botToken.trim()
                    ? "Enter a bot token first"
                    : undefined
              }
              className="w-full bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-accent-foreground font_ui_label rounded-panel px-4 py-3 transition-colors flex items-center justify-center gap-2"
              aria-label="Validate bot token"
            >
              {botActionLoading ? (
                <Icon
                  decorative
                  icon="clock"
                  className="h-4 w-4 animate-spin"
                />
              ) : (
                <Icon decorative icon="check" className="h-4 w-4" />
              )}
              Validate Token
            </Button>
          </div>
        )}
      </div>

      {/* ================================================================ */}
      {/* Step 2: Account Linking (User) */}
      {/* ================================================================ */}

      {/* Loading state */}
      {pageState === "loading" && (
        <LoadingState
          className="min-h-0 rounded-panel border border-border-default bg-surface-primary p-8"
          label="Loading Telegram settings..."
        />
      )}

      {/* Bot not configured warning */}
      {!botConfigured && pageState !== "loading" && (
        <div className="bg-signal-warning-fill/10 border border-signal-warning-text rounded-panel px-4 py-3 font_body_2 text-signal-warning-text">
          Telegram bot not configured. An administrator must set up the bot
          token first before accounts can be linked.
        </div>
      )}

      {/* Not linked state */}
      {pageState === "not_linked" && (
        <div
          className={twMerge(
            "bg-surface-primary rounded-panel p-6 border border-border-default space-y-6",
            !botConfigured && "opacity-60 pointer-events-none",
          )}
          aria-disabled={!botConfigured}
        >
          <div className="space-y-4">
            <h2 className="font_poppins font_header_4">
              Connect Your Telegram Account
            </h2>
            <p className="text-foreground-secondary font_body_2">
              Link your Telegram account to receive glucose alerts and
              notifications directly in Telegram.
            </p>
          </div>

          <div className="space-y-3">
            <h3 className="font_ui_label text-foreground-secondary">
              How it works:
            </h3>
            <ol className="list-decimal list-inside space-y-2 font_body_2 text-foreground-secondary">
              <li>
                Click &quot;Generate Code&quot; below to get a verification code
              </li>
              <li>
                Open Telegram and search for{" "}
                {status?.bot_username || botConfig?.bot_username ? (
                  <span className="text-foreground-primary font_poppins">
                    @{status?.bot_username || botConfig?.bot_username}
                  </span>
                ) : (
                  "the Lumose bot"
                )}
              </li>
              <li>
                Send the command{" "}
                <span className="font_poppins text-foreground-primary">
                  /start YOUR_CODE
                </span>{" "}
                to the bot
              </li>
            </ol>
          </div>

          <Button
            onClick={handleGenerateCode}
            disabled={actionLoading || isOffline || !botConfigured}
            title={
              isOffline
                ? "Cannot generate code while disconnected"
                : !botConfigured
                  ? "Bot must be configured first"
                  : undefined
            }
            className="w-full bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-accent-foreground font_ui_label rounded-panel px-4 py-3 transition-colors flex items-center justify-center gap-2"
            aria-label="Generate verification code"
          >
            {actionLoading ? (
              <Icon decorative icon="clock" className="h-4 w-4 animate-spin" />
            ) : (
              <Icon decorative icon="chat-bubbles" className="h-4 w-4" />
            )}
            Generate Code
          </Button>
        </div>
      )}

      {/* Code generated state */}
      {pageState === "code_generated" && codeData && (
        <div className="bg-surface-primary rounded-panel p-6 border border-border-default space-y-6">
          <div className="space-y-2">
            <h2 className="font_poppins font_header_4">Verification Code</h2>
            <p className="text-foreground-secondary font_body_2">
              Send this command to{" "}
              <span className="text-foreground-primary font_poppins">
                @{codeData.bot_username}
              </span>{" "}
              on Telegram:
            </p>
          </div>

          {/* Code display */}
          <div className="bg-surface-secondary rounded-panel p-4 flex items-center justify-between gap-3">
            <code className="font_header_2 font_poppins text-foreground-primary select-all">
              /start {codeData.code}
            </code>
            <Button
              onClick={handleCopyCode}
              className="p-2 hover:bg-surface-secondary rounded-panel transition-colors text-foreground-primary hover:text-foreground-primary shrink-0"
              aria-label="Copy command to clipboard"
            >
              {copied ? (
                <Icon
                  decorative
                  icon="check"
                  className="h-5 w-5 text-signal-check-text"
                />
              ) : (
                <Icon decorative icon="copy" className="h-5 w-5" />
              )}
            </Button>
          </div>

          {/* Countdown */}
          <div className="flex items-center justify-between font_body_2">
            <span className="text-foreground-secondary">
              Code expires in{" "}
              <span
                className={twMerge(
                  "font_poppins",
                  timeLeft <= 60
                    ? "text-signal-error-text"
                    : "text-foreground-primary",
                )}
              >
                {formatTimeLeft(timeLeft)}
              </span>
            </span>
            <span className="text-foreground-secondary flex items-center gap-1">
              <Icon decorative icon="clock" className="h-3 w-3" />
              Waiting for verification...
            </span>
          </div>
          <span
            aria-atomic="true"
            aria-live="polite"
            className="sr-only"
            role="status"
          >
            Code expires in{" "}
            {timeLeft <= 60
              ? "less than one minute"
              : `${Math.ceil(timeLeft / 60)} minutes`}
            . Waiting for verification.
          </span>

          {/* Cancel */}
          <Button
            onClick={() => {
              clearTimers();
              setPageState("not_linked");
              setCodeData(null);
            }}
            className="w-full text-foreground-secondary hover:text-foreground-primary font_body_2 transition-colors"
          >
            Cancel
          </Button>
        </div>
      )}

      {/* Linked state */}
      {pageState === "linked" && status?.link && (
        <div className="space-y-4">
          {/* Connection status card */}
          <div className="bg-surface-primary rounded-panel p-6 border border-border-default space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font_poppins font_header_4">Connection Status</h2>
              <span className="inline-flex items-center gap-1.5 bg-signal-check-fill/10 text-signal-check-text font_ui_caption px-2.5 py-1 rounded-pill">
                <Icon decorative icon="check" className="h-3.5 w-3.5" />
                Connected
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 font_body_2">
              {status.link.username && (
                <div>
                  <span className="text-foreground-secondary">Username</span>
                  <p className="text-foreground-primary font_poppins mt-0.5">
                    @{status.link.username}
                  </p>
                </div>
              )}
              <div>
                <span className="text-foreground-secondary">Linked</span>
                <p className="text-foreground-primary mt-0.5">
                  {new Date(status.link.linked_at).toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="bg-surface-primary rounded-panel p-6 border border-border-default space-y-3">
            <h2 className="font_poppins font_header_4">Actions</h2>

            <Button
              onClick={handleTestMessage}
              disabled={actionLoading || isOffline}
              title={
                isOffline
                  ? "Cannot send test message while disconnected"
                  : undefined
              }
              className="w-full bg-surface-secondary hover:bg-surface-secondary disabled:opacity-50 disabled:cursor-not-allowed text-foreground-primary font_ui_label rounded-panel px-4 py-3 transition-colors flex items-center justify-center gap-2"
              aria-label="Send test message"
            >
              {actionLoading ? (
                <Icon
                  decorative
                  icon="clock"
                  className="h-4 w-4 animate-spin"
                />
              ) : (
                <Icon decorative icon="share" className="h-4 w-4" />
              )}
              Send Test Message
            </Button>

            {!confirmDisconnect ? (
              <Button
                onClick={() => setConfirmDisconnect(true)}
                disabled={isOffline}
                title={
                  isOffline
                    ? "Cannot disconnect while disconnected from server"
                    : undefined
                }
                className="w-full text-signal-error-text hover:text-signal-error-text disabled:opacity-50 disabled:cursor-not-allowed font_body_2 transition-colors flex items-center justify-center gap-2 py-2"
                aria-label="Disconnect Telegram"
              >
                <Icon decorative icon="circle-slash" className="h-4 w-4" />
                Disconnect Telegram
              </Button>
            ) : (
              <div className="bg-signal-error-fill/10 border border-signal-error-text rounded-panel p-4 space-y-3">
                <p className="text-signal-error-text font_body_2">
                  Are you sure? You will stop receiving Telegram notifications.
                </p>
                <div className="flex gap-2">
                  <Button
                    onClick={handleUnlink}
                    disabled={actionLoading}
                    className="flex-1 bg-surface-fixed-critical hover:opacity-90 disabled:opacity-50 text-foreground-fixed-light font_ui_label rounded-panel px-3 py-2 transition-colors"
                  >
                    Yes, Disconnect
                  </Button>
                  <Button
                    onClick={() => setConfirmDisconnect(false)}
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
    </div>
  );
}
