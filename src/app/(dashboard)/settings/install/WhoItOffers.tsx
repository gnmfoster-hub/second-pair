"use client";

import { useActionState, useState } from "react";
import { saveWhoItOffers, type FormState } from "../actions";

/**
 * Which people the assistant on the website will book.
 *
 * It offered everybody active, and there was no way to say otherwise — so the
 * moment somebody was added to the diary, the assistant started selling their
 * time to strangers. A stylist who only takes her own regulars, an apprentice
 * not ready for the website, somebody who does one day a week and is already
 * full: all of them were being advertised.
 *
 * Nobody chosen means everybody, which is what every business has today. The
 * setting changes nothing until it is used.
 */
export function WhoItOffers({
  people,
  chosen,
  noun,
}: {
  people: { id: string; name: string; active: boolean }[];
  chosen: string[] | null;
  noun: string;
}) {
  const [state, action] = useActionState<FormState, FormData>(saveWhoItOffers, {});
  const [everyone, setEveryone] = useState(!chosen?.length);
  const [picked, setPicked] = useState<string[]>(chosen ?? []);

  const working = people.filter((p) => p.active);

  const toggle = (id: string) =>
    setPicked((was) => (was.includes(id) ? was.filter((x) => x !== id) : [...was, id]));

  return (
    <form action={action} className="card mt-4 space-y-4 p-5">
      <div>
        <h2 className="section-title">Who the website assistant books</h2>
        <p className="hint mt-1">
          Everybody it offers to a customer who has never met you. Somebody left out is
          still in your diary, and their own link still works.
        </p>
      </div>

      <label className="row flex items-center gap-2.5 text-sm">
        <input
          type="checkbox"
          checked={everyone}
          onChange={(e) => setEveryone(e.target.checked)}
          className="accent-[var(--accent)]"
        />
        Anybody who is working
      </label>

      {!everyone && (
        <div className="space-y-1.5 border-t border-border pt-3">
          {working.map((p) => (
            <label key={p.id} className="row flex items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                name="offers"
                value={p.id}
                checked={picked.includes(p.id)}
                onChange={() => toggle(p.id)}
                className="accent-[var(--accent)]"
              />
              {p.name}
            </label>
          ))}
          {working.length === 0 && (
            <p className="hint">There is nobody working to choose from yet.</p>
          )}
          {/*
            * Said rather than prevented.
            *
            * Choosing nobody is treated as "anybody" by the assistant, because
            * a business whose assistant can book no one cannot answer at all —
            * and that would be a silent failure, since the widget still opens.
            */}
          {picked.length === 0 && working.length > 0 && (
            <p className="hint pt-1">
              Nobody chosen, so it will offer anybody working &mdash; an assistant that
              can book no one cannot answer at all.
            </p>
          )}
        </div>
      )}

      {/* Carried so the server can tell "everybody" from "nobody chosen yet". */}
      <input type="hidden" name="everyone" value={everyone ? "1" : "0"} />

      <div className="flex items-center gap-3">
        <button type="submit" className="btn bg-accent text-on-accent">
          Save
        </button>
        {state.ok && <span className="hint">Saved.</span>}
        {state.error && <span className="text-sm text-warn">{state.error}</span>}
      </div>

      <p className="hint">
        Each {noun} can also have a link of their own, set on their own page.
      </p>
    </form>
  );
}
