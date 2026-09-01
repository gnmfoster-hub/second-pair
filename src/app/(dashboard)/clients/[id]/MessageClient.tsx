"use client";

import { useActionState, useState } from "react";
import { messageClient, type MessageState } from "./actions";
import { FormMessage, SubmitButton } from "@/components/Form";
import { ChannelIcon } from "@/components/ChannelIcon";
import { channelLabel, type Route } from "@/lib/messaging/reach";

/**
 * Sending this person a message.
 *
 * Most of this component is the case where you cannot. That is deliberate:
 * WhatsApp, Instagram and Messenger all shut twenty-four hours after the
 * customer's last message, and an owner who types out an offer of a cancelled
 * slot and then discovers it cannot go has been wasted twice over. The reason
 * is on screen before the box is.
 */
export function MessageClient({
  contactId,
  name,
  routes,
  allowed,
}: {
  contactId: string;
  name: string;
  routes: Route[];
  /** The owner may have withheld messaging from this member of staff. */
  allowed: boolean;
}) {
  const open = routes.filter((r) => r.open);
  const [channel, setChannel] = useState(open[0]?.channel ?? null);
  const [state, action] = useActionState<MessageState, FormData>(messageClient, {});

  if (!allowed) {
    return (
      <section className="card p-5">
        <h2 className="mb-1 text-sm font-medium">Send a message</h2>
        <p className="hint">
          You do not have permission to message customers. The owner can change that
          in Settings.
        </p>
      </section>
    );
  }

  return (
    <section className="card p-5">
      <h2 className="mb-3 text-sm font-medium">Send a message</h2>

      {open.length === 0 ? (
        <div className="space-y-2">
          <p className="text-xs leading-relaxed text-muted">
            There is no way to message {name.split(" ")[0]} at the moment.
          </p>
          {/*
           * Every closed door, with the reason on it. One line each, because
           * the useful information is which one is closest to being opened.
           */}
          <ul className="space-y-1.5">
            {routes.map((r) => (
              <li
                key={r.channel}
                className="flex gap-2 rounded-lg bg-surface-2/50 px-3 py-2 text-xs leading-relaxed text-muted"
              >
                <ChannelIcon channel={r.channel} className="mt-0.5 size-3.5 shrink-0" />
                <span>{r.blocked}</span>
              </li>
            ))}
          </ul>
          {routes.length === 0 && (
            <p className="hint">
              They have never written in and there is no number on file. Adding a
              mobile number above would let you text them.
            </p>
          )}
        </div>
      ) : (
        <form action={action} className="space-y-3">
          <input type="hidden" name="contact_id" value={contactId} />
          <input type="hidden" name="channel" value={channel ?? ""} />

          {/* Only worth asking when there is a choice to make. */}
          {open.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {open.map((r) => (
                <button
                  key={r.channel}
                  type="button"
                  onClick={() => setChannel(r.channel)}
                  aria-pressed={channel === r.channel}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                    channel === r.channel
                      ? "border-accent bg-accent text-on-accent"
                      : "border-border text-muted hover:text-foreground"
                  }`}
                >
                  <ChannelIcon channel={r.channel} className="size-3.5" />
                  {channelLabel(r.channel)}
                </button>
              ))}
            </div>
          )}

          <textarea
            name="message"
            rows={3}
            className="input"
            placeholder={
              open.length === 1
                ? `Message ${name.split(" ")[0]} on ${channelLabel(open[0].channel).toLowerCase()}…`
                : `Message ${name.split(" ")[0]}…`
            }
            required
          />

          <div className="flex flex-wrap items-center gap-4">
            <SubmitButton className="btn-highlight" pending="Sending…">
              Send
            </SubmitButton>
            <FormMessage state={state} />
            <p className="hint ml-auto">
              {/* An offer is only worth making if the yes gets booked. */}
              Replies come back to your inbox, and the assistant will pick them up.
            </p>
          </div>

          {state.warning && (
            <p className="rounded-lg bg-warn/10 px-3 py-2 text-xs leading-relaxed text-warn">
              {state.warning}
            </p>
          )}

          {/* Closed doors stay listed, quietly, so the picker is not a mystery. */}
          {routes.some((r) => !r.open) && (
            <ul className="space-y-1 border-t border-border pt-3">
              {routes
                .filter((r) => !r.open)
                .map((r) => (
                  <li key={r.channel} className="hint flex gap-2">
                    <ChannelIcon channel={r.channel} className="mt-0.5 size-3 shrink-0" />
                    <span>{r.blocked}</span>
                  </li>
                ))}
            </ul>
          )}
        </form>
      )}
    </section>
  );
}
