import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Our work",
  description: "What we have built.",
};

/**
 * One of the four sections the nav names, DESIGN.md §8.
 *
 * Thin on purpose. The brief says do not invent content, and the copy for this
 * page has not been written, so it carries the one line §8 gives it, keeps the
 * placeholders, and asks for the chat that is the only call to action on the
 * site. Writing the real page is on Giles's list.
 */
export default function Page() {
  return (
    <div className="mx-auto max-w-5xl px-5 py-20 sm:px-8">
      <h1 className="page-title text-4xl sm:text-5xl">Our work</h1>

      <p className="mt-6 max-w-[60ch] text-lg leading-relaxed">What we have built.</p>

      <p className="mt-4 max-w-[60ch] text-lg leading-relaxed">Living Canvas Tattoo is live and answering. [NEXT CLIENT] is in build. Before and after on each once the old screenshots are in.</p>

      <p className="mt-4 max-w-[60ch] text-lg leading-relaxed">Book a chat and we will walk you through one.</p>

      <div className="mt-10">
        <a href="/home#ask" className="btn-primary">
          Book a 15 minute chat
        </a>
      </div>
    </div>
  );
}
