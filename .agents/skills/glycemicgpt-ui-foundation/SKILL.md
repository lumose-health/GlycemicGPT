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
