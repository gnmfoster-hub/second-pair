# Second Pair brand pack

Navy and orange. Drop the folder into the repo at `public/brand/` and put `code/Logo.tsx`
wherever your components live.

The wordmark is Inter converted to outlines, so nothing here depends on a font being
installed or loaded. Every SVG has a `<title>` and `<desc>` for screen readers.

**The mark:** a speech bubble with two dots. The dots are the typing indicator everyone
recognises, so it reads as someone replying, and there being two of them is the pair.

**The tagline is a prop, not part of the logo.** Use `Logo.tsx` and pass whichever line
suits the audience. The static files below exist for the places code can't reach, like
print, email signatures and social images.

---

## The six arrangements

| File | Tag | Use it for |
|---|---|---|
| `svg/lockup-flush-right.svg` | recommended | Tagline ends level with the name, so the whole thing reads as one block. The default for the website. |
| `svg/lockup-classic.svg` | everyday | Everything left aligned off the same edge. Documents, invoices, letterhead. |
| `svg/lockup-inline.svg` | narrow headers | Name, hairline, tagline, all on one line. For headers under 60px tall. |
| `svg/lockup-lead-in.svg` | cold audiences | Tagline sits above the name, so people read what it does before what it's called. Ads and landing pages. |
| `svg/lockup-large-format.svg` | van, banner, A-board | Bigger, with the tagline in orange so it carries across a car park. Do not use small. |
| `svg/lockup-stacked.svg` | square spaces | Business card, sticker, Instagram profile. |

Each has a `-reversed` version for dark backgrounds. `lockup-classic` and
`lockup-flush-right` also have an `-alt-line` version carrying "answers while you're on
the job" for the trades-facing pages.

## Everything else

| File | Tag | Use it for |
|---|---|---|
| `svg/logo-horizontal.svg` + `-reversed` | no tagline | Anywhere too small for a tagline. |
| `svg/logo-mono-ink.svg` | one colour, dark | Print, embroidery, stamps, anything single colour. Dots are knocked out, not filled. |
| `svg/logo-mono-light.svg` | one colour, light | Same, on dark or photographic backgrounds. |
| `svg/mark.svg` + `-reversed` | icon | Bubble alone. Avatars, the chat widget launcher, loading states. |
| `svg/mark-mono-ink.svg` + `mark-mono-light.svg` | icon, one colour | Single colour print. |
| `svg/wordmark.svg` / `-ink` / `-reversed` | type only | When the mark already appears on the same surface. |
| `svg/app-icon.svg` | 512, navy tile | Source for every app and PWA icon. |
| `svg/app-icon-hi-vis.svg` | 512, black and yellow | Alternative icon. Louder on a home screen, leans trade rather than salon. |
| `svg/favicon.svg` | 32, optimised | Browser tab. Larger mark, tighter margins, so it survives being tiny. |
| `png/favicon-16.png`, `png/favicon-32.png` | raster fallback | Older browsers. |
| `png/app-icon-180.png` | apple touch icon | iOS home screen. |
| `png/app-icon-192.png`, `png/app-icon-512.png` | PWA manifest | Android and the web manifest. |
| `svg/social-card.svg`, `png/social-card.png` | 1200x630 | Open Graph and Twitter card. |
| `png/lockup-*.png`, `png/logo-mono-ink.png` | raster fallback | Email signatures and anywhere SVG isn't supported. |
| `code/brand.css` | tokens | CSS custom properties. Import once in the root layout. |
| `code/brand.json` | tokens | Same values as data, for Tailwind config or scripts. |
| `code/Logo.tsx` | React | `<SecondPairLogo variant layout tagline />` and `<SecondPairMark />`. Mono variant uses `currentColor`. |

## Colours

| Name | Hex | Role |
|---|---|---|
| Navy | `#14243F` | Primary. Bubble, wordmark, headings, buttons. |
| Navy deep | `#0C1729` | Dark surfaces, footer, hover states. |
| Orange | `#F07818` | Accent. The second dot, one call to action per screen, the large format tagline. |
| Orange dark | `#C85D0B` | Hover and active states for orange. |
| Paper | `#EFEEE9` | Light surface and knockout. |
| Ink | `#17150F` | Body text and the one colour version. |
| Muted | `#5A6577` | Tagline and secondary text on light. |
| Muted dark | `#9BAAC2` | Tagline and secondary text on dark. |
| Hi-vis | `#F5C518` | Alternative icon only. Not part of the core palette. |

Contrast: navy on paper and paper on navy both pass AA at body sizes. Orange on paper
does not pass for small text, so orange is never used for body copy. Orange on navy is
fine for large text only, which is why the large format tagline works and a small one
wouldn't.

## Rules

Clear space is the height of the bubble on every side. Nothing goes inside it.

Minimum sizes: a lockup with a tagline needs 180px of width, below that use
`logo-horizontal.svg`, and below 90px use the mark alone.

The app icon, the favicon and the mark never carry words.

Do not recolour outside the palette, do not put the colour version on a photograph (use
mono light), no shadows or outlines, no stretching, and do not reset the wordmark in
another typeface. If you need live text to match, that's Inter 400 with "pair" at 500 and
-0.02em tracking.

## Wiring it into Next.js

Copy `favicon.svg`, `app-icon-180.png`, `app-icon-192.png` and `app-icon-512.png` into
`app/`, reference them from the metadata export and the web manifest, and point the
Open Graph image at `social-card.png`. Import `brand.css` once in the root layout so the
embeddable chat widget can use the same custom properties as the site, which stops the
widget drifting from the brand later.

## Before this goes on anything printed

The name isn't cleared yet. Check Companies House, run a UK IPO trade mark search in
classes 9 and 42, and secure the domain and social handles. Registering the mark and the
words together is stronger than the words alone, which matters because "second pair" is a
common phrase.
