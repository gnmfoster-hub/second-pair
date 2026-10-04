"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLive } from "./scroll";

/**
 * "And it runs the rest of it", shown rather than listed.
 *
 * Six paragraphs in three columns asked the reader to imagine six screens.
 * The screens exist, so they are here: each claim has the thing it describes
 * beside it, and on a wide screen the picture holds still while the claims
 * scroll past it and swaps as each one arrives.
 *
 * Three of the six are real screenshots of the demo salon. The other three
 * are drawn, because a reminder is a text message and a home-screen icon is
 * an icon, and a screenshot of either would be a picture of a phone.
 *
 * Without script, or on a phone, it is six blocks in a column, each with its
 * picture underneath. Nothing is hidden.
 */

function Shot({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="sp-frame">
      <div className="sp-frame-bar" aria-hidden>
        <i />
        <i />
        <i />
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} width={1200} height={806} loading="lazy" decoding="async" />
    </div>
  );
}

function Reminders() {
  return (
    <div className="sp-texts">
      <p>
        <small>Living Canvas Tattoo</small>
        You&rsquo;re booked for tomorrow at 11am. Please bring photo ID.
      </p>
      <p>
        <small>Willow &amp; Co</small>
        See you Tuesday at 1pm for your colour. Please come with dry hair.
      </p>
      <p>
        <small>Hale Electrical</small>
        We&rsquo;re with you Friday at 8am. Please leave access to the fuse board and
        somewhere to park.
      </p>
    </div>
  );
}

function Record() {
  return (
    <div className="sp-record">
      <div className="sp-record-top">
        <span className="sp-record-ini">MA</span>
        <div>
          <b>Megan Allwood</b>
          <span>Cut and colour · Chloe</span>
        </div>
      </div>
      <dl>
        <div>
          <dt>Visits</dt>
          <dd className="stat">14</dd>
        </div>
        <div>
          <dt>No-shows</dt>
          <dd className="stat">1</dd>
        </div>
        <div>
          <dt>Last in</dt>
          <dd className="stat">12 Sep</dd>
        </div>
      </dl>
      <p className="sp-record-note">
        <b>Flagged every visit</b>
        Patch test needed before any colour.
      </p>
    </div>
  );
}

function HomeScreen() {
  return (
    <div className="sp-phone">
      <div className="sp-phone-grid" aria-hidden>
        {Array.from({ length: 11 }, (_, i) => (
          <i key={i} />
        ))}
        <span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/png/app-icon-180.png" alt="" width={56} height={56} loading="lazy" />
          <b>Second Pair</b>
        </span>
      </div>
    </div>
  );
}

const REST: { head: string; body: string; show: ReactNode }[] = [
  {
    head: "A proper diary",
    body: "Day, week and person views, repeats, blocks, all-day entries. Or keep the Fresha diary you already have. It reads that too.",
    show: <Shot src="/shots/diary-month.webp" alt="The Second Pair diary, month view, in the demo salon" />,
  },
  {
    head: "Deposits, if you want them",
    body: "Straight to your bank through Stripe at their normal rate. Second Pair takes nothing from it. Off entirely for trades that invoice after.",
    show: <Shot src="/shots/report.webp" alt="Last week’s report in the demo salon, with deposits taken" />,
  },
  {
    head: "A link each",
    body: "In a salon, every stylist gets their own link for their own Instagram. Enquiries there are theirs, and it never asks who you'd like.",
    show: <Shot src="/shots/inbox.webp" alt="The inbox in the demo salon, filtered by stylist" />,
  },
  {
    head: "Reminders that suit the job",
    body: "Bring photo ID for a tattoo. Come with dry hair for a colour. Leave access and somewhere to park for a sparky.",
    show: <Reminders />,
  },
  {
    head: "Client records",
    body: "History, what they've spent, no-shows, and a private note that flags every time they come back.",
    show: <Record />,
  },
  {
    head: "On your phone",
    body: "Add it to your home screen and it works like an app. No app store, no waiting.",
    show: <HomeScreen />,
  },
];

export function TheRest() {
  const live = useLive();
  const [active, setActive] = useState(0);
  const items = useRef<(HTMLLIElement | null)[]>([]);

  /* Whichever claim is nearest the middle of the screen is the one shown. */
  useEffect(() => {
    if (!live) return;
    const seen = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.i));
        }
      },
      { rootMargin: "-46% 0px -46% 0px" },
    );
    items.current.forEach((el) => el && seen.observe(el));
    return () => seen.disconnect();
  }, [live]);

  return (
    <section className="sp-rest shell" data-live={live ? "" : undefined}>
      <h2 className="page-title sp-big-title">And it runs the rest of it</h2>

      <ol className="sp-rest-list">
        {REST.map((r, i) => (
          <li
            key={r.head}
            ref={(el) => {
              items.current[i] = el;
            }}
            data-i={i}
            data-on={i === active ? "" : undefined}
          >
            <div className="sp-rest-words">
              <h3 className="section-title">{r.head}</h3>
              <p>{r.body}</p>
            </div>
            <div className="sp-rest-show">
              <div>{r.show}</div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
