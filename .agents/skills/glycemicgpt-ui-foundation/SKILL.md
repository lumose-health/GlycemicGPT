---
name: glycemicgpt-ui-foundation
description: Use when adding or changing GlycemicGPT web UI structure, shared styling, Tailwind classes, semantic theme tokens, typography, base primitives, product UI components, TextInput fields, Zod form validation, validation error interactions, icons, or color accessibility in apps/web.
---

# GlycemicGPT Web UI Foundation

Use this skill as a router to the canonical web UI foundation documentation.

Before acting, read:

1. `docs/dev/web-ui-foundation.md`
2. `docs/dev/color-accessibility.md` when changing text, surface, border, focus, status, accent, or signal color pairings
3. `AGENTS.md`, especially `Text Inputs And Validation`, when changing redesigned form fields, validation, or error behavior

Follow the ownership rules, component rules, and verification commands in `docs/dev/web-ui-foundation.md`.

## Text Inputs

Use the shared `TextInput` for redesigned form fields. Define validation in feature local Zod schemas and pass validation messages into the component. Treat the component and its tests as the source of truth for detailed behavior.

## Loading

Use the shared `LumoseLoadingLogo` for content loading states. Keep compact spinners for progress inside buttons.

## Authenticated V2 Scrolling

`AppShell` is fixed to the viewport and owns outer overflow. `DashboardLayout` owns the only vertical page scroller. Do not add `h-screen` or `min-h-screen` to authenticated V2 pages or nested page components. Fixed overlays are the exception because they do not participate in page layout.

Reuse the shared `Pagination` so page changes reset the persistent dashboard scroller. Do not add a second page scroller or document level scrolling inside the authenticated V2 shell.

## Class Composition

Use `twMerge` from `apps/web/src/lib/ui/twMerge.ts` for dynamic class composition in redesigned UI. Do not import or call `clsx`, `classnames`, or `tailwind-merge` directly in components. The local wrapper is the only component level class composition utility.
