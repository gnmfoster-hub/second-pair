"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { useLive, useProgress } from "../home/scroll";

/**
 * What you get, shown on the sites themselves.
 *
 * The page listed six things a site from us comes with and then, further
 * down, showed two screenshots. The two belong together: the sites are the
 * proof of the list. So the page pins, the six claims go by on the left one
 * at a time, and on the right a real site scrolls through its own page —
 * Amber's for the first three, Living Canvas for the rest.
 *
 * Both are live and both were built here. The pictures are of the live pages.
 *
 * Without script, on a phone, or for somebody who has asked for less motion,
 * it is the six claims in a grid and the two sites underneath.
 */

/** The frame shows this much of a 720-wide picture at a time. */
const VIEW = 520;

const SITES = [
  {
    src: "/shots/site-ambers.webp",
    height: 2600,
    href: "https://www.amberspawsandpastures.com",
    domain: "amberspawsandpastures.com",
    alt: "amberspawsandpastures.com, a dog walking and horse care site built by Second Pair.",
    caption: (
      <>
        Dog walking, pet sitting and horse care near Newton Abbot. Built, hosted, and
        answering by text and email.
      </>
    ),
  },
  {
    src: "/shots/site-livingcanvas.webp",
    height: 830,
    href: "https://livingcanvastattoo.ink",
    domain: "livingcanvastattoo.ink",
    alt: "livingcanvastattoo.ink, a tattoo studio site built and hosted by Second Pair.",
    caption: (
      <>
        A tattoo studio in Devon. We built it, we host it, and the assistant answers on
        it. This is the live site, not a mock-up.
      </>
    ),
  },
];

export function SiteTour({
  title,
  intro,
  items,
}: {
  title: string;
  intro: string;
  items: { head: string; body: ReactNode }[];
}) {
  const live = useLive();
  const [step, setStep] = useState(0);
  const half = Math.ceil(items.length / 2);

  const ref = useProgress<HTMLElement>("pin", live, (p, el) => {
    const next = Math.min(items.length - 1, Math.floor(p * (items.length + 0.4)));
    setStep((was) => (was === next ? was : next));
    /* Each site scrolls through its own page during its half of the tour. */
    el.style.setProperty("--pan0", Math.min(1, p / 0.46).toFixed(4));
    el.style.setProperty("--pan1", Math.min(1, Math.max(0, (p - 0.5) / 0.42)).toFixed(4));
  });

  const showing = step < half ? 0 : 1;

  return (
    <section ref={ref} className="sp-tour sp-night" data-live={live ? "" : undefined}>
      <div className="sp-tour-pin">
        <div className="shell sp-tour-in">
          <div className="sp-tour-words">
            <h2 className="page-title sp-big-title">{title}</h2>
            <p className="sp-tour-intro">{intro}</p>
            <ol className="sp-tour-items">
              {items.map((item, i) => (
                <li key={item.head} className="index-item" data-on={i === step ? "" : undefined}>
                  <h3 className="section-title">{item.head}</h3>
                  <p>{item.body}</p>
                </li>
              ))}
            </ol>
          </div>

          <div className="sp-tour-frames">
            {SITES.map((s, i) => (
              <figure
                key={s.domain}
                data-on={i === showing ? "" : undefined}
                style={
                  {
                    "--max": (((s.height - VIEW) / s.height) * 100).toFixed(2),
                    "--pan": `var(--pan${i}, 0)`,
                  } as CSSProperties
                }
              >
                <a href={s.href} target="_blank" rel="noopener noreferrer" className="sp-frame">
                  <div className="sp-frame-bar" aria-hidden>
                    <i />
                    <i />
                    <i />
                    <span>{s.domain}</span>
                  </div>
                  <div className="sp-site-view">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.src} alt={s.alt} width={720} height={s.height} decoding="async" />
                  </div>
                </a>
                <figcaption>
                  <a href={s.href} target="_blank" rel="noopener noreferrer">
                    {s.domain}
                  </a>
                  <span>{s.caption}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
