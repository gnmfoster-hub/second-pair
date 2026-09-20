"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { readFile, bringThemIn, type ReadState, type BringState } from "./actions";
import { FIELDS, type Target } from "@/lib/clients/importList";
import { SubmitButton } from "@/components/Form";

/**
 * Bringing a client list in from whatever they used before.
 *
 * Two steps, and the second one is the whole point: they upload the file their
 * old system gave them, and we show what we think each column is so they can
 * correct it. The alternative — a template to format to — sounds simpler and
 * is where people stop, because rearranging a spreadsheet is a job and
 * uploading one is not.
 */
export function ImportClients({ words }: { words: { customers: string; customer: string } }) {
  const [read, readAction] = useActionState<ReadState, FormData>(readFile, {});
  const [brought, bringAction] = useActionState<BringState, FormData>(bringThemIn, {});

  if (brought.added != null) {
    return (
      <div className="card space-y-3 p-5">
        <h2 className="section-title">
          {brought.added} {brought.added === 1 ? words.customer : words.customers} brought in
        </h2>
        {brought.already ? (
          <p className="hint">
            {brought.already} {brought.already === 1 ? "was" : "were"} already on file, so
            nothing was written twice.
          </p>
        ) : null}
        {brought.skipped ? (
          <>
            <p className="text-warn">{brought.skipped} could not be brought in.</p>
            <ul className="hint list-disc space-y-0.5 pl-5 text-sm">
              {(brought.why ?? []).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </>
        ) : null}
        <div className="flex gap-3 pt-1">
          <Link href="/clients" className="btn bg-accent text-on-accent">
            See them
          </Link>
          <Link href="/clients/import" className="btn-ghost">
            Bring in another file
          </Link>
        </div>
      </div>
    );
  }

  if (!read.headers) return <ChooseFile action={readAction} state={read} words={words} />;

  return <MatchColumns action={bringAction} read={read} state={brought} words={words} />;
}

function ChooseFile({
  action,
  state,
  words,
}: {
  action: (fd: FormData) => void;
  state: ReadState;
  words: { customers: string };
}) {
  return (
    <form action={action} className="card space-y-4 p-5">
      <div>
        <h2 className="section-title">The file from your old system</h2>
        <p className="hint mt-1 max-w-prose">
          Export your {words.customers} from whatever you use now: Fresha, Treatwell, a
          spreadsheet, anything that gives you a <strong>.csv</strong> — and put it here as it
          comes. Do not tidy it up first: the next screen shows what we think each column is,
          and you correct it there. Half-empty columns are fine and normal.
        </p>
      </div>

      <input type="file" name="file" accept=".csv,text/csv,text/plain" className="input" />

      <details>
        <summary className="cursor-pointer text-sm text-accent">
          Or paste the rows in instead
        </summary>
        <textarea
          name="pasted"
          rows={6}
          placeholder="Full Name,Mobile Number,Email&#10;Dave Bone,07700 900111,dave@example.com"
          className="input mt-2 font-mono text-xs"
        />
        <p className="hint mt-1">The first line must be the column headings.</p>
      </details>

      {state.error && <p className="text-sm text-bad">{state.error}</p>}
      <SubmitButton>Read the file</SubmitButton>
    </form>
  );
}

function MatchColumns({
  action,
  read,
  state,
  words,
}: {
  action: (fd: FormData) => void;
  read: ReadState;
  state: BringState;
  words: { customers: string };
}) {
  const [mapping, setMapping] = useState<Target[]>(read.guessed ?? []);
  const headers = read.headers ?? [];
  const used = (target: Target) => mapping.filter((m) => m === target).length;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="csv" value={read.csv ?? ""} />

      <div className="card p-5">
        <h2 className="section-title">What is in each column</h2>
        <p className="hint mt-1 max-w-prose">
          {read.rows} {read.rows === 1 ? "person" : "people"} in that file. We have guessed
          from the headings, change anything we have got wrong. Anything set to{" "}
          <em>Do not import</em> is left behind entirely.
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted">
                <th className="py-2 pr-3">Their heading</th>
                <th className="py-2 pr-3">What it is</th>
                <th className="py-2">First few</th>
              </tr>
            </thead>
            <tbody>
              {headers.map((header, i) => {
                const chosen = mapping[i] ?? "ignore";
                const spec = FIELDS.find((f) => f.target === chosen);
                const twice = chosen !== "ignore" && chosen !== "keep" && used(chosen) > 1;

                return (
                  <tr key={`${header}-${i}`} className="border-t border-border align-top">
                    <td className="py-2 pr-3 font-medium">{header || <em className="hint">no heading</em>}</td>
                    <td className="py-2 pr-3">
                      <select
                        name={`col_${i}`}
                        value={chosen}
                        onChange={(e) => {
                          const next = [...mapping];
                          next[i] = e.target.value as Target;
                          setMapping(next);
                        }}
                        className="input max-w-[15rem]"
                      >
                        <option value="ignore">Do not import</option>
                        {FIELDS.filter((f) => f.target !== "ignore").map((f) => (
                          <option key={f.target} value={f.target}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                      {spec?.hint && chosen !== "ignore" && (
                        <span className="hint mt-1 block max-w-xs text-xs">{spec.hint}</span>
                      )}
                      {twice && (
                        <span className="mt-1 block max-w-xs text-xs text-warn">
                          Two columns are pointing at this. The last one wins.
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-xs text-muted">
                      {(read.sample ?? [])
                        .map((row) => (row[i] ?? "").trim())
                        .filter(Boolean)
                        .slice(0, 3)
                        .join(" · ") || <em>empty</em>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/*
        * Said before they press it, not after.
        *
        * An imported tick is not evidence that this business asked anybody
        * anything, and the one thing an owner must not believe is that
        * importing a list gives them permission to market to it.
        */}
      <div className="card space-y-2 p-5">
        <h2 className="section-title">About the marketing ticks</h2>
        <p className="hint max-w-prose">
          Whatever their old system recorded is brought across and marked{" "}
          <em>imported from their previous system</em>, with no date, because a tick in
          somebody else&rsquo;s export is not evidence of when, or whether, anybody was asked.
          It is enough to keep sending to a list that was already agreed. It is not evidence you
          could show the ICO on its own, so keep the export file somewhere safe.
        </p>
        <p className="hint max-w-prose">
          Anyone whose ticks are blank arrives with marketing <strong>off</strong>. Booking
          messages and reminders are unaffected either way, those are not marketing.
        </p>
      </div>

      {state.error && <p className="text-sm text-bad">{state.error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton>Bring in the {words.customers}</SubmitButton>
        <Link href="/clients/import" className="btn-ghost">
          Start again with a different file
        </Link>
      </div>
    </form>
  );
}
