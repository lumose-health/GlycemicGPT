"use client";

import { Suspense } from "react";

import { NightscoutOnboarding } from "@/components/integrations/NightscoutOnboarding";
import { LoadingState } from "@/components/LoadingState";

// Bookmark/refresh-resilient route for the smart-onboarding wizard.
// Step 4 (first sync) can take ~20s, so this is a real route rather
// than a modal -- losing the wizard mid-sync to an accidental Esc
// or click-outside would be bad UX.
//
// The wizard calls `useSearchParams()` to support the `?connection=<id>`
// re-import deep link. Next 15 requires that consumer
// to be inside a Suspense boundary; the fallback below is what the
// page shows during the static-shell render.
export default function NightscoutConnectPage() {
  return (
    <Suspense
      fallback={
        <LoadingState
          className="bg-surface-page"
          label="Loading Nightscout connection wizard..."
        />
      }
    >
      <NightscoutOnboarding />
    </Suspense>
  );
}
