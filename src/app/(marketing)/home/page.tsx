import Link from "next/link";
import { Logo } from "@/components/Logo";
import { LiveDemo } from "./LiveDemo";
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

/*
 * A salon, because that is who is reading.
 *
 * This was an electrician, and electricians are a good fit — but the hair and
 * beauty trades are where most of this business is, and a colour enquiry at
 * nine at night is the exact thing a stylist recognises. The names are made
 * up; the shape of the conversation is not.
 */
const SALON = { name: "Bell Lane Hair", initials: "BL", brand: "#8A4B63", onBrand: "#ffffff" };

/**
 * The next Saturday, and the two after it, at a civilised hour.
 *
 * Worked out on the server so the demo shows dates that are actually ahead of
 * whoever is reading — a hard-coded Saturday is fine for a week and then
 * quietly starts offering appointments in the past.
 */
function saturdays() {
  const day = new Date();
  day.setHours(10, 0, 0, 0);
  day.setDate(day.getDate() + ((6 - day.getDay() + 7) % 7 || 7));

  const format = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Europe/London",
  });

  return [0, 1, 2].map((week) => {
    const start = new Date(day);
    start.setDate(start.getDate() + week * 7);
    if (week === 1) start.setHours(13, 30, 0, 0);
    if (week === 2) start.setHours(11, 0, 0, 0);
    const end = new Date(start.getTime() + 180 * 60_000);
    /* The same two parts the real widget receives, so the demo is a picture of
       the product rather than of an older version of it. */
    const day_ = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      weekday: "short",
      day: "numeric",
      month: "short",
    }).format(start);
    const time = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
      .format(start)
      .replace(/\s?([ap])m$/i, (_m, half) => `${half.toLowerCase()}m`);

    return {
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      label: format.format(start).replace(" at ", " at ").replace(/,/g, ""),
      day: day_,
      time,
    };
  });
}

const SLOTS = saturdays();

const CONVERSATION = [
  { who: "them", text: "hiya do you do balayage? roughly how much" },
  {
    who: "us",
    text: "We do — balayage with Nadia is usually £120 to £160 depending on your length and how much lift you're after, and it's about three hours in the chair.",
    moment: {
      kind: "quote",
      label: "Balayage",
      person: "Nadia",
      lowPence: 12000,
      highPence: 16000,
      note: null,
      depositPence: 2500,
      hoursLow: 3,
      hoursHigh: 3,
      needsConsultation: false,
    },
  },
  { who: "them", text: "perfect. any saturdays?" },
  {
    who: "us",
    text: "She's got three Saturdays going — which suits?",
    moment: {
      kind: "slots",
      person: "Nadia",
      minutes: 180,
      appointment: "session",
      slots: SLOTS.map((s) => ({ startsAt: s.startsAt, label: s.label, day: s.day, time: s.time })),
    },
  },
  { who: "tap", slot: 0 },
  {
    who: "us",
    text: "Lovely — you're in with Nadia. I'll text you the day before, and if you change your mind about the length just say.",
    moment: {
      kind: "booked",
      person: "Nadia",
      startsAt: SLOTS[0].startsAt,
      day: SLOTS[0].day,
      time: SLOTS[0].time,
      endsAt: SLOTS[0].endsAt,
      label: SLOTS[0].label,
      held: false,
    },
  },
] as const;

