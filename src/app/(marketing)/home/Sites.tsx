import type { CSSProperties } from "react";
import { Passing } from "./scroll";

/**
 * The websites we have built, moving.
 *
 * The section used to name one site in a sentence. Somebody deciding whether
 * to hand over the first thing every new customer sees wants to see one, so
 * the two that are live are here in a browser frame each, and each scrolls
 * through its own page as this page scrolls past it.
 *
 * Both are real, both are live, and both have the assistant answering on
 * them. When a third goes live it is one more entry here.
 */
const SITES = [
  {
    src: "/shots/site-ambers.webp",
    height: 2600,
    href: "https://www.amberspawsandpastures.com",
    domain: "amberspawsandpastures.com",
    what: "Pet and horse care across Newton Abbot.",
    alt: "The home page of Amber’s Paws & Pastures",
  },
  {
    src: "/shots/site-livingcanvas.webp",
    height: 830,
    href: "https://livingcanvastattoo.ink",
    domain: "livingcanvastattoo.ink",
    what: "A tattoo studio in Devon.",
    alt: "The home page of Living Canvas Tattoo Studio",
  },
];

export function Sites() {
  return (
    <Passing className="sp-sites">
      {SITES.map((s) => (
        <figure
          key={s.domain}
          /* How far the picture can travel, as a share of its own height: the
             frame shows 560 of it at a time. */
          style={{ "--max": (((s.height - 560) / s.height) * 100).toFixed(2) } as CSSProperties}
        >
          <a href={s.href} target="_blank" rel="noopener noreferrer" className="sp-frame sp-site">
            <div className="sp-frame-bar" aria-hidden>
              <i />
              <i />
              <i />
              <span>{s.domain}</span>
            </div>
            <div className="sp-site-view">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.src} alt={s.alt} width={720} height={s.height} loading="lazy" decoding="async" />
            </div>
          </a>
          <figcaption>
            <a href={s.href} target="_blank" rel="noopener noreferrer">
              {s.domain}
            </a>
            <span>{s.what} The assistant answers on it.</span>
          </figcaption>
        </figure>
      ))}
    </Passing>
  );
}
