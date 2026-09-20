"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { sendForm, type FormActionState } from "../../formActions";

/**
 * One form to a list of people.
 *
 * Two ways to build the list, because there are two reasons to do this:
 * everybody booked in on a particular day ("send Saturday's clients the
 * consent form"), or picking names ("send my regulars the new terms"). Each
 * goes by the way that person can be reached, and anybody who cannot be is
 * named afterwards.
 */
export function SendToSeveral({
  templates,
  people,
  days,
  customers,
}: {
  templates: { id: string; name: string }[];
  people: { id: string; name: string; reachable: boolean }[];
  days: { day: string; label: string; ids: string[] }[];
  customers: string;
}) {
  const [state, action, pending] = useActionState<FormActionState, FormData>(sendForm, {});
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = term ? people.filter((p) => p.name.toLowerCase().includes(term)) : people;
    return list.slice(0, 60);
  }, [people, search]);

  const toggle = (id: string) =>
    setChosen((all) => {
      const next = new Set(all);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (!templates.length) {
    return (
      <section className="card p-5">
        <h2 className="section-title">Send a form to several</h2>
        <p className="hint mt-2 text-sm">
          No forms yet.{" "}
          <Link href="/settings/forms" className="text-accent hover:underline">
            Add one
          </Link>{" "}
          first. There are ready-made ones for your trade.
        </p>
      </section>
    );
  }

  return (
    <form action={action} className="card space-y-4 p-5">
      <h2 className="section-title">Send a form to several</h2>
      {[...chosen].map((id) => (
        <input key={id} type="hidden" name="contact_id" value={id} />
      ))}

      <label className="block">
        <span className="label">Which form</span>
        <select id="several-template" name="template_id" className="input" defaultValue={templates[0].id}>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>

      {days.length > 0 && (
        <div>
          <span className="label">Everyone booked on</span>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {days.map((d) => (
              <button
                key={d.day}
                type="button"
                onClick={() => setChosen((all) => new Set([...all, ...d.ids]))}
                className="rounded-full border border-border px-3 py-1 text-xs hover:border-accent"
              >
                {d.label} · {d.ids.length}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="label">Or pick {customers}</span>
          {chosen.size > 0 && (
            <button type="button" onClick={() => setChosen(new Set())} className="text-xs text-muted hover:text-foreground">
              Clear {chosen.size}
            </button>
          )}
        </div>
        <input
          id="several-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name"
          className="input mt-1"
        />
        <ul className="mt-2 max-h-72 divide-y divide-border overflow-y-auto rounded-lg border border-border">
          {shown.map((p) => (
            <li key={p.id}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                <input type="checkbox" checked={chosen.has(p.id)} onChange={() => toggle(p.id)} className="accent-[var(--accent)]" />
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                {!p.reachable && <span className="hint text-xs">no number or email</span>}
              </label>
            </li>
          ))}
          {shown.length === 0 && <li className="hint px-3 py-2 text-sm">Nobody by that name.</li>}
        </ul>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          name="send_on"
          value="auto"
          disabled={pending || chosen.size === 0}
          className="btn bg-accent text-on-accent disabled:opacity-60"
        >
          {pending ? "Sending…" : `Send to ${chosen.size || "…"}`}
        </button>
        <span className="hint text-xs">Each goes the way they would rather be reached: a text or an email.</span>
      </div>

      {state.error && <p className="text-sm text-warn">{state.error}</p>}
      {state.ok && (
        <div className="rounded-xl bg-ok/5 p-3 text-sm">
          <p className="text-ok">
            Sent to {state.sent} {state.sent === 1 ? "person" : "people"}.
          </p>
          {state.note && <p className="hint text-xs">{state.note}</p>}
          {state.unreached && state.unreached.length > 0 && (
            <p className="mt-1 text-warn">
              Could not reach: {state.unreached.join(", ")}. Send theirs from their record, or give them the link.
            </p>
          )}
        </div>
      )}
    </form>
  );
}
