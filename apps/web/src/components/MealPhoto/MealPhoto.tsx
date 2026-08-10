"use client";

import { useEffect, useState } from "react";
import { MealPhotoPlaceholder } from "@/components/MealDetails";
import { fetchFoodRecordPhotoObjectUrl } from "@/lib/api";
import { twMerge } from "@/lib/ui/twMerge";
import type { MealPhotoProps } from "./MealPhoto.types";

export function MealPhoto({ recordId, size = "sm" }: MealPhotoProps) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    setUrl(null);

    fetchFoodRecordPhotoObjectUrl(recordId)
      .then((resolved) => {
        if (active) {
          objectUrl = resolved;
          setUrl(resolved);
        } else if (typeof URL.revokeObjectURL === "function") {
          URL.revokeObjectURL(resolved);
        }
      })
      .catch(() => {
        // Keep the neutral placeholder visible when no photo is available.
      });

    return () => {
      active = false;
      if (objectUrl && typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [recordId]);

  if (!url) return <MealPhotoPlaceholder size={size} />;

  const dimensions = size === "lg" ? "h-56 w-full" : "h-16 w-16";

  return (
    // eslint-disable-next-line @next/next/no-img-element -- credentialed blob URL.
    <img
      alt="Meal photo"
      className={twMerge(
        dimensions,
        "shrink-0 rounded-panel bg-surface-secondary object-cover",
      )}
      data-testid="meal-photo"
      src={url}
    />
  );
}
