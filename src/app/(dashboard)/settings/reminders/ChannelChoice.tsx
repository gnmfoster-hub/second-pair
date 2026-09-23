"use client";

import { useActionState } from "react";
import { saveChannelChoice } from "./actions";
import { FormMessage, SubmitButton } from "@/components/Form";
import type { Preference } from "@/lib/messageChannels";
import type { FormState } from "../actions";

/**
 * Which channel a message to a customer goes out on.
 *
 * Giles asked for email first with text as a fallback, both where we hold the
 * details, and the option to turn either off — and said in the same breath
 * that text reminders must not quietly stop, because customers expect them.
 *
 * Both are true, so it is a choice rather than a rule, and the trade-off is
 * written on the screen rather than left to be discovered from a bill: a text
 * is what people expect and costs money every time; an email costs nothing and
 * carries the whole message, a link and a layout.
 *
 * It applies to confirmations, reminders and review requests — everything the
 * business sends about an appointment. A campaign names its own channel,
 * because that is a decision with a price attached and is made per campaign.
 */
const OPTIONS: { value: Preference; label: string; why: string }[] = [
  {
    value: "as_they_came",
    label: "However they got in touch",
    why: "Whichever channel they used to reach you. What happens now.",
  },
  {
    value: "both",
    label: "Email and text",
    why: "Both, where you have both. The most certain to be seen and the most expensive.",
  },
  {
    value: "email_first",
    label: "Email, text if there is no address",
    why: "The cheap one. Email carries the whole message and a link; a text is only sent when there is nowhere to email.",
  },
  { value: "email_only", label: "Email only", why: "Never text. Nobody without an address hears anything." },
  { value: "sms_only", label: "Text only", why: "Never email." },
];

export function ChannelChoice({
  value,
  hasNumber,
}: {
  value: Preference;
  /** Whether they have a number at all, so the screen does not offer fiction. */
  hasNumber: boolean;
}) {
  const [state, action] = useActionState<FormState, FormData>(saveChannelChoice, {});

  return (
    <form action={action} className="card space-y-3 p-5">
      <div className="section-title">How these go out</div>
      <p className="hint max-w-prose">
        Confirmations, reminders and review requests. Campaigns choose their own.
      </p>

      <div className="grid gap-2">
        {OPTIONS.map((o) => (
          <label key={o.value} className="flex items-start gap-2.5 text-sm">
            <input
              type="radio"
              name="message_channels"
              value={o.value}
              defaultChecked={value === o.value}
              className="mt-1 accent-[var(--accent)]"
            />
            <span>
              {o.label}
              <span className="hint block">{o.why}</span>
            </span>
          </label>
        ))}
      </div>

      {!hasNumber && (
        <p className="hint">
          You have no number yet, so nothing can be texted whichever of these is chosen.
        </p>
      )}

      <div className="flex items-center gap-4">
        <SubmitButton className="btn-ghost">Save</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
