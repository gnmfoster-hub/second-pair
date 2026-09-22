import type { Metadata } from "next";
import Link from "next/link";
import { Ask, Close, Hero, Item, Screens, Section } from "../SellingPage";

export const metadata: Metadata = {
  title: "Apps",
  description:
    "Software built for one job, by a small company that uses what it builds. Family APP! is the first one out.",
};

/**
 * The selling page for app work.
 *
 * Family APP! is the case study because it is the one thing here that exists,
 * is finished enough to show, and was built by us. It keeps its own brand on
 * its own page, so this only points at it.
 *
 * The old stub called it Family CHAT!, which is not its name.
 */
export default function Page() {
  return (
    <>
      <Hero
        eyebrow="Apps"
        title={<>Software for one job, done properly.</>}
        lede={
          <>
            Not an agency with a stack of frameworks looking for something to build. A
            small company that makes things it uses itself, and will build one for you if
            the job is right.
          </>
        }
      />

      <Section
        title="How we work"
        intro="Small finished things beat big unfinished ones. Everything below comes from building our own."
      >
        <Item head="It has to be used, not demonstrated">
          Everything here is in daily use by somebody who is not us before we call it
          finished. That is the only test that has ever told us the truth.
        </Item>
        <Item head="It works on a phone first">
          Add it to the home screen and it behaves like an app. No app store, no review
          queue, no waiting a week to fix a typo.
        </Item>
        <Item head="It is yours">
          Your data, exportable, on infrastructure you could take over. Nothing held back
          to keep you paying.
        </Item>
        <Item head="Built where you can see it">
          You watch it being built rather than seeing it at the end. The things that turn
          out to be wrong are far cheaper to find in the first week.
        </Item>
        <Item head="Small enough to answer the phone">
          The person who built it is the person who picks up. There is no tier above you to
          escalate to, because there is nobody else.
        </Item>
        <Item head="We will say no">
          If an app is not what you need, or a spreadsheet would do it, we will tell you.
          It costs us a job and saves you a year.
        </Item>
      </Section>

      <Screens
        tinted
        shots={[
          {
            src: "/shots/fa-chat.webp",
            alt: "Family APP! main chat, with the daily recap and a holiday countdown.",
            label: "The family chat",
          },
          {
            src: "/shots/fa-food.webp",
            alt: "Family APP! food screen, with planned meals and what the family is eating.",
            label: "Food",
          },
          {
            src: "/shots/fa-holiday.webp",
            alt: "Family APP! holiday planner, with destinations pinned to the board.",
            label: "Holiday planner",
          },
          {
            src: "/shots/fa-more.webp",
            alt: "Family APP! menu, showing Family Pulse, Location, Free Stuff and Favours.",
            label: "Everything else",
          },
        ]}
        caption={
          <>
            Real screens, on a real phone. Everything feeds the family chat on the left:
            dates, photos, meals and the holiday planner all post into it, and anything
            that does not concern everybody moves off into a breakout.
            <br />
            <span className="mt-2 inline-block">
              The app is in daily use by one family, so their name, their photographs and
              their children are blurred or cropped out of every one of these. Two of the
              four are from a test family for the same reason. Nothing else is altered.
            </span>
          </>
        }
      />

      <Ask line="Got something that needs building?" />

      <Section title="What we have built" tinted>
        <Item head="Second Pair">
          The assistant and the diary this site is about. Answering real enquiries for real
          businesses every day, including at three in the morning.
        </Item>
        <Item head="Family APP!">
          A private hub for one family: chat, photos, a shared calendar, meal plans and an
          AI holiday planner. Built because we wanted it at home, and in early access now.
        </Item>
        <Item head="Yours">
          If you have a job that software would genuinely fix, we would like to hear about
          it. If it would not, we will say so.
        </Item>
      </Section>

      <section className="shell pb-4">
        <div className="rounded-2xl border border-border bg-surface p-6 sm:p-8">
          <p className="max-w-[58ch] text-sm leading-relaxed text-muted">
            Family APP! has a page of its own, in its own colours, because it is for
            families rather than for businesses.
          </p>
          <Link
            href="/family-app"
            className="mt-4 inline-flex text-sm font-medium underline decoration-border underline-offset-4 transition-colors hover:decoration-current"
          >
            Have a look at Family APP!
          </Link>
        </div>
      </section>

      <Close
        line="Tell us what you are trying to fix."
        note={
          <>
            Fifteen minutes on the phone. Priced per job and agreed before anything starts,
            and we will tell you honestly if software is not the answer.
          </>
        }
      />
    </>
  );
}
