"use client";

import { useEffect, useRef, useState } from "react";

import { Icon } from "@/base";
import { Checkbox } from "@/components/Checkbox";
import { HighlightButton } from "@/components/HighlightButton";
import {
  acknowledgeDisclaimer,
  getDisclaimerContent,
  getDisclaimerStatus,
  type DisclaimerContent,
} from "@/lib/api";
import { normalizeDisclaimerBrand } from "@/lib/disclaimer-brand";
import { getSessionId } from "@/lib/session";

import type { PublicDisclaimerModalProps } from "./PublicDisclaimerModal.types";
import {
  createCheckboxState,
  FALLBACK_DISCLAIMER_CONTENT,
} from "./disclaimer-content";

export function PublicDisclaimerModal({
  onAcknowledge,
}: PublicDisclaimerModalProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState<DisclaimerContent>(
    FALLBACK_DISCLAIMER_CONTENT,
  );
  const [checkboxes, setCheckboxes] = useState<Record<string, boolean>>(() =>
    createCheckboxState(FALLBACK_DISCLAIMER_CONTENT),
  );

  useEffect(() => {
    let cancelled = false;

    async function loadDisclaimer() {
      const sessionId = getSessionId();

      if (!sessionId) {
        if (!cancelled) setIsLoading(false);
        return;
      }

      try {
        const [status, disclaimerContent] = await Promise.all([
          getDisclaimerStatus(sessionId),
          getDisclaimerContent(),
        ]);

        if (cancelled) return;

        const brandedContent = normalizeDisclaimerBrand(disclaimerContent);
        setContent(brandedContent);
        setCheckboxes(createCheckboxState(brandedContent));
        setIsOpen(!status.acknowledged);
      } catch {
        let disclaimerContent = FALLBACK_DISCLAIMER_CONTENT;

        try {
          disclaimerContent = await getDisclaimerContent();
        } catch {
          disclaimerContent = FALLBACK_DISCLAIMER_CONTENT;
        }

        if (cancelled) return;

        const brandedContent = normalizeDisclaimerBrand(disclaimerContent);
        setContent(brandedContent);
        setCheckboxes(createCheckboxState(brandedContent));
        setIsOpen(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadDisclaimer();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    titleRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  if (isLoading || !isOpen) return null;

  const allChecked =
    Object.keys(checkboxes).length > 0 &&
    Object.values(checkboxes).every(Boolean);

  const handleAccept = async () => {
    if (!allChecked) return;

    const sessionId = getSessionId();
    if (!sessionId) {
      setError(
        "Your session could not be created. Refresh the page and try again.",
      );
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await acknowledgeDisclaimer({
        session_id: sessionId,
        checkbox_experimental: checkboxes.checkbox_experimental ?? false,
        checkbox_not_medical_advice:
          checkboxes.checkbox_not_medical_advice ?? false,
        checkbox_ai_data_flow: checkboxes.checkbox_ai_data_flow ?? false,
      });
      setIsOpen(false);
      onAcknowledge?.();
    } catch (acknowledgmentError) {
      setError(
        acknowledgmentError instanceof Error
          ? acknowledgmentError.message
          : "The acknowledgment could not be saved. Try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay-primary p-3 backdrop-blur-xs sm:p-6">
      <section
        aria-labelledby="public-disclaimer-title"
        aria-modal="true"
        className="flex max-h-[calc(100vh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-panel border border-border-default bg-surface-primary text-foreground-primary shadow-2xl"
        role="dialog"
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-border-default bg-surface-secondary px-4 py-4 sm:px-6 sm:py-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-panel bg-surface-primary text-signal-warning-text">
            <Icon className="h-6 w-6" decorative icon="alert" />
          </span>
          <div className="min-w-0">
            <p className="font_metric_label text-signal-warning-text">
              SAFETY REVIEW
            </p>
            <h2
              className="font_poppins font_header_3 mt-1 outline-none"
              id="public-disclaimer-title"
              ref={titleRef}
              tabIndex={-1}
            >
              {content.title}
            </h2>
          </div>
        </header>

        <div className="overflow-y-auto px-4 pb-5 pt-8 sm:px-6 sm:pb-6 sm:pt-8">
          <p className="font_poppins font_body_2 max-w-2xl text-foreground-secondary">
            Review every item before using Lumose. This software supports
            informed conversations. It does not replace clinical judgment.
          </p>

          <ol className="mt-5 grid gap-3 sm:grid-cols-2">
            {content.warnings.map((warning, index) => (
              <li
                className="rounded-panel border border-border-default bg-surface-elevated p-4"
                key={`${warning.title}-${index}`}
              >
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="font_metric_caption flex h-7 w-7 shrink-0 items-center justify-center rounded-panel border border-border-default bg-surface-primary"
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0">
                    <h3 className="font_poppins font_body_2 text-foreground-primary">
                      {warning.title}
                    </h3>
                    <p className="font_poppins font_body_3 mt-1 text-foreground-primary">
                      {warning.text}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ol>

          <fieldset className="mt-6 space-y-3 border-t border-border-default pt-5">
            <legend className="font_poppins font_header_4 mb-3 text-foreground-primary">
              Confirm your understanding
            </legend>
            {content.checkboxes.map((checkbox) => (
              <Checkbox
                checked={checkboxes[checkbox.id] ?? false}
                disabled={isSubmitting}
                key={checkbox.id}
                label={checkbox.label}
                labelClassName="font_poppins font_body_3 text-foreground-secondary"
                onCheckedChange={(checked) => {
                  setCheckboxes((current) => ({
                    ...current,
                    [checkbox.id]: checked,
                  }));
                  setError(null);
                }}
              />
            ))}
          </fieldset>

          {error ? (
            <p
              className="font_poppins font_body_3 mt-4 text-signal-error-text"
              role="alert"
            >
              {error}
            </p>
          ) : null}
        </div>

        <footer className="shrink-0 border-t border-border-default bg-surface-primary px-4 py-4 sm:px-6">
          <HighlightButton
            className="w-full"
            disabled={!allChecked || isSubmitting}
            onClick={handleAccept}
          >
            {isSubmitting ? "Saving acknowledgment..." : content.button_text}
          </HighlightButton>
        </footer>
      </section>
    </div>
  );
}
