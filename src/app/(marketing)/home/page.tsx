import Link from "next/link";
import type { Metadata } from "next";
import { VERTICALS_BY_CATEGORY, VERTICAL_LIST } from "@/lib/verticals";

export const metadata: Metadata = {
  title: "Second Pair — you work, we answer",
  description:
    "An AI receptionist for one-person businesses. Answers enquiries, quotes, and books people in while your hands are busy.",
};

/*
 * The pitch.
 *
 * The whole page argues one thing: you are losing work during the hours you
 * are working, and nothing you currently pay for fixes that. Diaries are not
 * the competition — silence is. So the hero is a conversation happening at
 * 9pm on a Tuesday rather than a screenshot of a calendar, because the
 * conversation is the product and the calendar is the table stakes.
 */

const CONVERSATION = [
  { from: "them", text: "hi, do you do fuse board upgrades? had a quote for £900 and it seems steep" },
  {
    from: "us",
    text: "We do — a board upgrade with us is usually £450 to £650, around 5 hours on site. That's an estimate and Giles confirms it once he's seen the setup. Whereabouts are you?",
  },
  { from: "them", text: "BS16. can you do next week?" },
  {
    from: "us",
    text: "BS16 is well within our patch. Giles has Tuesday 9am or Thursday 1pm free — either any good?",
  },
  { from: "them", text: "thursday please" },
  {
    from: "us",
    text: "Booked in — Thursday 4 September at 1pm, and I've got your number. Anything else you need before then?",
  },
];

export default function HomePage() {
  return (
    <>
      {/* ─────────────────────────────────────────────────────────── hero */}
      <section className="mx-auto max-w-5xl px-5 pb-4 pt-14 sm:px-8 sm:pt-20">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_1fr]">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted">
              <span className="size-1.5 rounded-full bg-ok" aria-hidden />
              Answering right now, for {VERTICAL_LIST.length} trades
            </p>

            <h1 className="mt-5 font-display text-[2.6rem] font-bold leading-[1.03] tracking-[-0.035em] sm:text-6xl">
              You lose the job
              <br />
              <span className="text-accent">because you were working.</span>
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
              You&rsquo;re under a floor. You&rsquo;ve got a needle in someone&rsquo;s arm.
              You&rsquo;re mid-colour. The phone goes, a DM lands, and four hours later
              they&rsquo;ve booked whoever replied first.
            </p>

            <p className="mt-4 max-w-xl text-lg leading-relaxed">
              Second Pair answers in under a minute, quotes from your own prices, and puts them
              in your diary — in your words, while your hands are full.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/login"
                className="btn inline-flex bg-highlight px-5 text-[0.95rem] font-semibold text-on-highlight hover:brightness-95"
              >
                Start free
              </Link>
              <span className="text-sm text-muted">
                Set up in about a minute. No card.
              </span>
            </div>
          </div>

          {/* The product, being the product. */}
          <div className="card overflow-hidden p-0">
            <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-on-accent">
                FE
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">Foster Electrical</div>
                <div className="flex items-center gap-1.5 text-xs text-muted">
                  <span className="size-1.5 rounded-full bg-ok" aria-hidden />
                  Usually replies in under a minute
                </div>
              </div>
              <span className="num ml-auto shrink-0 text-[11px] text-muted">21:47</span>
            </div>

            <div className="space-y-2.5 p-4">
              {CONVERSATION.map((line, i) => (
                <div
                  key={i}
                  className={`max-w-[86%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    line.from === "them"
                      ? "ml-auto rounded-br-sm bg-accent text-on-accent"
                      : "rounded-tl-sm bg-surface-2"
                  }`}
                >
                  {line.text}
                </div>
              ))}
            </div>

            <p className="border-t border-border px-4 py-2.5 text-center text-[11px] text-muted">
              A real conversation shape. Nobody at Foster Electrical was awake.
            </p>
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────── the argument */}
      <section className="mx-auto max-w-5xl px-5 py-16 sm:px-8 sm:py-24">
        <div className="grid gap-10 sm:grid-cols-3">
          {[
            {
              head: "A diary doesn't answer",
              body: "Fresha, Booksy and Square are good diaries, and most of them are free. None of them reply to a message at nine on a Tuesday night. That's the bit you're losing.",
            },
            {
              head: "It knows your prices",
              body: "It quotes from your own rates and never invents a number, never goes under your minimum, and always says the price is confirmed when you've seen the job.",
            },
            {
              head: "It knows when to stop",
              body: "A complaint, anything medical, anyone under 18, anyone who asks for a person — it fetches you and stops talking. It never pretends to be you.",
            },
          ].map((card) => (
            <div key={card.head}>
              <h2 className="section-title text-base">{card.head}</h2>
              <p className="mt-2.5 text-sm leading-relaxed text-muted">{card.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────── the trades */}
      <section className="border-y border-border bg-surface">
        <div className="mx-auto max-w-5xl px-5 py-16 sm:px-8 sm:py-20">
          <h2 className="page-title">Built for whatever you actually do</h2>
          <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-muted">
            Each trade brings its own questions, services, wording and reminders — and its
            own sense. The gas engineer won&rsquo;t book someone who says they can smell
            gas, it gives them the emergency number. The plumber tells a burst pipe where
            the stopcock is first.
          </p>

          <div className="mt-8 space-y-6">
            {VERTICALS_BY_CATEGORY.map((group) => (
              <div key={group.category}>
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                  {group.category}
                </h3>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {group.trades.map((pack) => (
                    <span
                      key={pack.id}
                      className="rounded-full border border-border bg-background px-2.5 py-1 text-xs"
                    >
                      {pack.label}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────── the detail */}
      <section className="mx-auto max-w-5xl px-5 py-16 sm:px-8 sm:py-24">
        <h2 className="page-title">And it runs the rest of it</h2>

        <div className="mt-8 grid gap-x-10 gap-y-8 sm:grid-cols-2">
          {[
            ["A proper diary", "Day, week and person views, repeats, blocks, all-day entries. Or keep the Fresha diary you already have — it reads that too."],
            ["Deposits, if you want them", "Straight to your bank through Stripe at their normal rate. Second Pair takes nothing from it. Off entirely for trades that invoice after."],
            ["A link each", "In a salon, every stylist gets their own link for their own Instagram. Enquiries there are theirs, and it never asks who you'd like."],
            ["Reminders that suit the job", "Bring photo ID for a tattoo. Come with dry hair for a colour. Leave access and somewhere to park for a sparky."],
            ["Client records", "History, what they've spent, no-shows, and a private note that flags every time they come back."],
            ["On your phone", "Add it to your home screen and it works like an app. No app store, no waiting."],
          ].map(([head, body]) => (
            <div key={head}>
              <h3 className="section-title text-[0.95rem]">{head}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────── close */}
      <section className="border-t border-border bg-surface">
        <div className="mx-auto max-w-5xl px-5 py-20 text-center sm:px-8">
          <h2 className="page-title text-3xl sm:text-4xl">
            The enquiries arrive whether you&rsquo;re free or not.
          </h2>
          <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-muted">
            Set it up in about a minute and see what it says to the next one.
          </p>
          <Link
            href="/login"
            className="btn mt-8 inline-flex bg-highlight px-6 text-[0.95rem] font-semibold text-on-highlight hover:brightness-95"
          >
            Start free
          </Link>
        </div>
      </section>
    </>
  );
}
