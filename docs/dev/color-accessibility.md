---
title: Color Accessibility Guide
description: Approved semantic color pairings and contrast rules for GlycemicGPT web UI.
---

# Color Accessibility Guide

This guide defines approved color pairings for the current web UI foundation.

## Baseline Rules

1. The default light and dark themes should pass WCAG AA. See [WCAG 2.2 conformance](https://www.w3.org/WAI/WCAG22/Understanding/conformance).
2. Normal text needs at least `4.5:1` contrast. See [WCAG 1.4.3 Contrast Minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).
3. Large text needs at least `3:1` contrast. See [WCAG 1.4.3 Contrast Minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).
4. Important icons, borders, selected states, and controls need at least `3:1` contrast against adjacent colors. See [WCAG 1.4.11 Non Text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).
5. Focus indicators must be visible and should keep at least `3:1` contrast against adjacent colors. See [WCAG 2.4.7 Focus Visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html) and [WCAG 2.4.13 Focus Appearance](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html).
6. High contrast mode is an enhancement. It is not a reason to ship known contrast failures in the default theme. See [WCAG conforming alternate versions](https://www.w3.org/WAI/WCAG22/Understanding/conformance#conforming-alt-versions).
7. Do not rely on color alone for state, status, or medical meaning. See [WCAG 1.4.1 Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html).
8. Use semantic utilities first. Do not use raw Tailwind palette classes for shared UI.
9. If a pairing is not listed here, calculate contrast before using it.

## Current Tokens

```text
Light surfaces:
--color-surface-page: #ffffff
--color-surface-primary: #ffffff
--color-surface-secondary: #e6e8e6
--color-surface-tertiary: #ced0ce
--color-surface-elevated: #f7f9fb
--color-surface-fixed-dark: #000000
--color-surface-fixed-critical: #cd1d0c

Dark surfaces:
--color-surface-page: #20242a
--color-surface-primary: #20242a
--color-surface-secondary: #343a42
--color-surface-tertiary: #59636f
--color-surface-elevated: #292f36
--color-surface-fixed-dark: #000000
--color-surface-fixed-critical: #cd1d0c

Dark 1 surfaces:
--color-surface-page: #172126
--color-surface-primary: #172126
--color-surface-secondary: #263941
--color-surface-tertiary: #3a5861
--color-surface-elevated: #1f2d34
--color-surface-fixed-dark: #000000
--color-surface-fixed-critical: #cd1d0c

Dark 2 surfaces:
--color-surface-page: #3a414b
--color-surface-primary: #3a414b
--color-surface-secondary: #5f6266
--color-surface-tertiary: #949ea8
--color-surface-elevated: #464d57
--color-surface-fixed-dark: #000000
--color-surface-fixed-critical: #cd1d0c

Dark 3 surfaces:
Same as Dark surfaces.

Foreground:
--color-foreground-primary: #191919 in light, #f6f8fa in dark
--color-foreground-secondary: #767676 in light, #c4cbd3 in dark
--color-foreground-muted: #ced0ce in light, #707982 in dark
--color-foreground-fixed-light: #ffffff

Dark 1 foreground:
--color-foreground-primary: #f3fbfb
--color-foreground-secondary: #bad0d6
--color-foreground-muted: #617a83

Dark 2 foreground:
--color-foreground-primary: #ffffff
--color-foreground-secondary: #a7b0ba
--color-foreground-muted: #5f6266

Dark 3 foreground:
Same as Dark foreground.

Light accent:
--color-accent: #5eb1ff
--color-accent-hover: #4da8ff
--color-accent-foreground: #191919

Dark accent:
--color-accent: #118dff
--color-accent-hover: #36a4ff
--color-accent-foreground: #14212a

Dark 1 accent:
--color-accent: #7df2d8
--color-accent-hover: #9ff7e4
--color-accent-foreground: #102326

Dark 2 accent:
--color-accent: #5eb1ff
--color-accent-hover: #70bdff
--color-accent-foreground: #191919

Dark 3 accent:
--color-accent: #ff932e
--color-accent-hover: #fea42f
--color-accent-foreground: #14212a

Theme adaptive brand gradient:
--color-brand-gradient-start, --color-brand-gradient-middle, --color-brand-gradient-end
Light: #20c9ff, #5eb1ff, #064dff
Dark: #62b9ff, #118dff, #0457a5
Dark 1: #b4ffef, #7df2d8, #1aa88f
Dark 2: #20c9ff, #5eb1ff, #064dff
Dark 3: #fea42f, #ff932e, #fe5e2d

Theme adaptive brand highlight:
--color-brand-highlight
Light: #b7ddff
Dark: #62b9ff
Dark 1: #d9fff7
Dark 2: #d6f3ff
Dark 3: #ffe2b8

Overlay:
--color-overlay-primary: rgba(0, 0, 0, 0.50) in light and rgba(0, 0, 0, 0.30) in dark themes
--color-overlay-subtle: rgba(0, 0, 0, 0.25) in every theme

Signal:
--color-signal-partial-fill: #6f53ca in light, #bbaee6 in dark
--color-signal-partial-text: #6f53ca in light, #e5e0ff in dark
--color-signal-info-fill: #2b7272 in light, #65c5c5 in dark
--color-signal-info-text: #2b7272 in light, #a5f3f3 in dark
--color-signal-check-fill: #2a7643 in light, #34d399 in dark
--color-signal-check-text: #2a7643 in light, #34d399 in dark
--color-signal-warning-fill: #f8c129 in light, #f6a61d in dark
--color-signal-warning-text: #b24600 in light, #ffe08a in dark
--color-signal-error-fill: #cd1d0c in light, #ff8a80 in dark
--color-signal-error-text: #cd1d0c in light, #ff8a80 in dark

Dark 2 signal differences:
--color-signal-check-fill: #67c987
--color-signal-check-text: #a7f3c0
--color-signal-error-fill: #e94b3a
--color-signal-error-text: #ffd9d5

Dark 3 signals:
Same as Dark signals.

Glucose forecast chart data:
--color-data-glucose-forecast: #6f53ca in light, #bbaee6 in dark

Insulin chart data:
--color-data-insulin-basal: #2563eb in light, #60a5fa in dark
--color-data-insulin-bolus: #1d4ed8 in light, #93c5fd in dark
--color-data-insulin-correction: #b24600 in light, #f6a61d in dark
--color-data-insulin-automated: #1e3a8a in light, #bfdbfe in dark
--color-data-insulin-mode-sleep: #6f53ca in light, #bbaee6 in dark
--color-data-insulin-mode-exercise: #b24600 in light, #ffe08a in dark
```

## Light Theme Pairings

Approved for normal text:

1. `bg-surface-page` or `bg-surface-primary` with `text-foreground-primary`: `17.58:1`.
2. `bg-surface-page` or `bg-surface-primary` with `text-foreground-secondary`: `4.54:1`.
3. `bg-surface-secondary` with `text-foreground-primary`: `14.27:1`.
4. `bg-surface-tertiary` with `text-foreground-primary`: `11.33:1`.
5. `bg-surface-elevated` with `text-foreground-primary`: `16.66:1`.
6. `bg-accent` with `text-accent-foreground`: `7.71:1`.
7. `bg-accent-hover` with `text-accent-foreground`: `7.00:1`.
8. `bg-surface-fixed-dark` with `text-foreground-fixed-light`: `21:1`.

Allowed only for large text or non text UI:

1. `bg-surface-secondary` with `text-foreground-secondary`: `3.69:1`.
2. `bg-surface-elevated` with `text-foreground-secondary`: `4.30:1`.

Not approved for readable text:

1. `bg-surface-page` or `bg-surface-primary` with `text-foreground-muted`: `1.55:1`.
2. `bg-accent` with white text: `2.28:1`.

## Dark Theme Pairings

Approved for normal text:

1. `bg-surface-page` or `bg-surface-primary` with `text-foreground-primary`: `14.64:1`.
2. `bg-surface-page` or `bg-surface-primary` with `text-foreground-secondary`: `9.52:1`.
3. `bg-surface-secondary` with `text-foreground-primary`: `10.78:1`.
4. `bg-surface-elevated` with `text-foreground-primary`: `12.69:1`.
5. `bg-accent` with `text-accent-foreground`: `4.90:1`.
6. `bg-accent-hover` with `text-accent-foreground`: `6.18:1`.
7. `bg-surface-fixed-dark` with `text-foreground-fixed-light`: `21:1`.

Not approved for readable text:

1. `text-foreground-muted` remains for disabled, decorative, or non essential text only.
2. `bg-surface-tertiary` should not host normal body text with the current semantic foreground tokens.
3. Do not put white text on `bg-accent`.

## Dark 1 Theme Pairings

Approved for normal text:

1. `bg-surface-page` or `bg-surface-primary` with `text-foreground-primary`: `15.60:1`.
2. `bg-surface-page` or `bg-surface-primary` with `text-foreground-secondary`: `10.20:1`.
3. `bg-surface-secondary` with `text-foreground-primary`: `11.47:1`.
4. `bg-surface-elevated` with `text-foreground-primary`: `13.49:1`.
5. `bg-accent` with `text-accent-foreground`: `12.06:1`.
6. `bg-accent-hover` with `text-accent-foreground`: `13.10:1`.
7. `bg-surface-fixed-dark` with `text-foreground-fixed-light`: `21:1`.

Not approved for readable text:

1. `text-foreground-muted` remains for disabled, decorative, or non essential text only.
2. `bg-surface-tertiary` should not host normal body text with the current semantic foreground tokens.
3. Do not put white text on `bg-accent`.

## Dark 2 Theme Pairings

Approved for normal text:

1. `bg-surface-page` or `bg-surface-primary` with `text-foreground-primary`: `10.31:1`.
2. `bg-surface-page` or `bg-surface-primary` with `text-foreground-secondary`: `4.69:1`.
3. `bg-surface-page` or `bg-surface-primary` with `text-accent`: `4.52:1`.
4. `bg-surface-secondary` with `text-foreground-primary`: `6.13:1`.
5. `bg-surface-elevated` with `text-foreground-primary`: `8.54:1`.
6. `bg-accent` with `text-accent-foreground`: `7.71:1`.
7. `bg-accent-hover` with `text-accent-foreground`: `8.72:1`.
8. `bg-surface-fixed-dark` with `text-foreground-fixed-light`: `21:1`.

Allowed only for large text or non text UI:

1. `bg-surface-tertiary` with `text-foreground-inverse`: `3.79:1`.
2. `bg-surface-elevated` with `text-foreground-secondary`: `3.89:1`.

Not approved for readable text:

1. `bg-surface-page` or `bg-surface-primary` with `text-foreground-muted`: `1.68:1`.
2. `bg-surface-secondary` with `text-foreground-secondary`: `2.79:1`.
3. `bg-accent` with white text: `2.28:1`.

## Dark 3 Theme Pairings

Dark 3 uses the same neutral surfaces, foregrounds, borders, signals, overlays, and insulin data colors as Dark. Only its accent and brand gradient colors differ.

Approved for normal text:

1. `bg-surface-page` or `bg-surface-primary` with `text-foreground-primary`: `14.64:1`.
2. `bg-surface-page` or `bg-surface-primary` with `text-foreground-secondary`: `9.52:1`.
3. `bg-surface-secondary` with `text-foreground-primary`: `10.78:1`.
4. `bg-surface-elevated` with `text-foreground-primary`: `12.69:1`.
5. `bg-surface-page` or `bg-surface-primary` with `text-accent`: `7.03:1`.
6. `bg-surface-secondary` with `text-accent`: `5.17:1`.
7. `bg-surface-elevated` with `text-accent`: `6.09:1`.
8. `bg-accent` with `text-accent-foreground`: `7.39:1`.
9. `bg-accent-hover` with `text-accent-foreground`: `8.25:1`.
10. `bg-surface-fixed-dark` with `text-foreground-fixed-light`: `21:1`.

Not approved for readable text:

1. `text-foreground-muted` remains for disabled, decorative, or non essential text only.
2. `bg-surface-tertiary` with `text-accent`: `2.75:1`.
3. `bg-accent` with white text: `2.22:1`.
4. `bg-accent-hover` with white text: `1.99:1`.

## Accent Rules

1. Use `bg-accent text-accent-foreground` for selected tabs, primary filled controls, checked controls, and highlight surfaces with text inside.
2. Do not put white text on `bg-accent`.
3. Use white text on dark surfaces for primary copy.
4. Use `text-foreground-secondary` for secondary paragraphs and labels on `bg-surface-page` or `bg-surface-primary`.
5. Do not use `text-accent` for paragraph copy. Use it for short emphasis only when the background is `bg-surface-page` or `bg-surface-primary`.

## Brand Color Rules

1. Use the brand gradient tokens only for branded visual assets such as the Lumose logo.
2. The middle stop matches the active accent in every theme. The start and end stops provide visible tonal separation.
3. Use `brand-highlight` for bright, narrow animation highlights in branded visual assets.
4. Do not use the brand colors for text, controls, status, or medical meaning.

## Surface Rules

1. `bg-surface-page` and `bg-surface-primary` can host normal text with primary and secondary foreground colors in every documented theme.
2. `bg-surface-secondary` can host normal text only with `text-foreground-primary` in every documented theme.
3. `bg-surface-elevated` can host normal text only with `text-foreground-primary` in every documented theme.
4. `bg-surface-tertiary` should not host normal body text in dark mode with the current semantic foreground tokens.
5. `text-foreground-muted` is for disabled, decorative, or non essential text only. Do not use it for labels, paragraphs, form hints, or critical metadata.
6. `bg-surface-fixed-critical` with `text-foreground-fixed-light` has `5.56:1` contrast and is approved for normal text in every documented theme.

## Signal Color Rules

1. Use `*-fill` signal tokens for backgrounds, badges, indicators, chart areas, and alert surfaces.
2. Use `*-text` signal tokens for signal-colored text and icons on neutral surfaces.
3. Use only the documented foreground color for text and icons placed directly on matching signal fill backgrounds.
4. Do not use a fill token as body text unless its exact background pairing has been checked.
5. Light theme signal text tokens pass normal text contrast on page, primary, and secondary surfaces. They pass non text contrast on tertiary.
6. Dark theme signal text tokens pass normal text contrast on page, primary, and secondary surfaces. They are not approved on tertiary.
7. Do not rely on color alone for medical or safety critical meaning. Pair signal color with text, icon shape, or label. See [WCAG 1.4.1 Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html).

## Insulin Chart Color Rules

1. Use the `data-insulin-*` tokens only for insulin data marks and their legends.
2. Pair each color with its documented marker shape and visible label. Color alone must not identify a dose type.
3. Light theme tokens have at least `5.17:1` contrast against the primary surface. The orange auto correction token has `5.57:1` contrast.
4. Dark theme tokens have at least `4.05:1` contrast against the primary surface. The orange auto correction token has at least `5.10:1` contrast.
5. Sleep mode uses the documented partial signal palette values and Exercise mode uses the documented warning text palette values, each with normal text contrast against its matching primary surface.
6. Text drawn inside an outlined insulin mark uses `foreground-primary` on `surface-primary`. Sleep and Exercise intervals are paired with labeled legend entries so color is not the only distinction.
7. Manual boluses and auto corrections use the glucose marker rotated upward, with the marker tip aligned to the exact dose value. Manual boluses are blue and auto corrections are orange. Collision detection may move a marker horizontally while keeping its dose value alignment and connecting it to the exact event position. If every marker cannot fit without overlap, use the distinct bar colors instead. Dose hover details show the exact event timestamp.

## Glucose Forecast Chart Color Rules

1. Use `data-glucose-forecast` only for imported algorithm forecast curves and their legends.
2. Render the curve with a dashed stroke and a visible source label so color is not the only distinction.
3. The light theme value has `5.58:1` contrast against the primary surface.
4. The dark theme values have at least `5.06:1` contrast against the primary surface.

## Signal Contrast Reference

Light theme signal text on neutral surfaces:

1. `signal-partial-text`: `5.58:1` on page or primary, `4.53:1` on secondary, `3.59:1` on tertiary.
2. `signal-info-text`: `5.60:1` on page or primary, `4.54:1` on secondary, `3.61:1` on tertiary.
3. `signal-check-text`: `5.57:1` on page or primary, `4.52:1` on secondary, `3.59:1` on tertiary.
4. `signal-warning-text`: `5.57:1` on page or primary, `4.52:1` on secondary, `3.59:1` on tertiary.
5. `signal-error-text`: `5.56:1` on page or primary, `4.51:1` on secondary, `3.58:1` on tertiary.

Light theme signal fills with documented foreground:

1. `signal-partial-fill` with white text: `5.58:1`.
2. `signal-info-fill` with white text: `5.60:1`.
3. `signal-check-fill` with white text: `5.57:1`.
4. `signal-warning-fill` with ink text: `10.59:1`.
5. `signal-error-fill` with white text: `5.56:1`.

Dark theme signal text on neutral surfaces:

1. `signal-partial-text`: `12.20:1` on page or primary, `8.98:1` on secondary, `4.78:1` on tertiary, `10.58:1` on elevated.
2. `signal-info-text`: `12.41:1` on page or primary, `9.13:1` on secondary, `4.86:1` on tertiary, `10.75:1` on elevated.
3. `signal-check-text`: `8.11:1` on page or primary, `5.97:1` on secondary, `3.18:1` on tertiary, `7.03:1` on elevated.
4. `signal-warning-text`: `12.09:1` on page or primary, `8.90:1` on secondary, `4.73:1` on tertiary, `10.48:1` on elevated.
5. `signal-error-text`: `6.83:1` on page or primary, `5.03:1` on secondary, `2.67:1` on tertiary, `5.92:1` on elevated.

Dark theme signal fills with documented foreground:

1. `signal-partial-fill` with ink text: `8.63:1`.
2. `signal-info-fill` with ink text: `8.66:1`.
3. `signal-check-fill` with ink text: `9.15:1`.
4. `signal-warning-fill` with ink text: `8.70:1`.
5. `signal-error-fill` with ink text: `7.70:1`.

Dark 2 theme signal text on neutral surfaces:

1. `signal-partial-text`: `8.07:1` on page or primary, `4.80:1` on secondary, `2.13:1` on tertiary.
2. `signal-info-text`: `8.20:1` on page or primary, `4.88:1` on secondary, `2.17:1` on tertiary.
3. `signal-check-text`: `7.96:1` on page or primary, `4.74:1` on secondary, `2.10:1` on tertiary.
4. `signal-warning-text`: `7.99:1` on page or primary, `4.75:1` on secondary, `2.11:1` on tertiary.
5. `signal-error-text`: `7.92:1` on page or primary, `4.71:1` on secondary, `2.09:1` on tertiary.

Dark 2 theme signal fills with documented foreground:

1. `signal-partial-fill` with ink text: `8.63:1`.
2. `signal-info-fill` with ink text: `8.66:1`.
3. `signal-check-fill` with ink text: `8.61:1`.
4. `signal-warning-fill` with ink text: `8.70:1`.
5. `signal-error-fill` with ink text: `4.63:1`.

## Agent Workflow

1. Start with the semantic pairing listed above.
2. If the pair is not listed, calculate the contrast ratio before coding.
3. If the pair fails, change the semantic mapping or add a narrowly justified semantic token.
4. Do not solve a shared UI contrast problem with a local raw color class.
5. Update this guide when shared token values or approved pairings change.

## WCAG References

1. [WCAG 2.2 Conformance](https://www.w3.org/WAI/WCAG22/Understanding/conformance)
2. [WCAG 1.4.1 Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html)
3. [WCAG 1.4.3 Contrast Minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
4. [WCAG 1.4.11 Non Text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)
5. [WCAG 2.4.7 Focus Visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html)
6. [WCAG 2.4.13 Focus Appearance](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html)
