import Link from "next/link";
import { askingLine, waitedFor, type Waiting } from "@/lib/whoIsAsking";

/**
 * Who is asking for time, beside the diary that has the time in it.
 *
 * Giles: "the layout of the internal system, diary etc is very similar to lots
 * of systems out there... where can we do things better."
 *
 * The grid looks like everybody else's because it is doing everybody else's
 * job: showing what is settled. What this product has and they do not is that
 * somebody is working in the diary while nobody is looking at it — and the
 * whole of that was invisible. The screen showed the result of the assistant's
 * work and nothing of the work.
 *
 * So: the people currently asking for time, with what they said about when, in
 * their own words, next to the week they are asking about. Nobody else can
 * build this, not because it is difficult but because they are not having the
 * conversation.
 *
 * Folded away by default and gone entirely when nobody is waiting. The diary
 * is somebody's working screen, not a dashboard, and a panel that is always
 * there is a panel that is never read.
 */
export function WhoIsAsking({ waiting }: { waiting: Waiting[] }) {
  const line = askingLine(waiting);
  if (!line) return null;

  const needing = waiting.filter((w) => w.needsSomebody).length;

  return (
    <details className="card overflow-hidden">
      <summary className="flex cursor-pointer flex-wrap items-center gap-x-2 px-4 py-2.5 text-sm">
        <span className="font-medium">Asking about time</span>
        <span className={`hint ${needing ? "text-highlight-strong" : ""}`}>{line}</span>
        <span className="hint ml-auto">Open</span>
      </summary>

      <ul className="divide-y divide-border border-t border-border">
        {waiting.map((w) => (
          <li key={w.conversationId}>
            <Link
              href={`/conversations/${w.conversationId}`}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-2.5 hover:bg-surface-2/60"
            >
              <span className="text-sm font-medium">{w.who}</span>

              {/*
                * Their own words about when, which is the whole point.
                * "Saturdays, or after 5 in the week" cannot be drawn on a grid
                * and should not be flattened into one — the shape of what
                * somebody will accept is what decides whether to ring them.
                */}
              {w.when && <span className="text-sm text-accent">{w.when}</span>}

              {w.what && <span className="hint min-w-0 flex-1 truncate">{w.what}</span>}

              {w.needsSomebody && (
                <span className="pill bg-highlight/12 text-[11px] text-highlight-strong">
                  waiting on you
                </span>
              )}

              <span className="hint ml-auto shrink-0">{waitedFor(w.hoursWaiting)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}
