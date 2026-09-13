import Link from "next/link";

/**
 * What this person does not set, because the business does.
 *
 * Shown in place of the settings themselves, rather than instead of nothing.
 * An employee opening this page and finding it nearly empty would reasonably
 * assume the product was broken or that they had the wrong account — so it
 * says what is managed elsewhere, who manages it, and that the two things
 * which genuinely cannot be delegated are still theirs.
 *
 * Not phrased as a restriction. It is how the great majority of people in a
 * salon or a garage actually work: they do the job, and the shop decides what
 * it charges and how it speaks.
 */
export function Managed({ words }: { words: { business: string } }) {
  return (
    <section className="card p-5">
      <div className="section-title">The {words.business} looks after the rest</div>

      <p className="hint mt-1.5 max-w-prose">
        Your prices, your hours, the reminders your clients get and the way the assistant
        speaks for you are all set by whoever runs the {words.business}. If something is
        wrong, they can change it in a minute &mdash; you do not need an account for that
        and asking is faster than finding it.
      </p>

      <div className="mt-4 rounded-lg bg-surface-2 px-3.5 py-3">
        <div className="label">Still yours</div>
        <ul className="mt-1.5 list-disc space-y-1 pl-4 text-sm text-muted">
          <li>
            <strong className="text-foreground">This phone.</strong> Notifications have to
            be switched on from the device that is going to buzz, so nobody can do it for
            you.
          </li>
          <li>
            <strong className="text-foreground">Your own calendar.</strong> The address of
            the calendar you live by is not anybody else&rsquo;s to hold, and anything in
            it stops you being booked over.
          </li>
        </ul>
      </div>

      <p className="hint mt-4">
        Everything you are booked for is on{" "}
        <Link href="/diary" className="text-accent hover:underline">
          your diary
        </Link>
        , as it always was.
      </p>
    </section>
  );
}
