import type { Metadata } from "next";
import Link from "next/link";
import { Hero } from "../SellingPage";
import "../home/showpiece.css";
import "../websites/websites.css";
import "../work/work.css";
import "../apps/apps.css";

/**
 * Who is behind this.
 *
 * The gap it fills is not vanity. A business handing over its enquiries is
 * trusting a stranger with the first thing every new customer sees, and the
 * question they ask before signing up is whether this company will still be
 * here in a year. There was nowhere on the site that answered it — home,
 * privacy, terms, and nothing else.
 *
 * Deliberately not on the homepage. A second product in the funnel splits
 * attention at the moment somebody is deciding, and two apps side by side read
 * as a hobby rather than a company. Here they read as a company that ships,
 * which is the thing worth saying and the reason somebody came looking.
 *
 * Everything on it is true and checkable. No team page, no founding story, no
 * customer logos, no numbers — none of that is mine to invent, and a made-up
 * "trusted by hundreds" is worse than an empty space on exactly the page
 * somebody is reading to decide whether to trust you.
 *
 * The words are unchanged. It is laid out like the rest of the site now: the
 * two products shown rather than described in boxes, and the address set as a
 * plain ruled list, which is what somebody checking a company is looking for.
 */

export const metadata: Metadata = {
  title: "Second Pair Ltd, the company behind Second Pair and Family APP!",
  description:
    "A small British software company. We build Second Pair, an assistant that answers for appointment businesses, and Family APP!, a private hub for families.",
};

export default function CompanyPage() {
  return (
    <>
      <div className="sp-night sp-web-hero">
        <Hero
          eyebrow="The company"
          title={<>Second Pair Ltd</>}
          lede={
            <>
              A small software company in Devon. We build two things: an assistant that
              answers the phone and the messages for businesses that work by appointment,
              and a private hub for a family. Both are used every day by people who are not
              us.
            </>
          }
        />
      </div>

      {/* ======================================================= products */}
      <section className="shell sp-own">
        <h2 className="page-title sp-big-title">What we make</h2>
        <ul data-two="">
          {/*
            * Second Pair first, because this is its site and its customers
            * are who this page is written for.
            */}
          <li>
            <div className="sp-own-pic">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/shots/inbox.webp" alt="The Second Pair inbox, in the demo salon." loading="lazy" />
            </div>
            <span className="sp-own-state">Live</span>
            <h3 className="section-title">Second Pair</h3>
            <p>
              An assistant that answers enquiries for tattooists, salons, cleaners, trades,
              anybody who works by appointment. It replies in the business&rsquo;s own
              voice, quotes from their own rates, offers times that are genuinely free, and
              books them in. At eleven at night, while they are up a ladder, and on a
              Sunday.
            </p>
            <Link href="/" className="sp-own-link">
              See what it does &rarr;
            </Link>
          </li>

          <li>
            <div className="sp-own-pic">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/shots/fa-holiday.webp" alt="The holiday planner in Family APP!" loading="lazy" />
            </div>
            <span className="sp-own-state" data-early="">
              Early access
            </span>
            <h3 className="section-title">Family APP!</h3>
            <p>
              A private hub for one family, chat, photos, a shared calendar, meal plans, an
              AI holiday planner and twenty-six themes. Built because we wanted it at home,
              and kept going because it got used every day.
            </p>
            <Link href="/family-app" className="sp-own-link">
              Have a look &rarr;
            </Link>
          </li>
        </ul>
      </section>

      {/* ========================================================== how */}
      <section className="sp-steps" data-plain="">
        <div className="shell sp-steps-in">
          <h2 className="page-title sp-big-title">How we build</h2>
          <ul className="sp-steps-list">
            <li>
              <h3 className="section-title">In front of real businesses</h3>
              <p>
                Both products are in daily use while they are being built. Nothing ships
                because it was on a roadmap; it ships because somebody needed it that week.
              </p>
            </li>
            <li>
              <h3 className="section-title">Nothing invented</h3>
              <p>
                The assistant never makes up a price or a free slot. If it does not know, it
                says so and fetches a person. A confident wrong answer costs a business more
                than no answer.
              </p>
            </li>
            <li>
              <h3 className="section-title">Said plainly</h3>
              <p>
                A message that did not send says so. A setting that cannot work yet says
                why. We would rather tell somebody something awkward than let them find out
                from a customer.
              </p>
            </li>
          </ul>
        </div>
      </section>

      {/* ====================================================== the facts */}
      <section className="shell sp-facts">
        <h2 className="page-title sp-big-title">The details</h2>
        <dl>
          {[
            ["Company", "Second Pair Ltd, trading as second-pair.com"],
            ["Where", "13 Bugle Place, Newton Abbot, TQ12 1GZ, United Kingdom"],
            ["Built in", "Devon, England"],
          ].map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
          <div>
            <dt>Email</dt>
            <dd>
              {/* Shown as text as well as linked, so it can be copied. */}
              <a href="mailto:info@second-pair.com">info@second-pair.com</a>
            </dd>
          </div>
          <div>
            <dt>Data</dt>
            <dd>
              Everything is stored in the UK. <Link href="/privacy">How we handle it</Link>, and
              the <Link href="/terms">terms</Link>.
            </dd>
          </div>
        </dl>
      </section>

      {/* The close, in the same place and colour as every other page. */}
      <section style={{ background: "var(--accent)", color: "var(--on-accent)" }}>
        <div className="shell py-16 sm:py-20">
          <h2
            style={{
              fontFamily: "var(--font-display), Impact, sans-serif",
              textTransform: "uppercase",
              lineHeight: 0.96,
              letterSpacing: "0.01em",
              fontSize: "clamp(34px, 4.4vw, 56px)",
              maxWidth: "16ch",
            }}
          >
            Run a business by appointment?
          </h2>
          <p className="mt-5 max-w-lg text-base leading-relaxed" style={{ opacity: 0.9 }}>
            That is the one we built for you. It answers while you work, and every business
            on it is set up by hand, so the first conversation is with a person, not a
            signup form.
          </p>
          <a
            href="/home?say=I%20would%20like%20to%20book%20a%2015%20minute%20chat#ask"
            className="btn-ink mt-9 inline-flex"
            style={{ minHeight: 54 }}
          >
            Get set up
          </a>
        </div>
      </section>
    </>
  );
}
