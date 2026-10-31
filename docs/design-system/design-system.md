---
type: Feature
title: Design Tokens
description: The color, typography, radius, spacing, and motion tokens shared by every page and component.
tags: [design-system, tokens, colors, typography, spacing]
status: draft
generated: { by: claude-code/claude-sonnet-5, at: 2026-10-31T08:47:16Z }
sources:
  - id: tokens-css
    resource: https://github.com/s1041613/studiolane/blob/main/src/app/tokens.css
    title: Design tokens stylesheet
  - id: globals-css
    resource: https://github.com/s1041613/studiolane/blob/main/src/app/globals.css
    title: Global stylesheet and shadcn mapping
  - id: fonts-ts
    resource: https://github.com/s1041613/studiolane/blob/main/src/app/fonts.ts
    title: Shared font loader
  - id: components-json
    resource: https://github.com/s1041613/studiolane/blob/main/components.json
    title: shadcn configuration
---

# Overview

`src/app/tokens.css` defines the raw variables for the whole system. Every
variable name starts with `--eb-`.[^tokens-css] `src/app/globals.css` uses
`@theme inline` to map these variables to the semantic variables shadcn uses,
for example `--color-background`, `--card`, and `--primary`.[^globals-css]
Tailwind classes on the page, such as `bg-surface` and `text-muted-foreground`,
read from this `globals.css` layer, not from the raw variables in
`tokens.css`.

A comment at the top of `tokens.css` says these tokens are copied from
`docs/design-system/tokens.css`.[^tokens-css] That folder does not exist in
this version of the repo. This document treats the current content of
`src/app/tokens.css` as the source of truth.

See [Shared UI Primitives and App Shell](ui-primitives.md) for how components
use these tokens.

# Neutral Colors and Interface Roles

Colors split into two layers. The first layer is neutral colors, used for the
layout itself.[^tokens-css]

- `--eb-color-page` is the background color for the whole page.
- `--eb-color-surface` is the translucent white used for cards.
  `--eb-color-surface-solid` is the opaque version of the same card, for
  sticky areas that must cover content below, such as a fixed table header.
- `--eb-color-inset` marks a sub-section inside a card.
- `--eb-color-control` is the background color for controls such as inputs
  and dropdowns.
- `--eb-color-selected` is used for every selected state.
- `--eb-color-icon-btn` is for icon-only buttons. `--eb-color-icon-btn-active`
  separately marks the current page in the left-side navigation.
- `--eb-color-row-action` is used for each row's action button in a list,
  and for the close button in the top right corner of a dialog.

Text colors also split into several roles, each with a fixed use.
`--eb-text-primary` is the main text color. `--eb-text-secondary` is for
stat card titles and regular table columns. `--eb-text-label` is for form
field names. `--eb-text-muted` is for helper text and table headers.
`--eb-text-required` is the color for the required-field mark.[^tokens-css]

# Accent Color and Status Colors

The lime color `--eb-lime` is reserved for a small set of places: the
primary button, the glow on the first stat card on the home page, the dot
on the logo, and avatars.[^tokens-css]

The status colors, success, info, danger, and warning, are used only for
text or small dots, never as solid blocks. `--eb-danger-bg` is the one
exception. It is used only for the background of an error message
bar.[^tokens-css] `globals.css` maps these status colors to text colors,
such as `--color-success` and `--color-danger`. A comment in the code
states directly that status is shown with text color only.[^globals-css]

# Light and Dark Mode

`globals.css` defines `@custom-variant dark (&:is(.dark *));`. This line only
wires up Tailwind's `dark:` variant.[^globals-css] Neither `tokens.css` nor
`globals.css` has a matching `:root.dark` color block. Only light-mode values
exist today.[^globals-css][^tokens-css] The dark mode switch is wired up, but
there is no dark color palette to use yet.

# Fonts

The site uses three fonts, all loaded by `fonts.ts`. The root layout and
`global-error.tsx` share this same load, because `global-error.tsx` replaces
the whole layout and would otherwise skip the root layout's font
loading.[^fonts-ts]

- `Outfit` is the main Latin-script font. It loads three weights: 300, 400,
  and 500.
- `Noto Sans TC` covers Chinese characters. This font is split into multiple
  files by unicode range. The code turns off `preload`, so each page fetches
  only the ranges it actually uses.
- `Geist Mono` is the monospace font, mapped to `--font-mono`.

`globals.css` sets both `--font-sans` and `--font-heading` to the same stack:
`Outfit`, then `Noto Sans TC`, then a system font fallback.[^globals-css]

Font size has six steps, each with a fixed use. From largest to smallest:
28px for display text, 32px for stat card numbers, 15px for card titles,
14px for regular content, 13px for secondary info, and 12px for table
headers and labels.[^tokens-css] There are only three font weights. 300 is
only for large KPI numbers. Everything else uses 400 or 500.[^tokens-css]

# Corner Radius

There are four corner radius sizes, each tied to a component size.[^tokens-css]

- L (20px) is for cards, dialogs, and dropdown panels.
- M (12px) is for clickable components 40px or larger, sections inside a
  card, and the track of a segmented control.
- S (8px) is for components 36px or smaller, blocks inside a track, and
  calendar cells.
- tag (6px) is only for small text labels.

shadcn's `--radius` is set separately to 0.75rem, which is 12px. A code
comment maps Tailwind's `rounded-2xl` to L, `rounded-lg` to M, `rounded-md`
to S, and `rounded-sm` to tag. The comment uses "approximately equal to",
not an exact match.[^globals-css]

# Spacing

Spacing is based on a 4px unit. `--eb-space-1` through `--eb-space-6` are,
in order, 4, 8, 12, 16, 20, and 24px.[^tokens-css] A few more spacing values
have fixed uses: 20px for padding inside a card, 16px for padding inside
each list item, 16px between cards, and 8px between items in a card-style
list.[^tokens-css]

# Sizing, Shadow, and Motion

Control height also has a fixed set of sizes. Inputs and dropdowns are
44px. Buttons and time columns inside a table are 32px. The page's primary
button is 42px. An icon-only button is 40px.[^tokens-css]

Shadow is used only for things that float above the page, such as popover
panels and dialogs. Nothing else uses shadow.[^tokens-css]

Motion defines only one easing curve, paired with two fixed durations.
150ms is for background color changes on hover. 350ms is for the primary
button's gradient shift.[^tokens-css]

# Primary Button Gradient

The primary button, the `default` variant in `button.tsx`, uses a soft
gradient as its background. On hover, the whole background shifts to the
right, using the 350ms easing mentioned above.[^tokens-css][^globals-css]
Other variants, such as `outline`, `secondary`, and `ghost`, use a solid
color background and do not have this gradient.

# shadcn Configuration

`components.json` registers this project with the `base-nova` style, the
`neutral` base color, CSS variable mode turned on, no class prefix, and the
`lucide` icon set.[^components-json] Path aliases for components, utilities,
UI components, shared logic, and hooks all point to their matching folders
under `src/`.[^components-json]

[^tokens-css]: Design tokens stylesheet
[^globals-css]: Global stylesheet and shadcn mapping
[^fonts-ts]: Shared font loader
[^components-json]: shadcn configuration
