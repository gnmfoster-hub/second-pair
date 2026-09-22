import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Hero } from "./Hero";
import type { Metadata } from "next";
import { VERTICALS_BY_CATEGORY } from "@/lib/verticals";

export const metadata: Metadata = {
  title: "Second Pair. You work, we answer",
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

export default function HomePage() {
  return (
    <>
      {/*
        * The hero, DESIGN.md §6, §7 and §8.
        *
        * Everything that was here — the badge, the headline, the sub, the
        * buttons and the old LiveDemo panel — is now one component, because
        * the demo and the words are one thing: the headline says there is a
        * second pair of hands and the panel beside it is them working.
        */}
      <section className="relative overflow-hidden">
        <Hero />
      </section>

      {/* ──────────────────────────────────────────────────── the argument */}
      <section className="shell py-16 sm:py-24">
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
              body: "A complaint, anything medical, anyone under 18, anyone who asks for a person. It fetches you and stops talking. It never pretends to be you.",
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
        <div className="shell py-16 sm:py-20">
          <h2 className="page-title">Built for whatever you actually do</h2>
          <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-muted">
            Each trade brings its own questions, services, wording and reminders, and its
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
      <section className="shell py-16 sm:py-24">
        <h2 className="page-title">And it runs the rest of it</h2>

        <div className="mt-8 grid gap-x-10 gap-y-8 sm:grid-cols-2">
          {[
            ["A proper diary", "Day, week and person views, repeats, blocks, all-day entries. Or keep the Fresha diary you already have. It reads that too."],
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
        <div className="shell py-16 sm:py-24">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            Also from us
          </p>

          <h2 className="page-title mt-3 max-w-[22ch]">
            We build the website too, if you need one
          </h2>

          <p className="mt-4 max-w-[54ch] text-base leading-relaxed text-muted">
            Plenty of good tradespeople have no website, or one built years ago by
            somebody who has stopped answering. We build it, host it, and keep it
            working, and you can have it whether or not you ever use the
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
              is a tattoo studio in Devon, with the assistant answering on it.
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
        <div className="shell py-16 sm:py-20">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            Made by Second Pair Ltd
          </p>

          <h2 className="page-title mt-3 max-w-[24ch] text-2xl sm:text-3xl">
            We build things people use every day, not demos
          </h2>

          <p className="mt-4 max-w-[46ch] text-base leading-relaxed text-muted">
            A small software company in Devon. Two products, both in daily use by people
            who are not us. That is the only test that has ever told us anything.
          </p>

          <div className="mt-9 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2">
            <div className="flex min-w-0 flex-col bg-background p-6">
              <div className="flex items-center gap-2.5">
                <Logo height={26} lockup="horizontal" />
                <span className="pill bg-ok/10 text-ok">Live</span>
              </div>
              <p className="mt-3.5 flex-1 text-sm leading-relaxed text-muted">
                This. Answering enquiries for tattooists, salons, cleaners and trades
                in their voice, from their prices, into their diary.
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
                A private hub for one family: chat, photos, a shared calendar and
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
      {/*
        * The closing band, §8.
        *
        * Cobalt, and the only large blue background on the site — §2 allows it
        * here and nowhere else. The button on it is the ink one, because white
        * on cobalt and cobalt on cobalt are both wrong and ink is the pair the
        * palette already has.
        *
        * The words are the ones that were here. §8 names this band and gives
        * it a headline; changing what it says is a copy decision and Giles asked
        * to be asked, so the line stays and the treatment changes.
        */}
      <section style={{ background: "var(--accent)", color: "var(--on-accent)" }}>
        {/*
          * Left, not centred. §3: "Headlines are stacked, one phrase per line,
          * never centred." A closing band is the one place the centred reflex
          * is strongest, which is presumably why the rule is written down.
          *
          * §8 writes this headline as "GIVE US THE SECOND PAIR." Giles wanted
          * "a second pair of hands", which is the company's own line and the
          * one the logo pack gives as an approved slogan, so it says that. The button is left alone: §8
          * wants "Book a 15 minute chat" there, but the one that is there
          * opens the live assistant, and swapping where a button goes is
          * behaviour, not appearance.
          */}
        <div className="shell py-20">
          <h2
            style={{
              fontFamily: "var(--font-display), Impact, sans-serif",
              textTransform: "uppercase",
              lineHeight: 0.96,
              letterSpacing: "0.01em",
              fontSize: "clamp(40px, 5vw, 64px)",
              maxWidth: "14ch",
            }}
          >
            Give us a second pair of hands!
          </h2>
          <p className="mt-5 max-w-md text-base leading-relaxed" style={{ opacity: 0.85 }}>
            Ask ours what you want to know. It answers straight away, and it will put you
            in front of a person to get you set up.
          </p>
          <a href="#ask" className="btn-ink mt-9 inline-flex" style={{ minHeight: 54 }}>
            Ask ours anything
          </a>
        </div>
      </section>
    </>
  );
}
