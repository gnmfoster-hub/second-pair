"use client";

import { useRef, useState } from "react";
import { ChannelIcon } from "@/components/ChannelIcon";
import type { Channel } from "@/lib/types";
import { useLive, useProgress } from "./scroll";

/**
 * Seven ways in, one diary — played as one evening.
 *
 * This was a diagram with a light running down each line. The diagram said
 * that seven channels reach one diary; it could not say what the argument
 * underneath it says, which is that this happens while nobody is there. So the
 * page now pins and the visitor's own scroll is the clock: seven enquiries
 * between six and half past ten, each on a different channel, each answered,
 * and the diary filling at the side. One of the seven is a complaint, and it
 * does not go in the diary. It goes to the owner. That is the third card of
 * the argument shown rather than claimed.
 *
 * The salon is the demo one the product screenshots use. Prices are the same
 * placeholders the hero uses, [YOUR PRICE] and [DEPOSIT], because a number
 * invented here is a number somebody holds you to.
 *
 * Finished without script. The server sends the resting picture: all seven
 * listed, the diary full. Pinning is switched on after mounting, on a screen
 * wide enough for it and only for somebody who has not asked for less motion.
 */

type Event = {
  channel: Channel;
  label: string;
  note: string;
  time: string;
  from: string;
  asks: string;
  answer: string;
  /** Where it lands. Null is the one that is handed over rather than booked. */
  day: string | null;
  row: string;
  tag: string;
};

const EVENING: Event[] = [
  {
    channel: "sms", label: "Text message", note: "the number on the van", time: "6:12pm", from: "Megan",
    asks: "Hi, any chance of a cut and blow-dry Friday morning?",
    answer: "Friday 10am with Chloe is free. Shall I book it?",
    day: "Fri", row: "10am Cut & blow-dry", tag: "BOOKED",
  },
  {
    channel: "voice", label: "A phone call", note: "answered, or texted back", time: "6:47pm", from: "Missed call",
    asks: "Rang while both chairs were busy. No voicemail left.",
    answer: "Sorry we missed you, we’re with clients. What can we book you in for?",
    day: "Sat", row: "2pm Colour consult", tag: "BOOKED",
  },
  {
    channel: "whatsapp", label: "WhatsApp", note: "the one people already use", time: "7:26pm", from: "Hannah",
    asks: "How much for a full head of foils?",
    answer: "[YOUR PRICE], confirmed when Chloe’s seen your hair. Tuesday at 1? [DEPOSIT] holds it.",
    day: "Tue", row: "1pm Full head foils", tag: "DEPOSIT PAID",
  },
  {
    channel: "instagram", label: "Instagram", note: "DMs on the shop account", time: "8:03pm", from: "Leila",
    asks: "Do you do bridal hair? Wedding’s in June",
    answer: "We do. Sarah has a trial free on Wednesday at 4.",
    day: "Wed", row: "4pm Bridal trial", tag: "BOOKED",
  },
  {
    channel: "messenger", label: "Messenger", note: "from the Facebook page", time: "8:49pm", from: "Dawn",
    asks: "My colour’s gone brassy since last week. Not happy.",
    answer: "I’m sorry. I’ve passed this straight to Chloe and she’ll message you herself.",
    day: null, row: "Dawn · colour complaint", tag: "HANDED TO YOU",
  },
  {
    channel: "email", label: "Email", note: "the enquiry address", time: "9:34pm", from: "Beth",
    asks: "Could I get a fringe trim before work on Thursday?",
    answer: "Thursday 8:30 with Priya. You’re in.",
    day: "Thu", row: "8:30am Fringe trim", tag: "BOOKED",
  },
  {
    channel: "web", label: "Your website", note: "the assistant on the page", time: "10:18pm", from: "Ellie",
    asks: "Is Monday free for a restyle?",
    answer: "Monday 11am with Aisha. [DEPOSIT] holds the slot.",
    day: "Mon", row: "11am Restyle", tag: "DEPOSIT PAID",
  },
];

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The argument, as it was. Each card belongs to a moment in the evening. */
const ARGUMENT = [
  {
    head: "A diary doesn't answer",
    body: "Fresha, Booksy and Square are good diaries, and most of them are free. None of them reply to a message at nine on a Tuesday night. That's the bit you're losing.",
    from: 0,
  },
  {
    head: "It knows your prices",
    body: "It quotes from your own rates and never invents a number, never goes under your minimum, and always says the price is confirmed when you've seen the job.",
    from: 2,
  },
  {
    head: "It knows when to stop",
    body: "A complaint, anything medical, anyone under 18, anyone who asks for a person. It fetches you and stops talking. It never pretends to be you.",
    from: 4,
  },
];

/* Where each line starts down the left, in the 0–100 box the SVG is drawn in. */
const y = (i: number) => 7 + (i * 86) / (EVENING.length - 1);
const line = (i: number) =>
  EVENING[i].day
    ? `M 0 ${y(i)} C 46 ${y(i)}, 54 42, 100 42`
    : `M 0 ${y(i)} C 46 ${y(i)}, 54 91, 100 91`;

/** How far through one enquiry: asked, answered, travelling, landed. */
const ASKED = 0.08;
const ANSWERED = 0.34;
const LEAVES = 0.52;
const LANDS = 0.9;

