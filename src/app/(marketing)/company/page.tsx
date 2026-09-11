import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Logo } from "@/components/Logo";

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
 */

export const metadata: Metadata = {
  title: "Second Pair Ltd — the company behind Second Pair and Family APP!",
  description:
    "A small British software company. We build Second Pair, an assistant that answers for appointment businesses, and Family APP!, a private hub for families.",
};

export default function CompanyPage() {
  return (
    <div className="mx-auto max-w-4xl px-5 py-12 sm:px-8 sm:py-16">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
        The company
      </p>

      <h1 className="page-title mt-2 text-[clamp(1.9rem,1.4rem+2.2vw,2.9rem)] leading-[1.05]">
        Second Pair Ltd
      </h1>

      <p className="mt-5 max-w-[38rem] text-lg leading-[1.5] text-muted">
        A small software company in Devon. We build two things: an assistant that answers
        the phone and the messages for businesses that work by appointment, and a private
        hub for a family. Both are used every day by people who are not us.
      </p>

      {/* ======================================================= products */}
      <section className="mt-12">
        <h2 className="section-title">What we make</h2>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {/*
            * Second Pair first and given more room, because this is its site
            * and its customers are who this page is written for.
            */}
          <div className="card flex flex-col p-6">
            <Logo height={30} lockup="horizontal" />

            <p className="mt-4 flex-1 text-sm leading-[1.6] text-muted">
              An assistant that answers enquiries for tattooists, salons, cleaners,
              trades &mdash; anybody who works by appointment. It replies in the
              business&rsquo;s own voice, quotes from their own rates, offers times that
              are genuinely free, and books them in. At eleven at night, while they are
              up a ladder, and on a Sunday.
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <span className="pill bg-ok/10 text-ok">Live</span>
              <Link href="/" className="text-sm font-medium hover:underline">
                See what it does &rarr;
              </Link>
            </div>
          </div>

          <div className="card flex flex-col p-6">
            <div className="flex items-center gap-3">
              <Image
                src="/family/icon-96.png"
                alt=""
                width={30}
                height={30}
                className="rounded-[8px]"
              />
              <span className="text-[1.05rem] font-semibold">Family APP!</span>
            </div>

            <p className="mt-4 flex-1 text-sm leading-[1.6] text-muted">
              A private hub for one family &mdash; chat, photos, a shared calendar, meal
              plans, an AI holiday planner and twenty-six themes. Built because we wanted
              it at home, and kept going because it got used every day.
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <span className="pill bg-highlight/15 text-highlight-ink">Early access</span>
              <Link href="/family-app" className="text-sm font-medium hover:underline">
                Have a look &rarr;
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================== how */}
      <section className="mt-12">
        <h2 className="section-title">How we build</h2>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {[
            {
              what: "In front of real businesses",
              why: "Both products are in daily use while they are being built. Nothing ships because it was on a roadmap; it ships because somebody needed it that week.",
            },
            {
              what: "Nothing invented",
              why: "The assistant never makes up a price or a free slot. If it does not know, it says so and fetches a person. A confident wrong answer costs a business more than no answer.",
            },
            {
              what: "Said plainly",
              why: "A message that did not send says so. A setting that cannot work yet says why. We would rather tell somebody something awkward than let them find out from a customer.",
            },
          ].map((item) => (
            <div key={item.what} className="card p-5">
              <div className="text-sm font-semibold">{item.what}</div>
              <p className="hint mt-1.5 leading-[1.55]">{item.why}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ====================================================== the facts */}
      <section className="mt-12">
        <h2 className="section-title">The details</h2>

        <div className="scroller mt-4 overflow-hidden rounded-xl border border-border">
          <dl className="divide-y divide-border text-sm">
            {[
              ["Company", "Second Pair Ltd, trading as second-pair.com"],
              ["Where", "13 Bugle Place, Newton Abbot, TQ12 1GZ, United Kingdom"],
              ["Built in", "Devon, England"],
            ].map(([k, v]) => (
              <div key={k} className="flex flex-wrap gap-x-6 gap-y-1 px-4 py-3">
                <dt className="w-28 shrink-0 font-medium text-muted">{k}</dt>
                <dd className="min-w-0 flex-1">{v}</dd>
              </div>
            ))}
            <div className="flex flex-wrap gap-x-6 gap-y-1 px-4 py-3">
              <dt className="w-28 shrink-0 font-medium text-muted">Email</dt>
              <dd className="min-w-0 flex-1">
                <a href="mailto:info@second-pair.com" className="hover:underline">
                  info@second-pair.com
                </a>
              </dd>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 px-4 py-3">
              <dt className="w-28 shrink-0 font-medium text-muted">Data</dt>
              <dd className="min-w-0 flex-1">
                Everything is stored in the UK.{" "}
                <Link href="/privacy" className="hover:underline">
                  How we handle it
                </Link>
                , and the{" "}
                <Link href="/terms" className="hover:underline">
                  terms
                </Link>
                .
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <div className="mt-12 rounded-2xl border border-border bg-surface-2/40 p-6 sm:p-8">
        <h2 className="section-title">Run a business by appointment?</h2>
        <p className="hint mt-2 max-w-prose">
          That is the one we built for you. It answers while you work, and every business
          on it is set up by hand &mdash; so the first conversation is with a person, not
          a signup form.
        </p>
        <a
          href="/home#ask"
          className="btn mt-5 inline-flex bg-highlight font-semibold text-on-highlight hover:brightness-95"
        >
          Get set up
        </a>
      </div>
    </div>
  );
}
