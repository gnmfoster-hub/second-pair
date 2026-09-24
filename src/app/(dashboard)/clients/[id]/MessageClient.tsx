"use client";

import { useActionState, useState } from "react";
import { messageClient, type MessageState } from "./actions";
import { FormMessage, SubmitButton } from "@/components/Form";
import { ChannelIcon } from "@/components/ChannelIcon";
import { boxStartsOn, channelLabel, type Route } from "@/lib/messaging/reach";

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
  templates = [],
  prefers = null,
}: {
  contactId: string;
  name: string;
  routes: Route[];
  /** The owner may have withheld messaging from this member of staff. */
  allowed: boolean;
  /**
   * Their saved wordings, already filled in for this person.
   *
   * Empty until they write some, and empty before the migration runs — both
   * leave the box exactly as it was, which is the right thing for each.
   */
  templates?: { id: string; label: string; body: string }[];
  /** Which way they asked to be reached, where they have said. */
  prefers?: string | null;
}) {
  const open = routes.filter((r) => r.open);
  /*
   * Email first where there is a choice. See boxStartsOn.
   *
   * Giles: "when sending a message if multiple methods available it should
   * default to email but give the option of all methods depending on
   * preferences." It started on whatever routesFor put first, which is the
   * order for messages the product sends on its own — where a text being read
   * within the minute is the whole job. A person typing by hand is usually not
   * in that hurry, and a text costs every time where an email costs nothing.
   *
   * Every open channel is still a button, and somebody who asked to be texted
   * still starts on texts: saving four pence is not a reason to break a
   * promise the business made.
   */
  const [channel, setChannel] = useState(boxStartsOn(routes, prefers) ?? open[0]?.channel ?? null);
  /*
   * The box is controlled once there is anything to put in it, so picking a
   * wording can fill it. Started from empty rather than from the first
   * template: a message that types itself the moment the page loads is one
   * somebody sends without reading.
   */
  const [text, setText] = useState("");
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

          {/*
            * Their own wordings, on the way into the box rather than out of it.
            *
            * Giles: "would be good to be able to send emails/messages to the
            * clients in the client page record a copy and have templates etc."
            * The copy was already kept — every message sent from here is
            * written into their conversation with the delivery beside it — so
            * this is the wording half.
            *
            * Filling the box rather than sending: every one of these gets
            * edited before it goes, which is the difference between a quick
            * message and a reminder. A picker that sent would be a way to
            * send the wrong thing in one click.
            */}
          {templates.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setText(t.body)}
                  className="rounded-full border border-border px-2.5 py-1 text-xs text-muted transition-colors hover:border-accent hover:text-foreground"
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}

          <textarea
            name="message"
            rows={3}
            className="input"
            value={text}
            onChange={(e) => setText(e.target.value)}
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
