"use client";

import { useRef, useState } from "react";
import { Input } from "@/base/Input";
import { HighlightButton } from "@/components/HighlightButton";
import { MealErrorPanel } from "@/components/MealDetails";
import {
  compressImageToJpeg,
  ImageCompressionError,
} from "@/lib/image-compress";
import { classifyMealError, type MealErrorInfo } from "@/lib/meal-errors";
import { uploadFoodRecord } from "@/lib/api";
import type { MealUploadProps } from "./MealUpload.types";

const ACCEPT = "image/jpeg,image/png,image/webp";

export function MealUpload({
  onFeatureOff,
  onUploaded,
}: MealUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [errorInfo, setErrorInfo] = useState<MealErrorInfo | null>(null);

  async function handleFile(file: File) {
    setErrorInfo(null);
    setBusy(true);
    try {
      const blob = await compressImageToJpeg(file);
      onUploaded(await uploadFoodRecord(blob));
    } catch (error) {
      if (error instanceof ImageCompressionError) {
        setErrorInfo({
          kind: "unsupported_image",
          message: error.message,
          retryable: true,
          title: "Couldn't use that photo",
        });
      } else {
        const info = classifyMealError(error);
        setErrorInfo(info);
        if (info.kind === "feature_off") onFeatureOff?.();
      }
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-3">
      <Input
        accept={ACCEPT}
        aria-label="Choose a meal photo"
        className="hidden"
        data-testid="meal-file-input"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
        }}
        ref={inputRef}
        type="file"
      />
      <HighlightButton
        data-testid="meal-upload-button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? (
          <>
            <span
              aria-hidden="true"
              className="h-4 w-4 animate-spin rounded-pill border-2 border-accent-foreground/30 border-t-accent-foreground"
              data-testid="meal-uploading"
            />
            Estimating carbs…
          </>
        ) : (
          "Log a meal"
        )}
      </HighlightButton>

      {errorInfo ? (
        <MealErrorPanel
          info={errorInfo}
          onDismiss={
            errorInfo.retryable ? () => setErrorInfo(null) : undefined
          }
        />
      ) : null}
    </div>
  );
}
