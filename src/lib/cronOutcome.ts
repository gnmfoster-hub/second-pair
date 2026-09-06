/**
 * Whether the scheduled sweep should report itself as having gone wrong.
 *
 * The sweep sends reminders, releases unpaid holds, forgets what businesses
 * have asked to have forgotten, and answers enquiries the owner did not get
 * to. It returned 200 whatever happened, and the workflow that calls it fails
 * only on a status — so a reminder that could not be delivered came back as
 * `{"failures":["Living Canvas: 2 failed"]}` with a green tick beside it.
 *
 * That reminder is gone. A delivery failure is written to the row as `failed`
 * and never tried again, so nothing downstream will pick it up and nobody is
 * told. The first anybody knows is a chair sitting empty on Thursday.
 *
 * Because failures are terminal, saying so is loud exactly once per lost
 * reminder rather than every five minutes forever — which is the distinction
 * the workflow's own comment draws between being loud when something is broken
 * and being loud about something nobody has got to yet.
 */

export type SweepResult = {
  /** Businesses whose reminders could not be sent, or whose sweep threw. */
  failures: string[];
  /** Businesses whose forgetting could not be carried out. */
  forgetting: string[];
  /**
   * Enquiries the owner was given first refusal on, whose fallback reply then
   * failed to send.
   *
   * A customer wrote in, nobody answered, the assistant stepped in to answer
   * for them — and that failed too. They are sitting there having heard
   * nothing at all, which is the exact outcome the whole first-refusal
   * arrangement exists to prevent.
   */
  unanswered: number;
  /**
   * Reminders with nowhere to go — no channel connected, or a messaging window
   * that has shut with no number on file.
   *
   * Deliberately not a failure. Nothing has been lost: the reminder is left
   * pending and shown to the owner, who is the only one who can fix it by
   * connecting a channel. Colouring this red would mean a business that has
   * not finished setting up turns the job red every five minutes, and a job
   * that is always red is a job nobody looks at.
   */
  waiting: number;
};

export function sweepWentWrong(result: SweepResult): boolean {
  return (
    result.failures.length > 0 || result.forgetting.length > 0 || result.unanswered > 0
  );
}
