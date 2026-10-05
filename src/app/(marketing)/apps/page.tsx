import type { Metadata } from "next";
import Link from "next/link";
import { Ask, Close, Hero, Screens } from "../SellingPage";
import { Passing } from "../home/scroll";
import "../home/showpiece.css";
import "../websites/websites.css";
import "../work/work.css";
import "./apps.css";

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
 *
 * The four real screens now come straight after the opening, on the dark
 * ground, because they are the proof and the page used to make somebody read
 * six paragraphs before showing them.
 */
export default function Page() {
  return (
    <>
      <div className="sp-night sp-web-hero">
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
      </div>

      {/* The phones rise at different speeds as the page goes past them. */}
      <Passing className="sp-night sp-phones">
        <Screens
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
      </Passing>

      <section className="sp-steps" data-plain="">
        <div className="shell sp-steps-in">
          <h2 className="page-title sp-big-title">How we work</h2>
          <p className="sp-steps-intro">
            Small finished things beat big unfinished ones. Everything below comes from
            building our own.
          </p>
          <ul className="sp-steps-list">
            <li>
              <h3 className="section-title">It has to be used, not demonstrated</h3>
              <p>
                Everything here is in daily use by somebody who is not us before we call it
                finished. That is the only test that has ever told us the truth.
              </p>
            </li>
            <li>
              <h3 className="section-title">It works on a phone first</h3>
              <p>
                Add it to the home screen and it behaves like an app. No app store, no
                review queue, no waiting a week to fix a typo.
              </p>
            </li>
            <li>
              <h3 className="section-title">It is yours</h3>
              <p>
                Your data, exportable, on infrastructure you could take over. Nothing held
                back to keep you paying.
              </p>
            </li>
            <li>
              <h3 className="section-title">Built where you can see it</h3>
              <p>
                You watch it being built rather than seeing it at the end. The things that
                turn out to be wrong are far cheaper to find in the first week.
              </p>
            </li>
            <li>
              <h3 className="section-title">Small enough to answer the phone</h3>
              <p>
                The person who built it is the person who picks up. There is no tier above
                you to escalate to, because there is nobody else.
              </p>
            </li>
            <li>
              <h3 className="section-title">We will say no</h3>
              <p>
                If an app is not what you need, or a spreadsheet would do it, we will tell
                you. It costs us a job and saves you a year.
              </p>
            </li>
          </ul>
        </div>
      </section>

      <Ask line="Got something that needs building?" />

      <section className="shell sp-own">
        <h2 className="page-title sp-big-title">What we have built</h2>
        <ul>
          <li>
            <div className="sp-own-pic">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/shots/diary-month.webp" alt="A month in the Second Pair diary." loading="lazy" />
            </div>
            <h3 className="section-title">Second Pair</h3>
            <p>
              The assistant and the diary this site is about. Answering real enquiries for
              real businesses every day, including at three in the morning.
            </p>
          </li>
          <li>
            <div className="sp-own-pic">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/shots/fa-holiday.webp" alt="The holiday planner in Family APP!" loading="lazy" />
            </div>
            <h3 className="section-title">Family APP!</h3>
            <p>
              A private hub for one family: chat, photos, a shared calendar, meal plans and
              an AI holiday planner. Built because we wanted it at home, and in early access
              now.
            </p>
            <Link href="/family-app" className="sp-own-link">
              Have a look at Family APP!
            </Link>
          </li>
          <li>
            <div className="sp-own-pic" data-fit="hand">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/hands/hand-type-480.webp" alt="" loading="lazy" />
            </div>
            <h3 className="section-title">Yours</h3>
            <p>
              If you have a job that software would genuinely fix, we would like to hear
              about it. If it would not, we will say so.
            </p>
          </li>
        </ul>
        <p className="sp-own-note">
          Family APP! has a page of its own, in its own colours, because it is for families
          rather than for businesses.
        </p>
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
