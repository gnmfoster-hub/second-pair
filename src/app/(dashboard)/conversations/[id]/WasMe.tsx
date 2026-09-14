import { markAsTest } from "./actions";

/**
 * "That was me, not a customer."
 *
 * A plain form with a server action and no state of its own: there is one
 * thing to say and the page re-renders having said it, so a client component
 * would be three hooks around a single fact.
 *
 * Sits above the delete, because it is the gentler of the two and the one
 * somebody actually wants nine times out of ten. Deleting a test conversation
 * throws away what the assistant said, which is the thing you were testing.
 */
export function WasMe({ id, test }: { id: string; test: boolean }) {
  return (
    <form action={markAsTest} className="mt-6 flex flex-wrap items-center gap-3">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="test" value={test ? "false" : "true"} />

      {test ? (
        <>
          <span className="pill bg-surface-2 text-muted">Marked as a test</span>
          <button type="submit" className="btn-ghost py-1.5 text-xs">
            No, this was a real customer
          </button>
        </>
      ) : (
        <button type="submit" className="btn-ghost py-1.5 text-xs">
          This was me testing
        </button>
      )}

      <span className="hint">
        {test
          ? "Left out of your client list, your figures and the weekly report. The thread stays here to read."
          : "Keeps the thread, takes it out of your client list, your figures and the weekly report."}
      </span>
    </form>
  );
}
