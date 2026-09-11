import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Fraunces, Plus_Jakarta_Sans, Caveat } from "next/font/google";
import { EarlyAccess } from "./EarlyAccess";

/**
 * Family APP!, the second thing Second Pair Ltd makes.
 *
 * Deliberately not in Second Pair's navy and orange. A product page wearing the
 * parent's brand reads as a feature of the parent, and this is a separate
 * product for a completely different person — a family rather than a business.
 * It gets its own palette, its own type and its own voice, with one quiet line
 * tying it back to the company.
 *
 * Loaded only on this route, so nobody arriving at the receptionist's sales
 * page downloads three typefaces for a page they will never open.
 */

const display = Fraunces({
  variable: "--fa-display",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  display: "swap",
});

const body = Plus_Jakarta_Sans({
  variable: "--fa-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const hand = Caveat({
  variable: "--fa-hand",
  subsets: ["latin"],
  weight: ["500", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Family APP! — the anti-generic family organiser",
  description:
    "A private family hub: chat, photos, a shared calendar, meal plans, an AI holiday planner and 26 themes. Built by Second Pair Ltd.",
  /*
   * Its own card, because the root layout's is Second Pair's.
   *
   * Without this every shared link to this page rendered under a receptionist's
   * artwork and the words "you work, we answer" — which is the wrong product
   * described to the wrong person. A link that somebody pastes into a group
   * chat is the main way a family app travels, and it was the one place the
   * product had no say in how it looked.
   */
  openGraph: {
    type: "website",
    title: "Family APP!",
    description:
      "Chat, photos, dates, meal plans and an AI holiday planner — a private hub for one family.",
    images: [{ url: "/family/social-card.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Family APP!",
    description: "The anti-generic family organiser. Built by Second Pair Ltd.",
    images: ["/family/social-card.png"],
  },
};

/** The seven modules, as the app itself groups them. */
const MODULES = [
  {
    name: "Chat",
    line: "The heart of it",
    points: [
      ["Main chat", "Text, photos, voice notes, files, locations and GIFs, in one thread everybody lands in."],
      ["Breakouts", "Spin a side conversation off any message — planning a surprise, sorting logistics. Invite-only if you want."],
      ["Video calls", "Free group video, straight from the chat. No accounts, no app switching."],
      ["Swipe to reply", "Swipe any message to quote it. Tap the quote to jump back to what it answered."],
      ["Saved messages", "Bookmark an address, a recipe, anything worth finding again — in its own list."],
      ["Streaks", "A running family streak, with confetti at the milestones."],
    ],
  },
  {
    name: "Photos",
    line: "Nothing buried in a camera roll",
    points: [
      ["Shared board and albums", "One photo or a whole day, with people tagged."],
      ["Save to your gallery", "Anybody's photo onto your own phone in one tap."],
      ["On This Day", "A photo from exactly this date in a past year, brought back on its own."],
    ],
  },
  {
    name: "Dates",
    line: "Never let “I forgot” happen again",
    points: [
      ["Countdowns", "Pin anything worth counting down to. It appears over the chat as it gets close."],
      ["Birthdays and wishlists", "Ages keep themselves up to date, confetti on the day, and a shared list of what they actually want."],
      ["Family calendar", "A proper shared one, taggable to just the people it concerns."],
    ],
  },
  {
    name: "Food",
    line: "What's for dinner, settled",
    points: [["Meal plans", "Post what you are cooking, invite whoever you want, keep it quiet if it is a surprise."]],
  },
  {
    name: "Holiday planner",
    line: "The bit that usually takes a spreadsheet",
    points: [
      ["AI suggestions", "Give it your dates, a budget and who is coming — children's ages included — and it comes back with real, grounded ideas."],
      ["Or bring your own", "Paste a link or a few rough notes and it turns them into something the family can vote on."],
      ["Vote, then confirm", "Everybody votes. Confirming turns it into a countdown with its own photo."],
    ],
  },
  {
    name: "Family Pulse",
    line: "Under More, for when it is wanted",
    points: [
      ["The pulse", "Your streak, a daily brief of what you missed, and a gentle nudge when it goes quiet."],
      ["Where everybody is", "Entirely opt in, never automatic."],
      ["Free stuff, favours, deals", "Offer something to the family before it goes on Facebook. Ask for a lift, childcare or a hand. Share the discount codes and the household logins."],
    ],
  },
];

export default function FamilyAppPage() {
  return (
    <div
      className={`${display.variable} ${body.variable} ${hand.variable} fa`}
      /*
       * The whole palette as inline variables on one wrapper.
       *
       * Nothing here leaks into the rest of the site and nothing from the rest
       * of the site reaches in. The alternative — adding a second theme to the
       * app's stylesheet — would have every Second Pair screen carrying colours
       * only this page uses.
       */
      style={
        {
          "--fa-paper": "#fdf6e9",
          "--fa-card": "#fffdf7",
          "--fa-bezel": "#efe6d6",
          "--fa-ink": "#2b2420",
          "--fa-ink-soft": "#6b5c4d",
          "--fa-ink-faint": "#9c8d7c",
          "--fa-marigold": "#e2a138",
          "--fa-marigold-ink": "#a86a12",
          "--fa-teal": "#3f6e68",
          "--fa-teal-deep": "#2c4f4a",
          "--fa-berry": "#b5495b",
          "--fa-line": "rgba(43,36,32,0.12)",
        } as React.CSSProperties
      }
    >
      <style>{`
        .fa { background: var(--fa-paper); color: var(--fa-ink); font-family: var(--fa-body), ui-sans-serif, system-ui, sans-serif; }
        .fa h1, .fa h2, .fa h3 { font-family: var(--fa-display), Georgia, serif; text-wrap: balance; }
        .fa-hand { font-family: var(--fa-hand), cursive; }
        .fa-card { background: var(--fa-card); border: 1px solid var(--fa-line); border-radius: 14px; }
        .fa-eyebrow { font-size: 0.7rem; font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase; color: var(--fa-marigold-ink); }
        .fa-pill { font-size: 0.78rem; font-weight: 600; padding: 0.3rem 0.75rem; border-radius: 999px; background: color-mix(in srgb, var(--fa-teal) 12%, var(--fa-card)); border: 1px solid color-mix(in srgb, var(--fa-teal) 26%, transparent); color: var(--fa-teal-deep); }
        /*
         * Deliberately one look, not two.
         *
         * The app itself has twenty-six themes and this page is cream paper. A
         * dark variant of a page whose whole argument is "it has a personality"
         * would be a third personality nobody chose.
         */
      `}</style>

      {/* ============================================================ hero */}
      <section className="mx-auto max-w-5xl px-5 pb-12 pt-12 sm:px-8 sm:pt-16">
        <div className="flex flex-wrap items-center gap-5">
          <Image
            src="/family/icon-192.png"
            alt=""
            width={84}
            height={84}
            className="rounded-[20px] shadow-[0_6px_22px_rgba(43,36,32,0.16)]"
            priority
          />
          <div>
            <h1 className="text-[clamp(2rem,1.4rem+2.6vw,3.1rem)] font-bold leading-[1.03] tracking-[-0.02em]">
              Family APP!
            </h1>
            <p className="fa-hand mt-0.5 text-[1.35rem] leading-tight" style={{ color: "var(--fa-teal-deep)" }}>
              the anti-generic family organiser
            </p>
          </div>
        </div>

        <p
          className="mt-7 max-w-[38rem] text-[1.12rem] leading-[1.55]"
          style={{ color: "var(--fa-ink-soft)" }}
        >
          Not a group chat with your surname typed into it. A private hub shaped around
          what a family actually argues about and forgets &mdash; who is cooking, whose
          turn for the school run, what the kids want for their birthday, where everyone
          is going in August.
        </p>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_20rem] lg:items-start">
          <div>
            {/*
              * One screenshot, and it is the holiday planner rather than the
              * chat.
              *
              * The chat is the heart of the app and every chat app on earth
              * looks like a chat app in a photograph. The AI drafting a real
              * holiday, priced, for the family to vote on, is the thing nothing
              * else does — and it is the only shot to hand that contains no
              * real person's face, name or message.
              */}
            <figure className="fa-card overflow-hidden p-2.5">
              <Image
                src="/family/holiday-light.jpg"
                alt="A holiday suggestion in the app: Palm Jumeirah, Dubai, with dates, an estimated price per person, and an Add to board button."
                width={760}
                height={748}
                className="w-full rounded-lg"
              />
              <figcaption
                className="px-2 pb-1 pt-3 text-[0.85rem]"
                style={{ color: "var(--fa-ink-faint)" }}
              >
                Tell it who is coming, when you are free and what you can spend. It comes
                back with somewhere real, priced, for everyone to vote on.
              </figcaption>
            </figure>

            <ul className="mt-6 flex flex-wrap gap-2">
              {[
                "Real-time family chat",
                "Free group video calls",
                "AI holiday planning",
                "On This Day memories",
                "Birthday confetti",
                "26 themes, 12 animated",
                "Quiet hours",
                "Nothing tracked for ads",
              ].map((t) => (
                <li key={t} className="fa-pill list-none">
                  {t}
                </li>
              ))}
            </ul>
          </div>

          <EarlyAccess />
        </div>
      </section>

      {/* ========================================================= modules */}
      <section
        className="border-y px-5 py-14 sm:px-8"
        style={{ borderColor: "var(--fa-line)", background: "var(--fa-card)" }}
      >
        <div className="mx-auto max-w-5xl">
          <span className="fa-eyebrow">Everything in it</span>
          <h2 className="mt-1.5 text-[1.7rem] font-semibold tracking-[-0.015em]">
            Seven things, one app
          </h2>
          <p className="mt-2 max-w-[40rem]" style={{ color: "var(--fa-ink-soft)" }}>
            Built and changed continuously in response to how one family actually uses it,
            rather than against a roadmap.
          </p>

          <Image
            src="/family/modules-light.jpg"
            alt="The app's tab bar: Chat, Breakouts, Dates, Photos, Food and More."
            width={900}
            height={150}
            className="mt-7 w-full rounded-xl border"
            style={{ borderColor: "var(--fa-line)" }}
          />

          <div className="mt-9 grid gap-6 md:grid-cols-2">
            {MODULES.map((m) => (
              <div key={m.name}>
                <h3 className="text-[1.12rem] font-semibold">{m.name}</h3>
                <p className="fa-hand text-[1.05rem]" style={{ color: "var(--fa-teal-deep)" }}>
                  {m.line}
                </p>
                <dl className="mt-3 space-y-2.5">
                  {m.points.map(([what, why]) => (
                    <div key={what} className="text-[0.93rem] leading-[1.5]">
                      <dt className="inline font-semibold">{what}. </dt>
                      <dd className="inline" style={{ color: "var(--fa-ink-soft)" }}>
                        {why}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========================================================== themes */}
      <section className="mx-auto max-w-5xl px-5 py-14 sm:px-8">
        <span className="fa-eyebrow">Make it yours</span>
        <h2 className="mt-1.5 text-[1.7rem] font-semibold tracking-[-0.015em]">
          Twenty-six themes, and twelve of them move
        </h2>
        <p className="mt-2 max-w-[40rem]" style={{ color: "var(--fa-ink-soft)" }}>
          Halloween, Christmas, New Year fireworks, Pancake Day &mdash; each with its own
          animation and chat wallpaper, and each person picks their own. Nobody has a look
          imposed on them by whoever set the family up.
        </p>

        <div className="mt-7 grid gap-4 sm:grid-cols-2">
          {[
            { src: "/family/wordmark-light.jpg", label: "Corkboard" },
            { src: "/family/wordmark-dark.jpg", label: "Midnight" },
          ].map((t) => (
            <figure key={t.src} className="fa-card overflow-hidden p-2.5">
              <Image
                src={t.src}
                alt={`The app header in the ${t.label} theme.`}
                width={640}
                height={191}
                className="w-full rounded-lg"
              />
              <figcaption
                className="px-1.5 pb-0.5 pt-2.5 text-[0.85rem]"
                style={{ color: "var(--fa-ink-faint)" }}
              >
                {t.label} &mdash; two of twenty-six.
              </figcaption>
            </figure>
          ))}
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {[
            ["Your own bubble colour", "Message colour, font, and a photo behind the chat."],
            ["Notifications you control", "Per category, per chat, and quiet hours so nobody wakes the house at 2am."],
            ["A buzz for the good bits", "Haptics on the celebrations. Off in one tap if you would rather not."],
          ].map(([what, why]) => (
            <div key={what} className="fa-card p-4">
              <div className="text-[0.92rem] font-semibold">{what}</div>
              <div className="mt-1 text-[0.88rem] leading-[1.5]" style={{ color: "var(--fa-ink-soft)" }}>
                {why}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ========================================================== whose */}
      <section
        className="border-t px-5 py-12 sm:px-8"
        style={{ borderColor: "var(--fa-line)" }}
      >
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-8 gap-y-4">
          <div className="max-w-[36rem]">
            <span className="fa-eyebrow">Who made it</span>
            <h2 className="mt-1.5 text-[1.25rem] font-semibold">
              Built by Second Pair Ltd
            </h2>
            <p className="mt-2 text-[0.95rem] leading-[1.55]" style={{ color: "var(--fa-ink-soft)" }}>
              Family APP! started as something we wanted at home and kept going because it
              got used every day.
            </p>
            {/*
              * The cross-sell, in the one direction that is a funnel.
              *
              * A plumber who uses this with his family is exactly who the other
              * product is for. A salon owner reading about a receptionist is
              * not obviously in the market for a family organiser, so the same
              * link the other way round would be noise on the page that earns
              * the money.
              */}
            <p className="mt-3 text-[0.95rem] leading-[1.55]" style={{ color: "var(--fa-ink-soft)" }}>
              We also make{" "}
              <Link
                href="/"
                className="font-semibold underline underline-offset-2"
                style={{ color: "var(--fa-teal-deep)" }}
              >
                Second Pair
              </Link>
              , which answers the enquiries for businesses that work by appointment
              &mdash; tattooists, salons, cleaners, trades. If you run one, it is the
              reason half your evenings are not your own.
            </p>
          </div>

          <div className="ml-auto flex flex-col gap-2">
            <Link
              href="/"
              className="rounded-xl px-4 py-2.5 text-center text-[0.92rem] font-semibold"
              style={{ background: "var(--fa-marigold)", color: "#2b2420" }}
            >
              I run a business &rarr;
            </Link>
            <Link
              href="/company"
              className="rounded-xl px-4 py-2.5 text-center text-[0.92rem] font-semibold"
              style={{ background: "var(--fa-bezel)", color: "var(--fa-ink)" }}
            >
              About the company
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
