# Second Pair logo pack

Drop this folder into the repo, ideally at `public/brand/`. Everything is SVG first,
with PNGs only where a raster file is actually required. The wordmark is Inter, already
converted to outlines, so nothing here depends on a font being installed or loaded.

**The mark:** a speech bubble with two dots in it. The two dots are the typing indicator
everyone recognises, so it reads as someone replying, and there being two of them is the
pair. It is the moment the product sells: a customer messages and sees an answer coming.

---

## Files and when to use them

### Lockups

| File | Tag | Use it for |
|---|---|---|
| `svg/logo-primary.svg` | primary, light bg | The default. Site header, invoices, letterhead, email signature. |
| `svg/logo-primary-alt-line.svg` | primary, alt tagline | Same lockup with "answers while you're on the job". For ads and landing pages aimed at trades. |
| `svg/logo-primary-reversed.svg` | primary, dark bg | Anywhere the background is dark. Footer, dark hero. |
| `svg/logo-horizontal.svg` | no tagline, light bg | Tight horizontal spaces where the tagline would be unreadable. Nav bars under 60px tall. |
| `svg/logo-horizontal-reversed.svg` | no tagline, dark bg | Same, on dark. |
| `svg/logo-stacked.svg` | square, light bg | Anywhere roughly square. Business card, sticker, printed flyer. |
| `svg/logo-stacked-reversed.svg` | square, dark bg | Same, on dark. |
| `svg/logo-mono-ink.svg` | one colour, dark | Print, embroidery, stamps, fax, anything single colour. Dots are knocked out, not filled. |
| `svg/logo-mono-light.svg` | one colour, light | Same, for dark or photographic backgrounds. |

### Mark on its own

| File | Tag | Use it for |
|---|---|---|
| `svg/mark.svg` | icon, light bg | The bubble with no words. Avatars, the chat widget launcher, loading states. |
| `svg/mark-reversed.svg` | icon, dark bg | Same, on dark. |
| `svg/mark-mono-ink.svg` | icon, one colour | Single colour print and embroidery. |
| `svg/mark-mono-light.svg` | icon, one colour, dark bg | Same, on dark. |

### Wordmark on its own

| File | Tag | Use it for |
|---|---|---|
| `svg/wordmark.svg` | type only, forest | When the mark already appears elsewhere on the same surface. |
| `svg/wordmark-ink.svg` | type only, near black | Documents and anything monochrome. |
| `svg/wordmark-reversed.svg` | type only, cream | Dark backgrounds. |

### App and browser

| File | Tag | Use it for |
|---|---|---|
| `svg/app-icon.svg` | 512, forest tile | Source for every app and PWA icon. |
| `svg/app-icon-hi-vis.svg` | 512, black and yellow | Alternative icon. Louder on a phone home screen, leans trade rather than salon. |
| `svg/favicon.svg` | 32, optimised | Browser tab. Larger mark and tighter margins so it survives being tiny. |
| `png/favicon-16.png`, `png/favicon-32.png` | raster fallback | Older browsers. |
| `png/app-icon-180.png` | apple touch icon | iOS home screen. |
| `png/app-icon-192.png`, `png/app-icon-512.png` | PWA manifest | Android and the web app manifest. |
| `svg/social-card.svg`, `png/social-card.png` | 1200x630 | Open Graph and Twitter card image. |
| `png/logo-primary.png`, `png/logo-stacked.png`, `png/logo-mono-ink.png` | raster fallback | Email signatures and anywhere SVG is not supported. |

### Code

| File | Tag | Use it for |
|---|---|---|
| `code/brand.css` | tokens | CSS custom properties. Import once, use everywhere including the embeddable widget. |
| `code/brand.json` | tokens | Same values as data, for Tailwind config or anything that needs to read them. |
| `code/Logo.tsx` | React | Inline component. Takes a `variant` and `className`, uses `currentColor` for the mono variant. |

---

## Colours

| Name | Hex | Role |
|---|---|---|
| Forest | `#1E5647` | Primary. Bubble, wordmark, buttons, links. |
| Amber | `#E8A33D` | Accent. The second dot only, plus one call to action per screen. Never body text. |
| Cream | `#F4F2EC` | Light surface and knockout. |
| Ink | `#17150F` | Body text and the one colour version. |
| Sage | `#9FBFB2` | Tagline and secondary text on dark backgrounds. |
| Muted | `#6E7F76` | Tagline and secondary text on light backgrounds. |
| Hi-vis | `#D6E23C` | Alternative accent for the trade-facing icon only. Not part of the core palette. |

Contrast: forest on cream and cream on forest both pass AA at body sizes. Amber on cream
does not, so amber is never used for text.

## Rules

Clear space around the logo is the height of the bubble on every side. Nothing else goes
inside that.

Minimum sizes: the full lockup with the tagline needs 180px of width. Below that use
`logo-horizontal.svg`. Below 90px use the mark on its own.

The tagline is part of the logo only in the primary lockups. The app icon, the favicon
and the mark never carry words.

Do not recolour the mark outside the palette, do not put the colour version on a
photograph (use mono light), do not add a shadow or an outline, do not stretch it, and do
not set the wordmark in a different typeface. If you need the words in live text
somewhere, Inter at weight 400 with "pair" at 500 and -0.02em tracking matches.

## Still to do before this is final

The name has not been cleared yet. Before this goes on anything printed, check Companies
House, run a UK IPO trade mark search in classes 9 and 42, and secure the domain and the
social handles. Registering the mark and the words together is stronger than the words
alone, which matters because "second pair" is a common phrase.
