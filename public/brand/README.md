# Second Pair — final Colour A brand pack V3

> **This pack is superseded.** Everything below describes the navy/cream/orange
> two-hands brand. The live site does not use it: the mark is now the black
> speech bubble with a cream and cobalt pair of hands, and the current assets
> are in `logo/`, `mark/` and `icons/`. The old `svg/` folder has been deleted,
> because old artwork sitting in a brand folder is a trap for the next person
> who goes looking for a lockup. The `png/lockup-*-transparent.png` files are
> the same old artwork and are used by nothing.
>
> The specification below is kept as the record of what was signed off, and the
> "Which file to use" table has been repointed at the files that exist. Nothing
> else here has been rewritten.

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

Current assets only. The trades and brand-promise lockups no longer exist as
lockups — those campaigns have social cards instead.

| Placement | Asset |
| --- | --- |
| Main website header | `logo/lockup-horizontal-on-paper.svg` |
| Dark background | `logo/lockup-horizontal-on-ink.svg` |
| Where the lockup has to stack | `logo/lockup-stacked-on-paper.svg` |
| Small or narrow area | `logo/bubble-mark.svg` |
| In the app | `logo/mark-3d-320.webp`, or `mark-flat-reversed-320.webp` on ink — this is what `src/components/Logo.tsx` loads |
| App, avatar or chat launcher | `icons/icon-512.png`, or `png/app-icon-*.png` for the PWA manifest |
| Favicon | `icons/favicon.ico` |
| Social sharing | `png/social-card-default.png`, `-trades.png`, `-hands.png` |
| Print/marketing software | PNG from `mark/`, or an SVG from `logo/` where supported |
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

Current:

- `logo/` — the lockups and the mark, as used by the site.
- `mark/` — the mark at fixed pixel sizes, plus favicons.
- `icons/` — app and browser icons.
- `png/` — PWA app icons and the three social cards.
- `hands/` — the photographed hands used on the home page.

From the old pack, kept for reference:

- `code/` — the pack author's handoff sample. Not used by the app, and its
  `Logo.tsx` still points at the deleted `svg/` folder. The app has its own
  component at `src/components/Logo.tsx`.
- `reference/` — locked approved visual masters of the old mark.
