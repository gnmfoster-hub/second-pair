import Link from "next/link";
import type { Capability } from "@/lib/readiness";

/**
 * What the assistant can and cannot do yet.
 *
 * Replaces a list of chores with a list of consequences. "Add your services"
 * is a task somebody puts off; "it cannot put a number on anything" is a thing
 * happening to their business right now.
 *
 * Disappears entirely once everything is ready. A permanent panel saying
 * "all good" is furniture.
 */
export function Readiness({ capabilities }: { capabilities: Capability[] }) {
  const missing = capabilities.filter((c) => !c.ready);
  if (missing.length === 0) return null;

  const blocking = missing.filter((c) => c.blocking);
  const ready = capabilities.length - missing.length;

  return (
    <div
      className={`card mt-4 overflow-hidden ${blocking.length ? "border-warn/40" : ""}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-5">
        <h2 className="section-title">
          {blocking.length
            ? "Your assistant is not ready yet"
            : "Your assistant could do more"}
        </h2>
        <span className="hint num">
          {ready}/{capabilities.length} working
        </span>
      </div>

      <div className="mx-5 mt-3 h-1 overflow-hidden rounded-full bg-surface-2">
        <div
          className={`h-full rounded-full transition-[width] ${
            blocking.length ? "bg-warn" : "bg-accent"
          }`}
          style={{ width: `${(ready / capabilities.length) * 100}%` }}
        />
      </div>

      <ul className="mt-4 divide-y divide-border border-t border-border">
        {missing.map((capability) => (
          <li
            key={capability.key}
            className="flex flex-wrap items-start gap-x-4 gap-y-2 px-5 py-3.5"
          >
            <span
              className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full text-[10px] ${
                capability.blocking
                  ? "bg-warn/15 text-warn"
                  : "border border-border text-muted"
              }`}
              aria-hidden
            >
              {capability.blocking ? "!" : ""}
            </span>

            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{capability.can}</span>
              <span className="hint mt-0.5 block">{capability.otherwise}</span>
            </span>

            <Link href={capability.href} className="btn-ghost shrink-0 py-1.5 text-xs">
              {capability.action}
            </Link>
          </li>
        ))}
      </ul>

      {/* What already works, so the list is not only a telling-off. */}
      {ready > 0 && (
        <div className="border-t border-border bg-surface-2/40 px-5 py-3">
          <p className="hint">
            Already working:{" "}
            {capabilities
              .filter((c) => c.ready)
              .map((c) => c.can.toLowerCase())
              .join(", ")}
            .
          </p>
        </div>
      )}
    </div>
  );
}
