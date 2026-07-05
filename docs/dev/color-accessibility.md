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

Dark surfaces:
--color-surface-page: #3a414b
--color-surface-primary: #3a414b
--color-surface-secondary: #5f6266
--color-surface-tertiary: #949ea8
--color-surface-elevated: #464d57
--color-surface-fixed-dark: #000000

Light 1 surfaces:
--color-surface-page: #f4fbfb
--color-surface-primary: #ffffff
--color-surface-secondary: #dcefed
--color-surface-tertiary: #bfdad8
--color-surface-elevated: #eef6ff
--color-surface-fixed-dark: #000000

Light 2 surfaces:
--color-surface-page: #fbfaf6
--color-surface-primary: #ffffff
--color-surface-secondary: #ebe7dc
--color-surface-tertiary: #d1cab8
--color-surface-elevated: #f3f7fb
--color-surface-fixed-dark: #000000

Dark 1 surfaces:
--color-surface-page: #172126
--color-surface-primary: #172126
--color-surface-secondary: #263941
--color-surface-tertiary: #3a5861
--color-surface-elevated: #1f2d34
--color-surface-fixed-dark: #000000

Dark 2 surfaces:
--color-surface-page: #20242a
--color-surface-primary: #20242a
--color-surface-secondary: #343a42
--color-surface-tertiary: #59636f
--color-surface-elevated: #292f36
--color-surface-fixed-dark: #000000

Foreground:
--color-foreground-primary: #191919 in light, #ffffff in dark
--color-foreground-secondary: #767676 in light, #a7b0ba in dark
--color-foreground-muted: #ced0ce in light, #5f6266 in dark
--color-foreground-fixed-light: #ffffff

Light 1 foreground:
--color-foreground-primary: #102326
--color-foreground-secondary: #49666b
--color-foreground-muted: #83a0a5

Light 2 foreground:
--color-foreground-primary: #1f2326
--color-foreground-secondary: #606a73
--color-foreground-muted: #9aa2aa

Dark 1 foreground:
--color-foreground-primary: #f3fbfb
--color-foreground-secondary: #bad0d6
--color-foreground-muted: #617a83

Dark 2 foreground:
--color-foreground-primary: #f6f8fa
--color-foreground-secondary: #c4cbd3
--color-foreground-muted: #707982

Accent:
--color-accent: #5eb1ff
--color-accent-hover: #4da8ff in light, #70bdff in dark
--color-accent-foreground: #191919

Light 1 accent:
--color-accent: #4ccfbf
--color-accent-hover: #35b8a9
--color-accent-foreground: #102326

Dark 1 accent:
--color-accent: #7df2d8
--color-accent-hover: #9ff7e4
--color-accent-foreground: #102326

Light 2 accent:
--color-accent: #8dd7ff
--color-accent-hover: #6ecbff
--color-accent-foreground: #14212a

Dark 2 accent:
--color-accent: #118dff
--color-accent-hover: #36a4ff
--color-accent-foreground: #14212a

Signal:
--color-signal-partial-fill: #6f53ca in light, #bbaee6 in dark
--color-signal-partial-text: #6f53ca in light, #e5e0ff in dark
--color-signal-info-fill: #2b7272 in light, #65c5c5 in dark
--color-signal-info-text: #2b7272 in light, #a5f3f3 in dark
--color-signal-check-fill: #2a7643 in light, #67c987 in dark
--color-signal-check-text: #2a7643 in light, #a7f3c0 in dark
--color-signal-warning-fill: #f8c129 in light, #f6a61d in dark
--color-signal-warning-text: #b24600 in light, #ffe08a in dark
--color-signal-error-fill: #cd1d0c in light, #e94b3a in dark
--color-signal-error-text: #cd1d0c in light, #ffd9d5 in dark

Dark 2 signal override:
--color-signal-check-fill: #34d399
--color-signal-check-text: #34d399
--color-signal-error-fill: #ff8a80
--color-signal-error-text: #ff8a80
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

## Light 1 Theme Pairings

Approved for normal text:

1. `bg-surface-page` with `text-foreground-primary`: `15.53:1`.
2. `bg-surface-page` with `text-foreground-secondary`: `5.90:1`.
3. `bg-surface-primary` with `text-foreground-secondary`: `6.18:1`.
4. `bg-surface-secondary` with `text-foreground-primary`: `13.65:1`.
5. `bg-surface-tertiary` with `text-foreground-primary`: `11.03:1`.
6. `bg-surface-elevated` with `text-foreground-primary`: `14.93:1`.
7. `bg-accent` with `text-accent-foreground`: `8.51:1`.
8. `bg-accent-hover` with `text-accent-foreground`: `6.65:1`.
9. `bg-surface-fixed-dark` with `text-foreground-fixed-light`: `21:1`.

