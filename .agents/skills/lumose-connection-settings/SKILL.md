---
name: lumose-connection-settings
description: Build, migrate, or review Lumose connection settings in apps/web. Use when adding or changing CGM, insulin pump, cloud, or third party connection tabs, connection accordions, Source Status Updated rows, credential forms, connected summaries, freshness labels, status presentation, connection guidance, validation, privacy behavior, or shared connection settings components.
---

# Lumose Connection Settings

Build connection settings from the shared Lumose components while preserving each integration contract.

## Read First

1. Read `../glycemicgpt-ui-foundation/SKILL.md`.
2. Read `../lumose-web-settings/SKILL.md`.
3. Read `docs/dev/web-ui-foundation.md`.
4. Read `docs/dev/color-accessibility.md` when changing colors, surfaces, borders, text, focus, or status presentation.
5. Inspect the target integration component, API types, API calls, mock handlers, and focused tests before editing.
6. Use `apps/web/src/components/integrations/cgm-integrations-section.tsx` as the current complete reference.

## Shared Component Contract

Reuse these components instead of rebuilding their presentation:

1. Use `ConnectionSettingsList` from `apps/web/src/components/integrations/ConnectionSettings` once around a group of connections. It owns the Source, Status, and Updated column labels.
2. Use `ConnectionSettingsAccordion` for each connection. Pass the display name, shared sprite icon, normalized status, last update timestamp, and body content.
3. Use `ConnectionInfoCallout` for setup guidance. Put it first in the disconnected body.
4. Use `TextInput` for text and email credentials.
5. Use `PasswordTextInput` for password credentials and visibility controls.
6. Use `SelectField` for ordinary selects.
7. Use `SettingsReadOnlyValue` for connected metadata that cannot be edited.
8. Use `ConnectionSettingsForm` for submit, offline, error, and confirmed disconnect behavior.
9. Keep `IntegrationCard` only for legacy integrations until they migrate to `ConnectionSettingsForm`.
10. Use shared button, icon, feedback, and status components when an equivalent exists.

Improve the shared component when a repeated need is not covered. Do not add a vendor specific copy of shared layout, freshness formatting, password visibility, status styling, or information callout markup.

## Page And Accordion Structure

1. Keep the Connections page divided into CGM integrations, Insulin pumps, and Third party integrations.
2. Keep the selected tab in the public URL query so links can open the relevant tab directly.
3. Do not repeat the active tab name as a heading inside the tab.
4. Start every connection accordion collapsed inside the tab.
5. Show Source, Status, and Updated above the accordion rows.
6. Put the approved shared sprite icon immediately before the source name.
7. Use the product name users recognize. Include supported model families when useful, such as `Dexcom G6/G7`.
8. Keep the accordion header visible as the persistent summary. Do not repeat its source name, status, icon, or freshness inside the body.
9. Use the shared panel surface pattern. The accordion header uses the secondary surface and the body uses the elevated surface.
10. Keep the body free of a redundant inner panel border and outer card padding.
11. Add body top spacing when content would otherwise touch the header divider.

## Header Metadata

1. Normalize integration states to connected, disconnected, pending, or error for the shared header.
2. Show status once in the header.
3. Render a disconnected status as plain text without pill padding so it aligns with the Status column.
4. Render connected, pending, and error states with semantic signal tokens and visible text.
5. Use the shared relative freshness formatter.
6. Show the elapsed value without repeating the word Updated.
7. Render `-` when no update timestamp exists.
8. Keep status and freshness useful while the accordion is collapsed.

## Disconnected State

1. Put `ConnectionInfoCallout` first when vendor setup steps must happen before connection.
2. Use a concise heading such as Before connecting and a suitable shared sprite icon.
3. Use semantic information signal tokens. Do not add raw palette colors or theme variants.
4. Stack related credentials vertically.
5. Place a secondary selector beside the credential column on desktop when that improves scanning. Stack it naturally on smaller screens.
6. Constrain field widths when full width fields reduce readability.
7. Define validation in a feature local Zod schema.
8. Pass validation messages into the shared fields.
9. Validate before calling the connection API.
10. Remove resolved visible errors as the user corrects each field.
11. Preserve offline, loading, failure, submit, and retry behavior.

## Connected State

1. Hide credential inputs, region or country selectors, setup guidance, and credential update actions unless the user explicitly enters an edit flow.
2. Show useful nonsecret connection metadata already available from the active connection.
3. Prefer region, country, account type, server, sync mode, and masked account identity.
4. Use `SettingsReadOnlyValue` rather than disabled inputs.
5. Keep disconnect available and preserve its confirmation behavior.
6. Never add plaintext credential storage just to display account information.
7. If a masked identifier is valuable, derive it from already stored encrypted credentials at response time or return an existing safe backend field.
8. Never expose passwords, tokens, API secrets, or full account identifiers.

## Behavior Ownership

1. Keep API calls, payload construction, persistence, refetches, and vendor rules in the page, feature hook, or integration component.
2. Keep shared connection components presentational.
3. Preserve connection testing before credential persistence when the integration supports it.
4. Preserve backend validation, encryption, error reporting, manual sync, disconnect, and cleanup semantics.
5. Update API contracts, mocks, and tests together when response metadata changes.
6. Keep mock behavior behind the development only mock service.

## Icons And Styling

1. Use `Icon` and the shared sprite for redesigned connection UI.
2. Do not add Lucide icons to the settings surface.
3. Use semantic surface, foreground, border, accent, and signal utilities.
4. Use complete typography roles.
5. Use `rounded-panel` and `rounded-button`.
6. Use the local `twMerge` wrapper for dynamic classes.
7. Do not add raw palette utilities or `dark:*` variants to migrated connection UI.

## Implementation Workflow

1. Write or extend focused regression tests for the current behavior.
2. Normalize the integration data into the shared status and freshness contract.
3. Replace duplicated header and body presentation with shared connection components.
4. Move reusable password, select, callout, or metadata behavior into the appropriate shared component.
5. Keep vendor copy, schemas, fields, and API actions local.
6. Verify disconnected, connected, pending, error, loading, offline, and confirmation states that the integration supports.
7. Verify the tab URL, collapsed default, keyboard interaction, mobile layout, desktop layout, and every supported semantic theme.
8. Run `npm test`, `npm run typecheck`, and `npm run build` from `apps/web`.
