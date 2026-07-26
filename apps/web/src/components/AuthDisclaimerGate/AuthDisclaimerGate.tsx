"use client";

/**
 * Story 15.5: Auth Disclaimer Gate
 *
 * Blocks dashboard access until the authenticated user acknowledges
 * the safety disclaimer. Wraps children and shows a blocking overlay
 * when user.disclaimer_acknowledged is false.
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FlaskConical,
  Brain,
  ShieldOff,
  Stethoscope,
  AlertTriangle,
  Camera,
  Cloud,
} from "lucide-react";
import { Checkbox } from "@/components/Checkbox";
import { HighlightButton } from "@/components/HighlightButton";
import { useUserContext } from "@/providers/user-provider";
import {
  acknowledgeDisclaimerAuth,
  getDisclaimerContent,
  type DisclaimerContent,
} from "@/lib/api";
import type { AuthDisclaimerGateProps } from "./AuthDisclaimerGate.types";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  flask: FlaskConical,
  brain: Brain,
  "shield-x": ShieldOff,
  stethoscope: Stethoscope,
  cloud: Cloud,
  camera: Camera,
};

function LoadingState() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-page">
      <div role="status">
        <span
          aria-label="Loading"
          className="block h-8 w-8 animate-spin rounded-full border-2 border-accent border-r-transparent"
        />
      </div>
    </div>
  );
}

export function AuthDisclaimerGate({
  children,
}: AuthDisclaimerGateProps) {
  const { user, isLoading, refreshUser } = useUserContext();
  const [content, setContent] = useState<DisclaimerContent | null>(null);
  const [checkboxes, setCheckboxes] = useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(true);

  const needsDisclaimer = !isLoading && user && !user.disclaimer_acknowledged;

  // Fetch disclaimer content when the gate determines it's needed
  useEffect(() => {
    if (!needsDisclaimer) {
      setContentLoading(false);
      return;
    }

    async function fetchContent() {
      try {
        const disclaimerContent = await getDisclaimerContent();
        setContent(disclaimerContent);
        const initialCheckboxes: Record<string, boolean> = {};
        disclaimerContent.checkboxes.forEach((cb) => {
          initialCheckboxes[cb.id] = false;
        });
        setCheckboxes(initialCheckboxes);
      } catch {
        // Use fallback content on error
        setContent(null);
        setCheckboxes({
          checkbox_experimental: false,
          checkbox_not_medical_advice: false,
          checkbox_ai_data_flow: false,
        });
      } finally {
        setContentLoading(false);
      }
    }

    fetchContent();
  }, [needsDisclaimer]);

  // While user is loading, show a centered spinner (don't flash the modal)
  if (isLoading) {
    return <LoadingState />;
  }

  // User acknowledged or no user (will be handled by auth redirect)
  if (!needsDisclaimer) {
    return <>{children}</>;
  }

  // Loading disclaimer content
  if (contentLoading) {
    return <LoadingState />;
  }

  const handleCheckboxChange = (id: string, checked: boolean) => {
    setCheckboxes((prev) => ({
      ...prev,
      [id]: checked,
    }));
    setError(null);
  };

  const allChecked =
    Object.keys(checkboxes).length > 0 &&
    Object.values(checkboxes).every(Boolean);

  const handleAccept = async () => {
    if (!allChecked) {
      setError("Please check all acknowledgment boxes to continue");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await acknowledgeDisclaimerAuth();
      await refreshUser();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to save acknowledgment. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Fallback content if API failed. Mirror the server /content payload
  // (src/routers/disclaimer.py) so a fetch failure still shows the current
  // version and the photo-carb warning -- keep this in sync on every bump.
  const displayContent: DisclaimerContent = content ?? {
    version: "1.2",
    title: "Important Safety Information",
    warnings: [
      {
        icon: "flask",
        title: "Experimental Software",
        text: "This is experimental open-source software. It has not been validated for clinical use and may contain bugs or errors.",
      },
      {
        icon: "brain",
        title: "AI Limitations",
        text: "AI can and will make mistakes. All suggestions should be verified with your healthcare provider before acting on them.",
      },
      {
        icon: "camera",
        title: "Photo Carb Estimates Are Guesses",
        text: "If you use the meal-photo feature, the carbohydrate numbers are AI estimates from an image and are frequently wrong -- including misidentifying the food entirely. They are a rough starting point only. Never use a photo carb estimate to calculate an insulin dose or bolus, and always verify carbs yourself before dosing.",
      },
      {
        icon: "shield-x",
        title: "Not FDA Approved",
        text: "This software is not FDA approved for medical use. It is not intended to diagnose, treat, cure, or prevent any disease.",
      },
      {
        icon: "stethoscope",
        title: "Consult Your Healthcare Provider",
        text: "Always consult your healthcare provider before making any changes to your diabetes management regimen.",
      },
      {
        icon: "cloud",
        title: "AI Data Processing",
        text:
          "GlycemicGPT is BYOAI -- you choose the AI provider. If you configure a cloud-hosted AI provider, your glucose, insulin, pump, and therapy data will be transmitted to that provider's servers for analysis, subject to their data-handling policy. If you configure a local AI provider running on your own infrastructure, your data stays on your network. Review your chosen provider's policy before configuring it.",
      },
    ],
    checkboxes: [
      {
        id: "checkbox_experimental",
        label:
          "I understand this is experimental software and that AI suggestions may be incorrect",
      },
      {
        id: "checkbox_not_medical_advice",
        label:
          "I understand this is not medical advice and I will consult my healthcare provider before making any changes",
      },
      {
        id: "checkbox_ai_data_flow",
        label:
          "I understand that configuring a cloud-hosted AI provider transmits my health data to that provider, and that only local AI providers keep my data on my own network",
      },
    ],
    button_text: "I Understand & Accept",
  };

  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-overlay-primary backdrop-blur-xs"
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: "spring", duration: 0.5 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div
          className="flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-panel border border-border-default bg-surface-primary text-foreground-primary shadow-2xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="disclaimer-title"
        >
          {/* Header */}
          <header className="flex shrink-0 items-center gap-3 border-b border-border-default bg-surface-secondary px-4 py-3 text-foreground-primary sm:px-5">
            <AlertTriangle className="h-5 w-5 shrink-0 text-signal-warning-text" />
            <h2
              id="disclaimer-title"
              className="font_poppins font_header_4 text-foreground-primary"
            >
              {displayContent.title}
            </h2>
          </header>

          {/* Content */}
          <div className="min-h-0 overflow-y-auto bg-surface-primary p-4 sm:p-5">
            <div className="divide-y divide-border-default">
              {displayContent.warnings.map((warning, index) => {
                const Icon = iconMap[warning.icon] || AlertTriangle;
                return (
                  <motion.div
                    key={warning.title}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-3 py-4 first:pt-0 last:pb-0"
                  >
                    <Icon className="mt-0.5 h-5 w-5 text-signal-warning-text" />
                    <div className="min-w-0">
                      <h3 className="font_poppins font_body_2 text-foreground-primary">
                        {warning.title}
                      </h3>
                      <p className="font_poppins font_body_3 mt-1 text-foreground-secondary">
                        {warning.text}
                      </p>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Checkboxes */}
            <section
              aria-labelledby="disclaimer-acknowledgments-title"
              className="mt-5 border-t border-border-default pt-4"
            >
              <h3
                className="font_metric_label text-foreground-primary"
                id="disclaimer-acknowledgments-title"
              >
                Required acknowledgments
              </h3>
              <div className="mt-3 space-y-3">
                {displayContent.checkboxes.map((checkbox) => (
                  <Checkbox
                    checked={checkboxes[checkbox.id] ?? false}
                    key={checkbox.id}
                    label={checkbox.label}
                    labelClassName="font_poppins font_body_3 w-full text-foreground-primary"
                    onCheckedChange={(checked) =>
                      handleCheckboxChange(checkbox.id, checked)
                    }
                  />
                ))}
              </div>
            </section>

            {/* Error */}
            {error && (
              <p
                aria-live="polite"
                className="font_body_3 mt-4 text-signal-error-text"
                role="alert"
              >
                {error}
              </p>
            )}
          </div>

          {/* Footer */}
          <footer className="shrink-0 border-t border-border-default bg-surface-elevated px-4 py-3 sm:px-5">
            <HighlightButton
              className="w-full"
              onClick={handleAccept}
              disabled={!allChecked || isSubmitting}
            >
              {isSubmitting ? "Saving..." : displayContent.button_text}
            </HighlightButton>
          </footer>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
