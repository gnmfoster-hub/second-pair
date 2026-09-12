"use client";

import { useActionState } from "react";
import { inviteStaff } from "../actions";

/**
 * A login for somebody who does not take bookings.
 *
 * Every way into this business ran through the diary: to give anybody a login
 * you first had to add them as somebody who cuts hair, with hours and a rate
 * and a column of their own. A receptionist would have appeared in the diary
 * as a chair nobody sits in, and the assistant would cheerfully have offered
 * her to a customer.
 *
 * They get the inbox, the clients and everybody's day — which is the whole of
 * what a receptionist actually needs — and nothing that implies they do the
 * work.
 */
export function InviteStaff({ origin }: { origin: string }) {
  const [state, action] = useActionState<
    { token?: string; error?: string; emailedTo?: string },
    FormData
  >(inviteStaff, {});

  return (
    <form action={action} className="card space-y-3 p-5">
      <div>
        <div className="section-title">Somebody who is not in the diary</div>
        <p className="hint mt-1.5 max-w-prose">
          A receptionist, a manager, whoever answers the phone. They get the inbox, the
          clients and everybody&rsquo;s day. They get no column, no hours and no rates,
          and the assistant will never offer them to a {""}
          customer as somebody who does the work.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-1">
          <span className="label">Their email, if you have it</span>
          <input
            name="email"
            type="email"
            placeholder="Optional — you can just send them the link"
            className="input"
          />
        </label>
        <button className="btn-ghost">Make them a link</button>
      </div>

      {state.error && <p className="text-sm text-warn">{state.error}</p>}

      {state.token && (
        <div className="rounded-lg bg-surface-2 px-3.5 py-3">
          <p className="text-sm">
            Send them this. They set their own password, and the link stops working once
            it is used.
          </p>
          {/*
            * Shown rather than only emailed, because plenty of the people this
            * is for are stood next to you: a link you can read out or paste
            * into a text beats a message that may be in a spam folder.
            */}
          <code className="mt-2 block break-all rounded bg-surface px-2.5 py-2 text-xs">
            {origin}/join/{state.token}
          </code>
          {state.emailedTo && (
            <p className="hint mt-2">Also sent to {state.emailedTo}.</p>
          )}
        </div>
      )}
    </form>
  );
}
