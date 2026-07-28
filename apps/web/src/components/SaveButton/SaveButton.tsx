import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Icon } from "@/base/Icon";
import { PrimaryButton } from "@/components/PrimaryButton";
import { twMerge } from "@/lib/ui/twMerge";

import type { SaveButtonProps } from "./saveButton.types";

const SAVED_FEEDBACK_DURATION_MS = 3000;
const LABEL_RESIZE_DURATION_MS = 300;

type LabelMode = "idle" | "saved" | "saving";

interface LabelWidths {
  idle?: number;
  saved?: number;
  saving?: number;
}

interface SaveButtonLabelProps {
  label: ReactNode;
  mode: LabelMode;
  savedLabel: ReactNode;
  savingLabel: ReactNode;
}

function SaveButtonLabel({
  label,
  mode,
  savedLabel,
  savingLabel,
}: SaveButtonLabelProps) {
  const idleLabelRef = useRef<HTMLSpanElement>(null);
  const savedLabelRef = useRef<HTMLSpanElement>(null);
  const savingLabelRef = useRef<HTMLSpanElement>(null);
  const [displayedMode, setDisplayedMode] = useState(mode);
  const [widthMode, setWidthMode] = useState(mode);
  const [isDisplayedLabelVisible, setIsDisplayedLabelVisible] = useState(true);
  const [labelWidths, setLabelWidths] = useState<LabelWidths>({});

  useLayoutEffect(() => {
    const nextLabelWidths = {
      idle: idleLabelRef.current?.getBoundingClientRect().width,
      saved: savedLabelRef.current?.getBoundingClientRect().width,
      saving: savingLabelRef.current?.getBoundingClientRect().width,
    };

    setLabelWidths((currentLabelWidths) => {
      if (
        currentLabelWidths.idle === nextLabelWidths.idle &&
        currentLabelWidths.saved === nextLabelWidths.saved &&
        currentLabelWidths.saving === nextLabelWidths.saving
      ) {
        return currentLabelWidths;
      }

      return nextLabelWidths;
    });
  }, [label, savedLabel, savingLabel]);

  useEffect(() => {
    if (mode === displayedMode && mode === widthMode) return;

    setIsDisplayedLabelVisible(false);
    setWidthMode(mode);

    const prefersReducedMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const timeout = window.setTimeout(
      () => {
        setDisplayedMode(mode);
        setIsDisplayedLabelVisible(true);
      },
      prefersReducedMotion ? 0 : LABEL_RESIZE_DURATION_MS,
    );

    return () => window.clearTimeout(timeout);
  }, [displayedMode, mode, widthMode]);

  const targetWidth = labelWidths[widthMode];
  const labelContainerStyle: CSSProperties | undefined =
    targetWidth && targetWidth > 0 ? { width: targetWidth } : undefined;
  const getLabelClassName = (labelMode: LabelMode) =>
    twMerge(
      "whitespace-nowrap transition-opacity duration-300 ease-in-out motion-reduce:transition-none",
      displayedMode === labelMode && isDisplayedLabelVisible
        ? "opacity-100"
        : "opacity-0",
    );

  return (
    <span aria-live="polite">
      <span
        className="relative inline-block overflow-hidden align-middle transition-[width] duration-300 ease-in-out motion-reduce:transition-none"
        style={labelContainerStyle}
      >
        <span
          aria-hidden={mode !== "idle"}
          className={getLabelClassName("idle")}
          ref={idleLabelRef}
        >
          {label}
        </span>
        <span
          aria-hidden={mode !== "saving"}
          className={twMerge(
            "absolute left-0 top-1/2 -translate-y-1/2",
            getLabelClassName("saving"),
          )}
          ref={savingLabelRef}
        >
          {savingLabel}
        </span>
        <span
          aria-hidden={mode !== "saved"}
          className={twMerge(
            "absolute left-0 top-1/2 inline-flex -translate-y-1/2 items-center gap-2",
            getLabelClassName("saved"),
          )}
          ref={savedLabelRef}
        >
          <Icon className="h-4 w-4" decorative icon="check" />
          {savedLabel}
        </span>
      </span>
    </span>
  );
}

export function SaveButton({
  className,
  disabled,
  label = "Save Changes",
  savedLabel = "Saved",
  savingLabel = "Saving...",
  state,
  type = "submit",
  ...props
}: SaveButtonProps) {
  const [hasSavedFeedbackExpired, setHasSavedFeedbackExpired] = useState(false);
  const isSaving = state === "saving";
  const isSaved = state === "saved" && !hasSavedFeedbackExpired;
  const labelMode: LabelMode = isSaving
    ? "saving"
    : isSaved
      ? "saved"
      : "idle";

  useEffect(() => {
    if (state !== "saved") {
      setHasSavedFeedbackExpired(false);
      return;
    }

    const timeout = window.setTimeout(
      () => setHasSavedFeedbackExpired(true),
      SAVED_FEEDBACK_DURATION_MS,
    );

    return () => window.clearTimeout(timeout);
  }, [state]);

  return (
    <PrimaryButton
      {...props}
      aria-busy={isSaving || undefined}
      className={twMerge(
        "transition-[color,background-color,border-color,opacity] duration-300 ease-in-out motion-reduce:transition-none",
        isSaved &&
          "border-signal-check-text bg-surface-primary text-signal-check-text shadow-none hover:border-signal-check-text disabled:cursor-default disabled:opacity-100",
        className,
      )}
      disabled={disabled || isSaving || isSaved}
      type={type}
    >
      <SaveButtonLabel
        label={label}
        mode={labelMode}
        savedLabel={savedLabel}
        savingLabel={savingLabel}
      />
    </PrimaryButton>
  );
}
