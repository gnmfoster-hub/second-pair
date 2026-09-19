"use client";

import { useActionState } from "react";
import { allocateChannel, type FormState } from "../actions";
import { CHANNEL_LABELS, type Channel } from "@/lib/types";
import { readableNumber } from "@/lib/channels/phoneNumbers";

/**
 * Every channel this business has, and whether this person has one of their own.
 *
 * Giles, three times: he cannot see the option to give a team member channels.
 * He was right, and the reason is that it was only ever shown the other way
 * round — the Channels page lists the business's connections and lets each one
 * be given to somebody. So the question "what has Aisha got" could only be
 * answered by reading every connection on the business and remembering which
 * name was against it.
 *
 * This is the same decision from the other end: open a person, see every
 * channel the business is signed up for, and give them one. Nothing new is
 * possible that was not possible before; it is simply askable in the direction
 * somebody actually asks it.
 *
 * Channels the business has not bought are not listed at all. There is no
 * sense in offering a stylist an Instagram the salon does not have.
 */
export function TheirChannels({
  artistId,
  firstName,
  business,
  /** What the business is signed up for. */
  sold,
  /** Every live connection on the business, whoever it belongs to. */
  links,
}: {
  artistId: string;
  firstName: string;
  business: string;
  sold: Channel[];
  links: { id: string; channel: Channel; label: string | null; external_id: string | null; artist_id: string | null }[];
}) {
  const [state, action, saving] = useActionState<FormState, FormData>(allocateChannel, {});

  /*
   * The website is the shop window and belongs to nobody.
   *
   * One address, whoever the owner has decided it speaks for, and there is no
   * version of it that is one person's — so offering to hand it over would be
   * offering something that cannot be done.
   */
  const theirs = sold.filter((c) => c !== "web");
  if (theirs.length === 0) return null;

  return (
    <div className="card mt-4 p-5">
      <h3 className="section-title">Channels of their own</h3>
      <p className="hint mt-1 max-w-prose">
        On one of {business}&rsquo;s channels the assistant asks the customer who they
        would like. On one of {firstName}&rsquo;s it never asks, because everything
        arriving there is theirs.
      </p>

      <ul className="mt-3 divide-y divide-border border-y border-border">
        {theirs.map((channel) => {
          const onThis = links.filter((l) => l.channel === channel);
          const mine = onThis.find((l) => l.artist_id === artistId);
          const spare = onThis.filter((l) => !l.artist_id);

          return (
            <li key={channel} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{CHANNEL_LABELS[channel]}</span>
                <span className="hint block">
                  {mine ? (
                    <>
                      Theirs ·{" "}
                      {channel === "sms" || channel === "voice"
                        ? readableNumber(mine.external_id ?? "")
                        : (mine.label ?? "connected")}
                    </>
                  ) : onThis.length === 0 ? (
                    /*
                     * Nothing connected at all, and the two ways that gets
                     * fixed are genuinely different jobs — one costs money and
                     * takes days, the other needs a password only they have.
                     */
                    channel === "sms" || channel === "voice" ? (
                      "Nothing connected. A number has to be bought and registered before anybody can have one."
                    ) : (
                      `Nothing connected. ${firstName} can connect their own from their settings — only they can log in to it.`
                    )
                  ) : spare.length > 0 ? (
                    `${business}'s — shared, so the assistant asks who they want`
                  ) : (
                    "Connected, and it belongs to somebody else"
                  )}
                </span>
              </span>

              {/*
               * Only where there is actually something to hand over, and never
               * the last one on a channel: a business whose only number belongs
               * to one stylist has no way for a new customer to reach it at all.
               */}
              {!mine && spare.length > 0 && onThis.length > 1 && (
                <form action={action} className="shrink-0">
                  <input type="hidden" name="connection" value={spare[0].id} />
                  <input type="hidden" name="artist" value={artistId} />
                  <button className="btn-ghost py-1.5 text-xs" disabled={saving}>
                    {saving ? "Saving…" : `Give it to ${firstName}`}
                  </button>
                </form>
              )}

              {!mine && spare.length > 0 && onThis.length === 1 && (
                <span className="hint shrink-0 text-right text-[12px]">
                  The only one on this channel, so it stays with {business}
                </span>
              )}

              {mine && (
                <form action={action} className="shrink-0">
                  <input type="hidden" name="connection" value={mine.id} />
                  <input type="hidden" name="artist" value="" />
                  <button className="btn-ghost py-1.5 text-xs" disabled={saving}>
                    Give it back to {business}
                  </button>
                </form>
              )}
            </li>
          );
        })}
      </ul>

      {state.error && (
        <p className="mt-2 text-xs text-warn" role="alert">
          {state.error}
        </p>
      )}
      {state.ok && <p className="mt-2 text-xs text-ok">Saved.</p>}
    </div>
  );
}