Not approved for readable text:

1. `text-foreground-muted` remains for disabled, decorative, or non essential text only.
2. Do not put white text on `bg-accent`.

## Light 2 Theme Pairings

Approved for normal text:

1. `bg-surface-page` with `text-foreground-primary`: `15.16:1`.
2. `bg-surface-page` with `text-foreground-secondary`: `5.28:1`.
3. `bg-surface-primary` with `text-foreground-secondary`: `5.52:1`.
4. `bg-surface-secondary` with `text-foreground-primary`: `12.81:1`.
5. `bg-surface-tertiary` with `text-foreground-primary`: `9.69:1`.
6. `bg-surface-elevated` with `text-foreground-primary`: `14.70:1`.
7. `bg-accent` with `text-accent-foreground`: `10.38:1`.
8. `bg-accent-hover` with `text-accent-foreground`: `9.10:1`.
9. `bg-surface-fixed-dark` with `text-foreground-fixed-light`: `21:1`.

Not approved for readable text:

1. `text-foreground-muted` remains for disabled, decorative, or non essential text only.
2. Do not put white text on `bg-accent`.

## Dark Theme Pairings

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

## Accent Rules

1. Use `bg-accent text-accent-foreground` for selected tabs, primary filled controls, checked controls, and highlight surfaces with text inside.
2. Do not put white text on `bg-accent`.
3. Use white text on dark surfaces for primary copy.
4. Use `text-foreground-secondary` for secondary paragraphs and labels on `bg-surface-page` or `bg-surface-primary`.
5. Do not use `text-accent` for paragraph copy. Use it for short emphasis only when the background is `bg-surface-page` or `bg-surface-primary`.

## Surface Rules

1. `bg-surface-page` and `bg-surface-primary` can host normal text with primary and secondary foreground colors in every documented theme.
2. `bg-surface-secondary` can host normal text only with `text-foreground-primary` in every documented theme.
3. `bg-surface-elevated` can host normal text only with `text-foreground-primary` in every documented theme.
4. `bg-surface-tertiary` should not host normal body text in dark mode with the current semantic foreground tokens.
5. `text-foreground-muted` is for disabled, decorative, or non essential text only. Do not use it for labels, paragraphs, form hints, or critical metadata.

## Signal Color Rules

1. Use `*-fill` signal tokens for backgrounds, badges, indicators, chart areas, and alert surfaces.
2. Use `*-text` signal tokens for signal-colored text and icons on neutral surfaces.
3. Use only the documented foreground color for text and icons placed directly on matching signal fill backgrounds.
4. Do not use a fill token as body text unless its exact background pairing has been checked.
5. Light theme signal text tokens pass normal text contrast on page, primary, and secondary surfaces. They pass non text contrast on tertiary.
6. Dark theme signal text tokens pass normal text contrast on page, primary, and secondary surfaces. They are not approved on tertiary.
7. Do not rely on color alone for medical or safety critical meaning. Pair signal color with text, icon shape, or label. See [WCAG 1.4.1 Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html).

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

1. `signal-partial-text`: `8.07:1` on page or primary, `4.80:1` on secondary, `2.13:1` on tertiary.
2. `signal-info-text`: `8.20:1` on page or primary, `4.88:1` on secondary, `2.17:1` on tertiary.
3. `signal-check-text`: `7.96:1` on page or primary, `4.74:1` on secondary, `2.10:1` on tertiary.
4. `signal-warning-text`: `7.99:1` on page or primary, `4.75:1` on secondary, `2.11:1` on tertiary.
5. `signal-error-text`: `7.92:1` on page or primary, `4.71:1` on secondary, `2.09:1` on tertiary.

Dark theme signal fills with documented foreground:

1. `signal-partial-fill` with ink text: `8.63:1`.
2. `signal-info-fill` with ink text: `8.66:1`.
3. `signal-check-fill` with ink text: `8.61:1`.
4. `signal-warning-fill` with ink text: `8.70:1`.
5. `signal-error-fill` with ink text: `4.63:1`.

Dark 2 signal overrides:

1. `signal-check-text`: `8.11:1` on page or primary, `5.97:1` on secondary, `7.03:1` on elevated.
2. `signal-check-fill` with ink text: `9.15:1`.
3. `signal-check-fill` with sky accent foreground: `8.53:1`.
4. `signal-error-text`: `6.83:1` on page or primary, `5.03:1` on secondary, `5.92:1` on elevated.
5. `signal-error-fill` with ink text: `7.70:1`.

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
