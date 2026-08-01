"use client";

import { Suspense } from "react";

import { Icon } from "@/base";
import { NightscoutOnboardingWizard } from "@/components/integrations/nightscout-onboarding-wizard";

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
        <div
          role="status"
          aria-live="polite"
          className="min-h-screen bg-surface-page flex items-center justify-center"
        >
          <Icon
            decorative
            icon="clock"
            className="h-6 w-6 text-accent animate-spin"
            aria-hidden="true"
          />
          <span className="sr-only">Loading Nightscout connection wizard…</span>
        </div>
      }
    >
      <NightscoutOnboardingWizard />
    </Suspense>
  );
}
