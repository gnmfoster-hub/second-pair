import { assess, summarise, type Facts, type Link, type Step } from "@/lib/working";

/**
 * One business, every capability, the whole chain.
 *
 * Giles: "its very hard to check everything is working from a user
 * perspective" and "i need to work out a way of making it easier to understand
 * whats going on with everything and where everything is located."
 *
 * Two questions, and this answers both on one row. Sold, switched on,
 * connected, proven — the first broken link named, what a customer gets
 * instead while it is broken, and, always, which screen it is set on and whose
 * screen that is.
 *
 * Proven means something has actually happened, not that a field is filled in.
 * A number can be bought, typed in, saved, and answer nothing because a
 * webhook was never pasted into Twilio — which is a failure this business has
 * hit, and which every setup checklist in the world would call ready.
 */
export function Working({ facts, open = false }: { facts: Facts; open?: boolean }) {
  const things = assess(facts);
  const broken = things.filter((t) => t.stuckAt && t.stuckAt !== "proven");

  return (
    <details open={open} className="rounded-xl border border-border p-3">
      <summary className="cursor-pointer text-sm text-muted">
        Is it working?
        <span className={`ml-2 text-xs ${broken.length ? "text-warn" : ""}`}>
          — {summarise(things)}
        </span>
      </summary>

      <ul className="mt-4 space-y-3">
        {things.map((t) => (
          <li key={t.key} className="rounded-lg border border-border p-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-sm font-medium">{t.name}</span>
              <span className="hint">{t.what}</span>
            </div>

            {/* The chain, in order, so a break is read as a position. */}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {t.steps.map((s) => (
                <Bead key={s.link} step={s} stuck={t.stuckAt === s.link} />
              ))}
            </div>

            {/*
              * What it means, which is the part worth reading. "Not
              * connected" is a fact; "anybody who rings is told it takes
              * texts only" is a reason to do something today.
              */}
            {t.because && (
              <p className={`mt-2 text-xs ${t.stuckAt === "proven" ? "text-muted" : "text-warn"}`}>
                {t.because}
              </p>
            )}

            {/*
              * And where it lives, always — not only when something is wrong.
              * This is the half nothing answered: a capability set in three
              * places by three different people, with no map anywhere.
              */}
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px] text-muted">
              {t.where.map((w) => (
                <div key={w.href + w.what} className="contents">
                  <dt className="font-medium">{WHO[w.who]}</dt>
                  <dd>
                    {w.what} <span className="opacity-60">· {w.href}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Whose screen it is set on. The word an owner would use, not a role name. */
const WHO: Record<"us" | "owner" | "person", string> = {
  us: "You",
  owner: "They",
  person: "Per person",
};

const LABEL: Record<Link, string> = {
  sold: "Sold",
  on: "Switched on",
  connected: "Connected",
  proven: "Proven",
};

/**
 * One link of the chain.
 *
 * Three states and three looks, and "not applicable" deliberately looks like
 * neither of the others: a thing with nothing to switch on has not passed a
 * test, it simply was not asked one, and dressing that as a tick is how a page
 * like this starts lying in small ways.
 */
function Bead({ step, stuck }: { step: Step; stuck: boolean }) {
  const look =
    step.state === "yes"
      ? "border-ok/30 bg-ok/10 text-ok"
      : step.state === "na"
        ? "border-border text-muted opacity-70"
        : stuck
          ? "border-warn/40 bg-warn/10 text-warn"
          : "border-border text-muted";

  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] ${look}`}>
      {step.state === "yes" ? "✓ " : step.state === "no" ? "· " : "– "}
      {LABEL[step.link]}
      {step.detail && <span className="opacity-70"> · {step.detail}</span>}
    </span>
  );
}