export default function HomePage() {
  return (
    <>
      {/* ─────────────────────────────────────────────────────────── hero */}
      {/*
       * Ink as a frame, not as a field.
       *
       * The whole top of the page was put on the brand navy and Giles was
       * right about the result: a large flat dark block is not more impressive
       * than a large flat pale one, it is the same absence of structure in a
       * different colour. The diagnosis held — forty-odd elements on one tone,
       * no ground, no rhythm — and painting all of it was the wrong cure.
       *
       * So the navy stays where it frames: the header above, and one band
       * lower down. The hero is light again, and earns its keep with type and
       * air instead — a bigger headline, more room around it, and the demo
       * lifted properly so it reads as an object rather than a panel.
       */}
      <section className="relative overflow-hidden px-5 pb-6 pt-16 sm:px-8 sm:pt-24">
        <div className="aura" aria-hidden />
        <div className="relative mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-[1fr_1.02fr] lg:gap-20">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted">
              <span className="size-1.5 rounded-full bg-ok" aria-hidden />
              Answering right now, for {VERTICAL_LIST.length} trades
            </p>

            {/*
             * The name is the argument, so the headline should be the name.
             *
             * "You lose the job because you were working" states the problem
             * well and leaves Second Pair as a label bolted on beside it. This
             * says the problem and what we are in one breath, and anybody who
             * reads it understands the name for the rest of the page.
             */}
            <h1 className="mt-6 font-display text-[2.9rem] font-bold leading-[0.99] tracking-[-0.04em] text-balance sm:text-[4.4rem]">
              You&rsquo;ve only got
              <br />
              one pair of hands.
              <br />
              <span className="text-highlight-strong">We&rsquo;re the second.</span>
            </h1>

            <p className="mt-7 max-w-xl text-[1.15rem] leading-relaxed text-muted">
              You&rsquo;re under a floor. You&rsquo;ve got a needle in someone&rsquo;s arm.
              You&rsquo;re mid-colour. The phone goes, a DM lands, and four hours later
              they&rsquo;ve booked whoever replied first.
            </p>

            <p className="mt-4 max-w-xl text-[1.15rem] leading-relaxed">
              Second Pair answers in under a minute, quotes from your own prices, and puts them
              in your diary — in your words, while your hands are full.
            </p>

            {/*
              * The call to action is the product.
              *
              * This said "Start free — no card", which promised a self-serve
              * signup: pick a password, land in an empty account, work out your
              * own prices and hours and tone. That is not what happens. Every
              * business so far has been set up with them, on a call, and there
              * is no billing behind the button to make "free" mean anything yet.
              * A promise the door cannot keep is a bad first impression from a
              * product whose entire pitch is answering honestly.
              *
              * So the button does the thing instead. It hands them to our own
              * assistant, which answers whatever they want to ask and passes
              * them to a person — which is exactly what theirs would do, on the
              * page where we are claiming it works.
              */}
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a
                href="#ask"
                className="btn inline-flex bg-highlight px-5 text-[0.95rem] font-semibold text-on-highlight hover:brightness-95"
              >
                Ask ours anything
              </a>
              <span className="text-sm text-muted">
                It answers now. We set yours up with you.
              </span>
            </div>
          </div>

          {/* The product, being the product — actually doing it. */}
          <div id="see-it" className="scroll-mt-24">
            <LiveDemo
              script={CONVERSATION}
              brand={SALON.brand}
              onBrand={SALON.onBrand}
              business={SALON.name}
              initials={SALON.initials}
              supportSlug={process.env.NEXT_PUBLIC_SUPPORT_SLUG}
            />
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────── the argument */}
      {/*
       * The one dark band on the page.
       *
       * This is where the ink earns its place rather than filling the screen.
       * Three claims about what the thing will and will not do is the part a
       * sceptical reader is actually weighing, so it gets the weight of the
       * brand colour, and the page goes light again underneath it.
       *
       * One band, not several. A page that alternates dark and light every
       * section is a template; a page with a single change of ground has a
       * shape.
       */}
      <section className="bg-accent text-on-accent">
        <div className="mx-auto grid max-w-5xl gap-10 px-5 py-20 sm:grid-cols-3 sm:px-8 sm:py-24">
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
              <h2 className="section-title text-[1.05rem] text-on-accent">{card.head}</h2>
              <p className="mt-3 text-[0.95rem] leading-relaxed text-on-accent/70">{card.body}</p>
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

      {/* ───────────────────────────────────────────────────────── websites */}
      {/*
        * A section of its own, because it is a thing you can buy on its own.
        *
        * Giles has started building websites and has one live —
        * livingcanvastattoo.ink — and it sells with or without the assistant.
        * Folding it into the feature list above would make it read as something
        * the software does, which is the one thing it is not: it is work
        * somebody does, for a price, and a business can buy it having never
        * heard of the rest of this.
        *
        * No price on it. There is not one yet, and a number invented here is a
        * number somebody holds you to.
        */}
      <section className="border-y border-border bg-surface">
        <div className="mx-auto max-w-5xl px-5 py-16 sm:px-8 sm:py-24">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            Also from us
          </p>

          <h2 className="page-title mt-3 max-w-[22ch]">
            We build the website too, if you need one
          </h2>

          <p className="mt-4 max-w-[54ch] text-base leading-relaxed text-muted">
            Plenty of good tradespeople have no website, or one built years ago by
            somebody who has stopped answering. We build it, host it, and keep it
            working &mdash; and you can have it whether or not you ever use the
            assistant.
          </p>

          <div className="mt-8 grid gap-x-10 gap-y-7 sm:grid-cols-2">
            {[
              [
                "Built around the work, not a template",
                "Your trade, your photographs, your prices if you want them shown. It says what you actually do rather than what a theme assumed.",
              ],
              [
                "Looked after",
                "Hosting, the certificate, the updates and the small changes as the business changes. Nothing to renew and nobody to chase.",
              ],
              [
                "Found by the people looking",
                "Set up properly for search and for a phone, which is where nearly everybody will see it.",
              ],
              [
                "The assistant on it, or not",
                "If you have Second Pair, it answers on the site from the first day. If you do not, the site is still yours and works perfectly well without it.",
              ],
            ].map(([head, body]) => (
              <div key={head}>
                <h3 className="section-title text-[0.95rem]">{head}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{body}</p>
              </div>
            ))}
          </div>

          {/*
            * One real example rather than a gallery of none.
            *
            * It is the only one so far, and saying so is better than implying a
            * portfolio that does not exist yet — the first question anybody
            * asks is "what have you done", and one honest answer beats three
            * vague ones.
            */}
          <div className="mt-9 rounded-2xl border border-border bg-background p-6">
            <p className="text-sm leading-relaxed text-muted">
              Most recently:{" "}
              <a
                href="https://livingcanvastattoo.ink"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-accent underline underline-offset-2"
              >
                livingcanvastattoo.ink
              </a>{" "}
              &mdash; a tattoo studio in Devon, with the assistant answering on it.
            </p>
            <a href="mailto:info@second-pair.com?subject=A%20website" className="btn-highlight mt-5 inline-flex">
              Ask about a website
            </a>
          </div>
        </div>
      </section>

      {/* ────────────────────────────────────────────────────────── company */}
      {/*
        * Who is behind it, immediately before the last ask.
        *
        * The question a business has at this point in the page is not what the
        * product does — that is the whole page above — it is whether the people
        * behind it will still be here in a year. Somebody handing over the
        * first thing every new customer sees wants to know they are not the
        * only customer of a side project.
        *
        * So Family APP! is here as evidence, not as a second offer. The
        * heading is the company, the claim is that it ships things people use
        * daily, and the two products are the proof of the claim. Nothing here
        * is a button: the only call to action on this page is the one
        * underneath, and a second one competing with it at the closing moment
        * is the one mistake a sales page cannot make.
        *
        * Placed after the entire argument and before the close, which is where
        * proof goes — ahead of it, it is an interruption; below the close, it
        * is never read.
        */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-5xl px-5 py-16 sm:px-8 sm:py-20">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            Made by Second Pair Ltd
          </p>

          <h2 className="page-title mt-3 max-w-[24ch] text-2xl sm:text-3xl">
            We build things people use every day, not demos
          </h2>

          <p className="mt-4 max-w-[46ch] text-base leading-relaxed text-muted">
            A small software company in Devon. Two products, both in daily use by people
            who are not us &mdash; which is the only test that has ever told us anything.
          </p>

          <div className="mt-9 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2">
            <div className="flex min-w-0 flex-col bg-background p-6">
              <div className="flex items-center gap-2.5">
                <Logo height={26} lockup="horizontal" />
                <span className="pill bg-ok/10 text-ok">Live</span>
              </div>
              <p className="mt-3.5 flex-1 text-sm leading-relaxed text-muted">
                This. Answering enquiries for tattooists, salons, cleaners and trades
                &mdash; in their voice, from their prices, into their diary.
              </p>
            </div>

            <div className="flex min-w-0 flex-col bg-background p-6">
              <div className="flex items-center gap-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/family/icon-96.png"
                  alt=""
                  width={26}
                  height={26}
                  className="shrink-0 rounded-[7px]"
                />
                <span className="text-[0.95rem] font-semibold">Family APP!</span>
                <span className="pill bg-surface-2 text-muted">Early access</span>
              </div>
              <p className="mt-3.5 flex-1 text-sm leading-relaxed text-muted">
                A private hub for one family &mdash; chat, photos, a shared calendar and
                an AI holiday planner. Built because we wanted it at home.
              </p>
              <Link
                href="/family-app"
                className="mt-4 text-sm font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-current"
              >
                Have a look
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────── close */}
      <section className="border-t border-border bg-surface">
        <div className="mx-auto max-w-5xl px-5 py-20 text-center sm:px-8">
          <h2 className="page-title text-3xl sm:text-4xl">
            The enquiries arrive whether you&rsquo;re free or not.
          </h2>
          <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-muted">
            Ask ours what you want to know. It answers straight away, and it will put you
            in front of a person to get you set up.
          </p>
          <a
            href="#ask"
            className="btn mt-8 inline-flex bg-highlight px-6 text-[0.95rem] font-semibold text-on-highlight hover:brightness-95"
          >
            Ask ours anything
          </a>
        </div>
      </section>
    </>
  );
}
