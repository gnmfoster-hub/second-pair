"use client";

import { useActionState } from "react";
import { allocateChannel, allowOwnChannel, type FormState } from "../actions";
import { CHANNEL_LABELS, type Channel } from "@/lib/types";
import { mayHaveTheirOwn, whatAllowingMeans } from "@/lib/channels/whose";
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
  ownEmail,
  allowed,
}: {
  artistId: string;
  firstName: string;
  business: string;
  sold: Channel[];
  links: { id: string; channel: Channel; label: string | null; external_id: string | null; artist_id: string | null }[];
  /** Their own inbound address, where they have a handle to build one from. */
  ownEmail?: string | null;
  /** Channels this person is allowed one of their own on. See lib/channels/whose. */
  allowed?: string[] | null;
}) {
  const [state, action, saving] = useActionState<FormState, FormData>(allocateChannel, {});
  const [allowState, allow] = useActionState<FormState, FormData>(allowOwnChannel, {});

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
        On one of the {business}&rsquo;s channels the assistant asks the customer who
        they would like. On one of {firstName}&rsquo;s it never asks, because everything
        arriving there is theirs.
      </p>

      <ul className="mt-3 divide-y divide-border border-y border-border">
        {theirs.map((channel) => {
          const onThis = links.filter((l) => l.channel === channel);
          const mine = onThis.find((l) => l.artist_id === artistId);
          const spare = onThis.filter((l) => !l.artist_id);

          const may = mayHaveTheirOwn(allowed, channel);

          return (
            <li key={channel} className="py-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
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
                    nothingYet(channel, firstName, may)
                  ) : spare.length > 0 ? (
                    `The ${business}'s own, so the assistant asks who they want`
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
                  The only one on this channel, so it stays with the {business}
                </span>
              )}

              {mine && (
                <form action={action} className="shrink-0">
                  <input type="hidden" name="connection" value={mine.id} />
                  <input type="hidden" name="artist" value="" />
                  <button className="btn-ghost py-1.5 text-xs" disabled={saving}>
                    Give it back to the {business}
                  </button>
                </form>
              )}
              </div>

              {/*
                * The switch that comes before any of the above.
                *
                * Allocation needs an account to exist first, and on a channel
                * with nothing connected — which is most of them, most of the
                * time — there was nothing to press and nothing to say. So the
                * list read "nothing, nothing, nothing" and looked like a
                * feature that had not been built.
                *
                * This is the decision an owner actually makes, and it can be
                * made on an empty channel: may this person have their own here
                * at all. What it changes is spelled out rather than implied,
                * because the thing people fear is that it cuts somebody off
                * from the business's own number, and it does not.
                */}
              <form action={allow} className="mt-2 flex flex-wrap items-start gap-x-3 gap-y-1">
                <input type="hidden" name="artist" value={artistId} />
                <input type="hidden" name="channel" value={channel} />
                <input type="hidden" name="allow" value={may ? "0" : "1"} />
                {/*
                  * A switch, which is what it is.
                  *
                  * It was a bordered stamp and read as a box — Giles said so,
                  * and a box says "a state you are being told about" where a
                  * switch says "a thing you can change". The stamp is right on
                  * a conversation, which is a mark somebody pressed; it is
                  * wrong on a control.
                  *
                  * Still a button in a form rather than a checkbox, so it
                  * works before any JavaScript does and says what it is to a
                  * screen reader.
                  */}
                <button
                  role="switch"
                  aria-checked={may}
                  aria-label={`Let ${firstName} have their own ${CHANNEL_LABELS[channel]}`}
                  className={`group/sw inline-flex shrink-0 items-center gap-2 rounded-full py-1 pl-1 pr-2.5 text-[11px] font-medium transition-colors ${
                    may ? "bg-ok/12 text-ok" : "bg-surface-2 text-muted hover:text-foreground"
                  }`}
                >
                  <span
                    className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${
                      may ? "bg-ok" : "bg-muted/35 group-hover/sw:bg-muted/50"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 size-3 rounded-full bg-surface transition-all ${
                        may ? "left-3.5" : "left-0.5"
                      }`}
                    />
                  </span>
                  {may ? "Allowed" : "Not allowed"}
                </button>
                <span className="hint min-w-0 flex-1 text-[12px]">
                  {may
                    ? whatAllowingMeans(channel, firstName)
                    : `Not allowed. The ${business}'s channels still reach ${firstName} — a customer writing in is asked who they would like.`}
                </span>
              </form>
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
      {allowState.error && (
        <p className="mt-2 text-xs text-warn" role="alert">
          {allowState.error}
        </p>
      )}

      {/*
        * Email, which needed nothing bought and nothing connected.
        *
        * It was the one channel a team member could not have their own of, and
        * the reason turned out to be that nobody had split the address. The
        * part before the plus is the business; the part after is the person.
        * Same mailbox, same forward, same MX — and every address in use today
        * carries on working untouched.
        */}
      {sold.includes("email") && ownEmail && mayHaveTheirOwn(allowed, "email") && (
        <div className="mt-4 border-t border-border pt-4">
          <span className="label">{firstName}&rsquo;s own email address</span>
          <p className="hint mt-1.5">
            Anything arriving here is theirs, and the assistant books it into their diary
            without asking the customer who they want. Give it out, or forward an address
            of theirs to it.
          </p>
          <p className="num mt-2 break-all text-sm">{ownEmail}</p>
        </div>
      )}
    </div>
  );
}

/**
 * What to do about a channel nobody has connected, which differs by channel.
 *
 * The first version said the same sentence for all of them — that the person
 * could connect their own from their settings — which is true of Instagram and
 * Facebook and false of everything else. Email arrives at one address belonging
 * to the business, and a number has to be bought. Telling a salon owner that
 * Sarah can connect her own email would have had her waiting for something
 * nobody can do.
 */
function nothingYet(channel: Channel, firstName: string, may: boolean): string {
  /*
   * The line and the switch underneath it have to agree.
   *
   * They did not: email said "they have their own address already" directly
   * above a switch reading Not allowed, and Instagram said they could connect
   * one from their settings when the button is not shown to them. Two
   * sentences about the same thing, contradicting each other, an inch apart.
   */
  if (!may) return "Not switched on for them.";

  if (channel === "sms" || channel === "voice") {
    return "Allowed, but nothing connected yet. A number has to be bought and registered first.";
  }
  if (channel === "instagram" || channel === "messenger") {
    return `Allowed. ${firstName} connects it from their own settings, because only they can log in to it.`;
  }
  if (channel === "email") {
    return "They have an address of their own, see below.";
  }
  return "Allowed, nothing connected yet.";
}
