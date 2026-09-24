import {
  assess,
  assessPeople,
  summarise,
  summarisePeople,
  type Facts,
  type Link,
  type PersonFacts,
  type Step,
} from "@/lib/working";

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
export function Working({
  facts,
  people,
  open = false,
  audience = "us",
}: {
  facts: Facts;
  people: PersonFacts[];
  open?: boolean;
  /**
   * Whose screen this is.
   *
   * The same facts, read by two people who can do different things about them.
   * In the back office "you" is Giles and "they" is the business; in the
   * business's own settings "you" is the owner and the things we control are
   * not theirs to change — so those rows say to ask us rather than offering a
   * link to a screen they cannot open.
   */
  audience?: "us" | "owner";
}) {
  const things = assess(facts);
  const team = assessPeople(people);
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
                  <dt className="font-medium">{WHO[audience][w.who]}</dt>
                  <dd>
                    {w.what}
                    {/*
                      * The address, but never one they cannot open. An owner
                      * being shown /admin is being told where a door is and
                      * that it is locked.
                      */}
                    {!(audience === "owner" && w.who === "us") && (
                      <span className="opacity-60"> · {w.href}</span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>

      {/*
        * And each person, which the list above cannot see.
        *
        * Giles: "i will need to see what team members havent set up as well,
        * this only covers the business." He is right, and this is the half
        * where things actually go wrong: a business is set up once by somebody
        * who cares, a team of six is set up six times over months, and nobody
        * ever looks at all six together. That is how a correctly configured
        * salon ends up with one stylist whose clients are reminded of nothing.
        */}
      <div className="mt-5 border-t border-border pt-4">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-medium">{audience === "owner" ? "Your people" : "Their people"}</span>
          <span className="hint">{summarisePeople(team)}</span>
        </div>

        <ul className="mt-2 space-y-2">
          {team.map((p) => (
            <li key={p.name} className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-sm font-medium">{p.name}</span>
                {p.notes.length === 0 && <span className="hint text-ok">Nothing outstanding</span>}
              </div>
              {p.notes.length > 0 && (
                <ul className="mt-1.5 space-y-1">
                  {p.notes.map((n) => (
                    <li
                      key={n.says}
                      className={`text-xs ${n.kind === "fault" ? "text-warn" : "text-muted"}`}
                    >
                      {n.says}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

/**
 * Whose screen a thing is set on, said from the reader's side.
 *
 * The same row means two different things depending on who is reading it. To
 * us, "us" is a job on our own screen; to an owner it is something they have
 * to ask for. Naming that honestly is the difference between a map and a
 * list of places they cannot go.
 */
const WHO: Record<"us" | "owner", Record<"us" | "owner" | "person", string>> = {
  us: { us: "You", owner: "They", person: "Per person" },
  owner: { us: "Ask us", owner: "You", person: "Per person" },
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
