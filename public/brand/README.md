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

Rewritten on 5 October after a tidy-up, and this time against what the running
site actually asks for rather than against what was exported. Every row below
was checked; anything not named by an exact path somewhere is marked as such.

| Placement | Asset | Who asks for it |
| --- | --- | --- |
| The header, and anywhere in the app | `logo/mark-3d-320.webp`, or `logo/mark-flat-reversed-320.webp` on ink | `src/components/Logo.tsx` |
| Home screen icon, PWA | `png/app-icon-192.png`, `-512.png`, `-maskable-512.png` | `public/manifest.webmanifest` |
| A notification | `png/app-icon-192.png` for the icon, `mark/favicon-32.png` for the badge | `public/sw.js` |
| Social sharing | `png/social-card-default.png` | `src/app/layout.tsx` |
| Drawing that card again | `logo/mark-3d.png` | `scripts/make-social-card.cjs` |
| The hands on the marketing site | the `.webp` files in `hands/` | the `(marketing)` pages |
| The browser tab | `src/app/icon.png` and `src/app/apple-icon.png` | Next.js, by convention |

Nothing in this folder is the site's favicon. Next.js takes that from
`src/app/icon.png`, which is why `icons/favicon.ico` is not listed.

### Deleted on 5 October

The old flat two-hands artwork, which had been sitting beside the current mark
and catching people out. Giles found it the way these things are always found:
"its sending the second pair logo in the text form link and its the old logo."

- `code/` — the pack author's sample React component, tokens, manifest and
  metadata example. None of it was used by the app and its `Logo.tsx` pointed at
  a folder deleted weeks earlier. A stale Logo.tsx inside a brand folder is the
  single most copyable wrong thing here.
- `png/lockup-*-transparent.png`, eleven files, which this README already said
  were the old artwork used by nothing.
- `png/social-card-hands.png` and `-trades.png`, the other two old cards.
- `logo/lockup-horizontal-on-paper.svg` and its ink and stacked siblings. These
  were the ones worth going for: they sat in the folder this README calls
  current, and rendering one shows the old flat peachy hand.

Everything is in git if any of it is wanted back.

### Still here and used by nothing

`icons/` is a complete flat icon set that nothing references. It was left alone
rather than deleted because flat is not the same as old here: `Logo.tsx` loads a
flat reversed mark on dark backgrounds on purpose, so a flat set may be a
deliberate alternative rather than a leftover. Somebody who knows which should
say, and then it either gets used or goes.

The `.png` originals in `hands/` are likewise unreferenced, because the pages
load the `.webp` versions. They are the sources those were made from.

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

This section described a handoff that no longer applies. `IMPLEMENTATION-PROMPT.md` never existed in this repository and the `code/` folder was deleted on 5 October. The live implementation is `src/components/Logo.tsx` and the tokens at the top of `src/app/globals.css`.

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
