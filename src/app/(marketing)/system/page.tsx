import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "The Second Pair system",
  description: "The assistant answers your customers and sorts your bookings while you work.",
};

/**
 * One of the four sections the nav names, DESIGN.md §8.
 *
 * Deliberately thin. The brief says re-theme what exists and do not invent
 * content, and the body copy for this page has not been written — so it says
 * the one true thing, carries the placeholder price §8 specifies, and sends
 * people to the demo that already exists on the home page rather than to an
 * empty screen.
 *
 * A page that says "coming soon" would be worse than the 404 it replaces. This
 * says what the thing is, in the voice from §1, and asks for the chat that is
 * the only call to action on the site.
 */
export default function SystemPage() {
  return (
    <div className="mx-auto max-w-5xl px-5 py-20 sm:px-8">
      <h1 className="page-title text-4xl sm:text-5xl">The Second Pair system</h1>

      <p className="mt-6 max-w-[60ch] text-lg leading-relaxed">
        The assistant answers your customers on WhatsApp, Instagram, Facebook and your
        own website. It quotes from your prices, books people in, takes deposits and
        sends the reminders. You carry on working.
      </p>

      <p className="mt-4 max-w-[60ch] text-lg leading-relaxed">
        From [YOUR PRICE] a month, no contract.
      </p>

      <div className="mt-10 flex flex-wrap items-center gap-4">
        <a href="/home#ask" className="btn-primary">
          Book a 15 minute chat
        </a>
        <Link href="/home" className="btn-text">
          Watch it answer
        </Link>
      </div>
    </div>
  );
}
