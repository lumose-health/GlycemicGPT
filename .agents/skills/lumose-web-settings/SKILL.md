---
name: lumose-web-settings
description: Build, migrate, review, or refactor Lumose web settings pages under apps/web/src/app/v2/(authenticated)/settings and their shared controls and settings components. Use for settings page layout, headers, sections, rows, form fields, selects, text areas, accordions, switches, feedback messages, status badges, read only values, destructive actions, settings routing, and settings visual or behavior preservation.
---

# Lumose Web Settings

Use this skill to migrate the current settings surface onto the Lumose UI foundation without changing how any setting works.

## Read First

1. Read `../glycemicgpt-ui-foundation/SKILL.md`.
2. Read `docs/dev/web-ui-foundation.md`.
3. Read `docs/dev/color-accessibility.md` when working with text, surfaces, borders, focus, accent, feedback, status, or signal colors.
4. Inspect the target page, its tests, its API calls, and any related parent or subordinate routes before editing.

## Preserve Behavior

Treat the behavior of every current `/settings` page as the compatibility contract.

1. Preserve API calls, request payloads, validation, save timing, loading states, failure states, confirmations, side effects, and navigation outcomes.
2. Preserve immediate saving where the current setting saves immediately.
3. Preserve explicit saving for grouped forms, credentials, thresholds, safety limits, and other reviewed changes.
4. Keep persistence and business logic in pages or feature hooks. Reusable controls must not decide when or how data is saved.
5. Add focused regression tests before restructuring behavior that lacks coverage.
6. Do not combine unrelated behavior refactors with a visual migration.

## Page Structure

Use the `Appearance` page as the initial visual reference.

1. Wrap every top level page in a reusable `SettingsPage` component.
2. Let `SettingsPage` own centered `mx-auto w-full max-w-5xl` content and the shared vertical rhythm.
3. Let individual forms constrain their inner width when needed. Do not change the page alignment or outer width.
4. Use a reusable `SettingsPageHeader` for the page title and description.
5. Reuse each top level page's sidebar navigation icon as a large decorative semantic accent beside the title.
6. Use a reusable `SettingsSection` for section heading level, optional description, spacing, and semantic structure.
7. Keep routine sections borderless. Use panels only for genuinely distinct warnings, connection summaries, destructive areas, or similar content.
8. Use a reusable `SettingsRow` with a label, optional description, and trailing control or read only value.
9. Align controls in a consistent right column capped around 24rem on desktop. Stack label content above controls on small screens.
10. Allow complex content to span the full section width when a compact row would harm usability.

Place settings specific components in `apps/web/src/components/settings`. Do not use `settings-new` as the permanent component namespace.

## Shared Component Boundary

Keep broadly useful product controls in `apps/web/src/components`. Keep only settings composition in `apps/web/src/components/settings`.

The shared product control set should cover:

1. `FormField` for visible labels, helper text, required or optional text, and validation errors.
2. `TextInput`, refactored to share the `FormField` presentation contract when appropriate.
3. A native select based field for ordinary option lists.
4. A native text area based field for multiline input.
5. `Accordion` with accessible controlled and uncontrolled state.
6. `Switch` for one boolean value with native checkbox behavior and switch semantics.
7. `FeedbackMessage` for transient success, error, warning, and offline feedback.
8. `StatusBadge` for persistent states such as connected, pending, disabled, and failed.
9. `DestructiveButton` for destructive actions.

The settings component set should cover:

1. `SettingsPage`.
2. `SettingsPageHeader`.
3. `SettingsSection`.
4. `SettingsRow`.
5. A semantic read only label and value display.

Before adding a component, search for an existing equivalent and improve it when that preserves its current consumers. Add a thin neutral primitive in `apps/web/src/base` only when the native element needs a shared accessible shell. Build product appearance and behavior in `apps/web/src/components`.

## Control Rules

