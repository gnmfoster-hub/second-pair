# Second Pair — final Colour A brand pack V3

The user-supplied navy, cream and orange two-hands mark in `reference/approved-mark-source.png` is the definitive source of truth. Its hands, overlap, proportions and placement must not be redrawn or reinterpreted. `reference/production-mark-cleaned.png` removes only stray background blemishes; the hand artwork is unchanged and is the version used by the production assets.

## Brand specification

| Item | Specification |
| --- | --- |
| Name | Second Pair |
| Primary slogan | you work, we answer |
| Alternate slogan | answers while you're on the job |
| Brand promise slogan | your second pair of hands |
| Wordmark type | Inter; `second` 400, `pair` 500; tracking `-0.02em` |
| Navy | `#14243F` |
| Navy deep | `#0C1729` |
| Orange | `#F07818` |
| Orange dark | `#C85D0B` |
| Cream | `#EFEEE9` |
| Ink | `#17150F` |
| Muted | `#5A6577` |
| Muted dark | `#9BAAC2` |

The supplied SVG lockups use outlined text and do not depend on a font being installed. Use Inter for all live interface and marketing text.

## Which file to use

| Placement | Asset |
| --- | --- |
| Main website header | `svg/lockup-default.svg` |
| Trades campaign/page | `svg/lockup-trades.svg` |
| Brand-promise campaign/page | `svg/lockup-hands.svg` |
| Dark background | matching `-reversed.svg` |
| Small or narrow area | `svg/logo-horizontal.svg` |
| App, avatar or chat launcher | `svg/mark-colour.svg` or an `app-icon-*` PNG |
| Email signature | `png/logo-horizontal-transparent.png` |
| Social sharing | `png/social-card-default.png` |
| Print/marketing software | transparent PNG or SVG, depending on support |
| Visual reference only | files in `reference/` |

## Minimum sizes and clear space

- Tagline lockup: minimum 180 px wide.
- Horizontal logo without tagline: 90–179 px wide.
- Mark alone: 16–89 px wide.
- Keep clear space around the logo equal to at least one quarter of the speech-bubble height.
- Never place content inside the clear-space area.

## Usage rules

- The default slogan is for the overall brand and product.
- The alternate slogan is for tradespeople and other on-the-job audiences.
- The brand-promise slogan is for introductions, launch campaigns and marketing that explains the name directly.
- Use SVG first. Use PNG where SVG is unsupported.
- Use navy or ink for body text. Orange must not be used for small text on cream or white.
- Do not recolour, stretch, rotate, outline, shadow or add effects.
- Do not use the colour logo directly on a photograph.
- Do not separate, rearrange, regenerate or redraw the hands. Use the approved source artwork supplied in this pack.
- Do not use any earlier two-dot or incorrect six-finger mark.

## Developer handoff

Read `CLAUDE.md`, then paste `IMPLEMENTATION-PROMPT.md` into Claude Code. The `code/` folder contains the React component, colour tokens, PWA manifest and a Next.js metadata example.

## Contents

- `svg/` — scalable production assets.
- `png/` — app icons and transparent raster fallbacks.
- `code/` — drop-in implementation files.
- `reference/` — locked approved visual masters.
