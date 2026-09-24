import { ChannelIcon } from "@/components/ChannelIcon";
import type { Channel } from "@/lib/types";

/**
 * Everything that reaches a business, landing in one diary.
 *
 * Giles: "would be good to have like all the possible channels listed with
 * logos/icons like a mind map with all of them feeding the diary and like a
 * live light going down the line channel to diary just to show off what can be
 * fed into the diary automatically without any human intervention."
 *
 * The argument the site makes in words — a diary doesn't answer — is the one
 * thing a picture can make faster than a sentence. Seven ways in, one diary,
 * and nobody typing.
 *
 * Every channel here is one the product actually answers on. Nothing
 * aspirational: a line into the diary from something we cannot do yet would be
 * the one piece of this page that is not true.
 *
 * No JavaScript. The light is a dash travelling along each path, which CSS can
 * do on its own — so it works before hydration, costs nothing, and stops for
 * anybody who has asked for less motion. A marketing page that needs a
 * framework to animate a line is a slower page for no reason.
 */

const WAYS: { channel: Channel; label: string; note: string }[] = [
  { channel: "sms", label: "Text message", note: "the number on the van" },
  { channel: "voice", label: "A phone call", note: "answered, or texted back" },
  { channel: "whatsapp", label: "WhatsApp", note: "the one people already use" },
  { channel: "instagram", label: "Instagram", note: "DMs on the shop account" },
  { channel: "messenger", label: "Messenger", note: "from the Facebook page" },
  { channel: "email", label: "Email", note: "the enquiry address" },
  { channel: "web", label: "Your website", note: "the assistant on the page" },
];

export function IntoTheDiary() {
  /* Evenly down the left, with room top and bottom so nothing touches an edge. */
  const y = (i: number) => 8 + (i * 84) / (WAYS.length - 1);

  return (
    <section className="shell py-16 sm:py-24">
      <h2 className="font-display text-3xl sm:text-5xl">Seven ways in. One diary.</h2>
      <p className="mt-3 max-w-prose text-muted">
        However somebody gets in touch, it is answered, quoted and booked into the same
        diary. Nobody retypes anything, and nothing sits in an app waiting for somebody to
        remember it.
      </p>

      <div className="relative mt-10 grid gap-6 sm:mt-14 sm:aspect-[16/9] sm:gap-0">
        {/*
          * The lines, behind everything, stretched to whatever box this ends up
          * in. non-scaling-stroke keeps them an even weight while the box
          * stretches, which is the whole reason a distorted viewBox is safe
          * here.
          */}
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden
          className="pointer-events-none absolute inset-0 hidden size-full sm:block"
        >
          {WAYS.map((way, i) => (
            <g key={way.channel}>
              <path
                d={`M 26 ${y(i)} C 48 ${y(i)}, 52 50, 71.5 50`}
                fill="none"
                stroke="var(--border)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
              {/*
                * The light. One dash, the length of a short run, travelling the
                * path — each channel a beat behind the last so they arrive one
                * at a time rather than as a pulse.
                */}
              <path
                className="feed"
                style={{ animationDelay: `${i * 0.55}s` }}
                d={`M 26 ${y(i)} C 48 ${y(i)}, 52 50, 71.5 50`}
                fill="none"
                stroke="var(--accent)"
                strokeWidth="2"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          ))}
        </svg>

        {/* The ways in. A plain list on a phone, down the left above it. */}
        <ul className="contents">
          {WAYS.map((way, i) => (
            <li
              key={way.channel}
              className="z-10 flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2 sm:absolute sm:w-[24%] sm:-translate-y-1/2"
              style={{ top: `${y(i)}%` }}
            >
              <ChannelIcon channel={way.channel} className="size-5 shrink-0 text-muted" />
              <span className="min-w-0">
                <span className="block text-sm font-medium leading-tight">{way.label}</span>
                <span className="block truncate text-xs text-muted">{way.note}</span>
              </span>
            </li>
          ))}
        </ul>

        {/* And where it all lands. */}
        <div className="z-10 rounded-2xl border border-foreground bg-surface p-5 shadow-[var(--shadow-card)] sm:absolute sm:right-0 sm:top-1/2 sm:w-[28%] sm:-translate-y-1/2">
          <div className="font-display text-xl">Your diary</div>
          <p className="mt-1 text-sm text-muted">
            Booked, with the right person, the right length and the deposit asked for.
          </p>
          <p className="mt-3 text-xs text-muted">
            You find out because it is already in there.
          </p>
        </div>
      </div>

      {/*
        * Scoped to this section rather than globals.css, because it is the only
        * thing on the site that does it.
        *
        * The dash maths is explained where it is written, below.
        */}
      <style>{`
        /*
          * One light per line, and an even weight.
          *
          * Both at once took two goes. non-scaling-stroke keeps the line the
          * same width while the viewBox stretches — without it the "light" is a
          * fat blob, because a stroke of 2 in a box 100 units wide drawn at
          * 1150px is 23 pixels across. But with it, dash lengths are measured
          * in the stretched space and pathLength is ignored, so a short gap
          * repeats and the line reads as a dotted rule rather than one light.
          *
          * So: a gap longer than any path here. Only one dash can be on a line
          * at a time, whatever the box is doing.
          */
        .feed {
          stroke-dasharray: 16 900;
          stroke-dashoffset: 916;
          animation: feed 4.2s linear infinite;
        }
        @keyframes feed {
          to { stroke-dashoffset: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .feed { animation: none; stroke-dasharray: none; stroke-dashoffset: 0; opacity: 0.35; }
        }
      `}</style>
    </section>
  );
}