1. Build controls from native HTML and existing base primitives. Do not add a UI component library for this work.
2. Use native `select` for ordinary option lists. Introduce a custom combobox only when search, grouped options, or rich option content is required.
3. Use one `Switch` concept for boolean state. Use native radio semantics or a selector for mutually exclusive choices.
4. Permit multiple accordion items to remain open at once.
5. Keep routine settings visible. Use accordions only for optional, advanced, or explanatory content.
6. Advanced accordion content may start collapsed. Never hide critical warnings, current status, primary controls, or destructive consequences by default.
7. Use a semantic read only display instead of a disabled input for values that cannot be edited.
8. Add an explicit copy action for copyable identifiers or secrets.
9. Separate transient feedback from persistent status. Do not create one component that tries to represent both concepts.
10. Put destructive actions in a clearly separated final section and require confirmation. Preserve any stronger confirmation already present.
11. Ensure labels, descriptions, errors, focus, keyboard behavior, names, roles, and values remain accessible.

## Routing Rules

Settings navigation has one page level only.

1. Keep the top level navigation ordered as `Account`, `Connections`, `AI & Insight`, `Glucose & Insulin`, `Alarms & Notifications`, `Care & Sharing`, `Data & Privacy`, and `Appearance`.
2. Keep related configuration inside its owning top level page using accordions, expandable rows, dialogs, or inline flows.
3. Keep account information, personal information, and password settings in `Account`.
4. Keep glucose display units, glucose ranges, insulin action, and safety limits in `Glucose & Insulin`.
5. Keep alert triggers, daily briefs, delivery channels, and Telegram configuration in `Alarms & Notifications`.
6. Keep emergency contacts, caregiver invitations, linked caregivers, and caregiver permissions in `Care & Sharing`.
7. Keep Dexcom, Tandem, Nightscout, CGM source selection, and forecast source selection in `Connections`.
8. Keep Meal Intelligence, AI provider configuration, and research sources in `AI & Insight`.
9. Keep storage, retention, analytics boundaries, exports, reports, and data deletion in `Data & Privacy`.
10. Retain redirects from obsolete routes while old links may still exist.
11. Keep `/v2` internal. Settings links and redirects must use public `/settings` URLs.

## Styling And Icons

1. Use semantic theme utilities and complete typography roles from the UI foundation.
2. Remove raw palette utilities and `dark:*` variants from every migrated page.
3. Use the local `twMerge` wrapper for class composition. Do not use `clsx`, `classnames`, or `tailwind-merge` directly.
4. Do not import `lucide-react` anywhere in the settings surface.
5. Use the shared sprite `Icon` when an approved icon exists. Omit the icon until a Lumose icon is added when the sprite has no suitable symbol.
6. Add only icons required by current work and follow the sprite registration and accessibility rules in the UI foundation.
7. Verify shared components in every supported semantic theme.

## Migration Workflow

1. Build and test the shared component foundation first.
2. Migrate `Appearance` onto the shared page, header, and section components so it remains the reference implementation.
3. Migrate `Profile` next because it exercises the largest useful portion of the component foundation.
4. Use the consolidated top level pages as composition shells for existing behavior boundaries.
5. Migrate one behavior boundary or settings section at a time inside its owning page.
6. Finish regression tests, accessibility checks, responsive checks, and visual checks for the current section before starting another section.
7. Fold subordinate flows into their owning page when that section is migrated.
8. Avoid rewriting multiple settings forms at once.

## Verification

For shared components, test meaningful rendering, accessible labels and attributes, keyboard behavior, state changes, emitted events, and class composition.

For every migrated page:

1. Verify the preserved behavior contract with focused tests.
2. Check mobile and desktop layouts.
3. Check every supported semantic theme.
4. Check loading, empty, success, error, offline, disabled, and destructive states that the page supports.
5. Reuse the web app on port `3003` according to `AGENTS.md` for browser verification.
6. Run `npm test`, `npm run typecheck`, and `npm run build` from `apps/web` before considering the page complete.