export function TheEvening() {
  const live = useLive();
  /* Server and first paint: everything has already happened. */
  const [at, setAt] = useState({ step: EVENING.length - 1, stage: 3 });
  const dot = useRef<HTMLSpanElement>(null);
  const paths = useRef<(SVGPathElement | null)[]>([]);

  const ref = useProgress<HTMLElement>("pin", live, (p) => {
    const run = p * (EVENING.length + 0.6);
    const step = Math.min(EVENING.length - 1, Math.floor(run));
    const t = Math.min(1, run - step);
    const stage = t >= LANDS ? 3 : t >= ANSWERED ? 2 : t >= ASKED ? 1 : 0;
    setAt((was) => (was.step === step && was.stage === stage ? was : { step, stage }));

    /* The light: a dot at the right distance down the active line. */
    const path = paths.current[step];
    const el = dot.current;
    if (!path || !el) return;
    const along = Math.min(1, Math.max(0, (t - LEAVES) / (LANDS - LEAVES)));
    const pt = path.getPointAtLength(path.getTotalLength() * along);
    el.style.left = `${pt.x}%`;
    el.style.top = `${pt.y}%`;
    el.style.opacity = t > LEAVES && t < LANDS + 0.04 ? "1" : "0";
  });

  const landed = (i: number) => i < at.step || (i === at.step && at.stage === 3);
  const now = EVENING[at.step];
  const booked = EVENING.filter((e, i) => e.day && landed(i)).length;
  const handed = EVENING.filter((e, i) => !e.day && landed(i));
  const arguing = ARGUMENT.reduce((best, a, i) => (at.step >= a.from ? i : best), 0);

  return (
    <section ref={ref} className="sp-eve" data-live={live ? "" : undefined}>
      <div className="sp-eve-pin">
        <div className="shell sp-eve-in">
          <header className="sp-eve-head">
            <h2 className="font-display sp-eve-title">Seven ways in. One diary.</h2>
            <p className="sp-eve-lede">
              However somebody gets in touch, it is answered, quoted and booked into the same
              diary. Nobody retypes anything, and nothing sits in an app waiting for somebody
              to remember it.
            </p>
          </header>

          {/* The clock and the conversation. Only when it is playing. */}
          <div className="sp-eve-now" aria-hidden>
            <div className="sp-eve-clock font-display">
              {now.time.replace(/(am|pm)$/, "")}
              <small>{now.time.slice(-2)}</small>
            </div>
            <div className="sp-eve-who">
              <ChannelIcon channel={now.channel} className="size-4" />
              {now.from} · {now.label}
            </div>
            <div key={at.step} className="sp-eve-talk">
              <p className="sp-bub sp-bub-them" data-on={at.stage >= 1 ? "" : undefined}>
                {now.asks}
              </p>
              <p className="sp-bub sp-bub-us" data-on={at.stage >= 2 ? "" : undefined}>
                {now.answer}
              </p>
            </div>
          </div>

          {/* The whole evening as a list: what a phone, a reader and no script get. */}
          <ol className="sp-eve-list">
            {EVENING.map((e) => (
              <li key={e.channel}>
                <div className="sp-eve-list-top">
                  <span className="font-display">{e.time}</span>
                  <span className="sp-eve-chan">
                    <ChannelIcon channel={e.channel} className="size-4" />
                    {e.label}
                  </span>
                </div>
                <p className="sp-bub sp-bub-them" data-on="">{e.asks}</p>
                <p className="sp-bub sp-bub-us" data-on="">{e.answer}</p>
                <p className="sp-eve-result" data-handed={e.day ? undefined : ""}>
                  {e.day ? `${e.day} · ${e.row}` : e.row}
                  <span>{e.tag}</span>
                </p>
              </li>
            ))}
          </ol>

          {/* The seven ways in, and the lines. */}
          <div className="sp-eve-map" aria-hidden>
            <div className="sp-eve-wire">
              <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                {EVENING.map((e, i) => (
                  <path
                    key={e.channel}
                    ref={(el) => {
                      paths.current[i] = el;
                    }}
                    d={line(i)}
                    fill="none"
                    vectorEffect="non-scaling-stroke"
                    data-state={i === at.step ? "now" : landed(i) ? "done" : "wait"}
                  />
                ))}
              </svg>
              <span ref={dot} className="sp-eve-dot" />
            </div>
            <ul>
              {EVENING.map((e, i) => (
                <li
                  key={e.channel}
                  style={{ top: `${y(i)}%` }}
                  data-state={i === at.step ? "now" : landed(i) ? "done" : "wait"}
                >
                  <ChannelIcon channel={e.channel} className="size-5 shrink-0" />
                  <span>
                    <b>{e.label}</b>
                    <i>{e.note}</i>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Where it lands. */}
          <div className="sp-eve-diary" aria-hidden>
            <div className="sp-eve-diary-card">
              <div className="sp-eve-diary-top">
                <span className="font-display">Your diary</span>
                <span>{booked} booked</span>
              </div>
              {DAYS.map((d) => {
                const i = EVENING.findIndex((e) => e.day === d);
                const e = EVENING[i];
                const on = landed(i);
                return (
                  <div key={d} className="sp-eve-day">
                    <span>{d}</span>
                    <div data-on={on ? "" : undefined} data-paid={e.tag === "DEPOSIT PAID" ? "" : undefined}>
                      {on && (
                        <>
                          {e.row}
                          <em>{e.tag}</em>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="sp-eve-you" data-on={handed.length ? "" : undefined}>
              <span className="font-display">You</span>
              {handed.length ? (
                <p>
                  {handed[0].row}
                  <em>{handed[0].tag}</em>
                </p>
              ) : (
                <p>Nothing needs you yet.</p>
              )}
            </div>
          </div>

          {/* The argument. All three always there; the one in play is lit. */}
          <div className="sp-eve-arg">
            {ARGUMENT.map((a, i) => (
              <div key={a.head} className="index-item" data-on={i === arguing ? "" : undefined}>
                <h3 className="section-title text-base">{a.head}</h3>
                <p>{a.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
