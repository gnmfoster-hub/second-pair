"use client";

import { useActionState, useState } from "react";
import { saveCampaign } from "./actions";
import { Field, FormMessage, SubmitButton } from "@/components/Form";
import { HowItLands } from "@/components/HowItLands";
import { renderReminder, unknownPlaceholders } from "@/lib/reminderText";
import type { FormState } from "../actions";

export type CampaignRow = {
  id: string;
  name: string;
  body: string;
  channel: "email" | "sms";
  after_service: string | null;
  after_days: number;
  enabled: boolean;
};

/**
 * One campaign: a message that follows a job.
 *
 * Built like the reminder editor on purpose, because it is the same job with
 * different stakes — somebody writing a sentence that will go to people they
 * have not spoken to in six weeks, and wanting to see it before it does.
 *
 * The number beside it is the point. "Everybody who had a colour" and
 * "everybody who had a colour and agreed to hear from you" are very different
 * figures, and only the second may be sent — so the second is the one shown.
 */
export function CampaignEditor({
  campaign,
  business,
  jobs,
  channels,
  photoUrl,
  reach,
}: {
  campaign?: CampaignRow;
  business: string;
  /** The jobs this business does, so the audience is chosen rather than typed. */
  jobs: string[];
  /** Channels we have switched on for them. */
  channels: ("email" | "sms")[];
  photoUrl?: string | null;
  /** How many people this would reach today, per channel. */
  reach?: Record<string, number>;
}) {
  const [state, action] = useActionState<FormState, FormData>(saveCampaign, {});

  const [body, setBody] = useState(campaign?.body ?? "");
  const [channel, setChannel] = useState<"email" | "sms">(
    campaign?.channel ?? channels[0] ?? "email",
  );
  const [service, setService] = useState(campaign?.after_service ?? "");

  const wrong = unknownPlaceholders(body);

  const shown = renderReminder(body, {
    name: "Marie",
    business,
    what: service || "appointment",
    when: "",
    practitioner: "",
    link: "",
  } as never);

  return (
    <form action={action} className="card space-y-4 p-5">
      {campaign && <input type="hidden" name="id" value={campaign.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name it" hint="For your own list. Customers never see this.">
          <input
            name="name"
            defaultValue={campaign?.name ?? ""}
            placeholder="Colour, six weeks on"
            className="input"
          />
        </Field>

        <Field label="How it goes">
          <select
            name="channel"
            value={channel}
            onChange={(e) => setChannel(e.target.value as "email" | "sms")}
            className="input"
          >
            {channels.includes("email") && <option value="email">By email</option>}
            {channels.includes("sms") && <option value="sms">By text</option>}
          </select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/*
          * Chosen rather than typed, because it is matched against the words
          * on past bookings and a near miss silently reaches nobody.
          */}
        <Field label="After which job" hint="Leave as any if it does not matter.">
          <select
            name="after_service"
            value={service}
            onChange={(e) => setService(e.target.value)}
            className="input"
          >
            <option value="">Any appointment</option>
            {jobs.map((j) => (
              <option key={j} value={j}>
                {j}
              </option>
            ))}
          </select>
        </Field>

        <Field label="How long after" hint="Days.">
          <input
            type="number"
            name="after_days"
            min={1}
            max={730}
            defaultValue={campaign?.after_days ?? 42}
            className="input w-32"
          />
        </Field>
      </div>

      <Field
        label="What it says"
        explain="{{name}} is their first name, {{business}} is your name, {{what}} is the job."
      >
        <textarea
          name="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          className="input"
          placeholder="Hi {{name}}, it has been a while since your {{what}} — fancy booking another?"
        />
      </Field>

      {wrong.length > 0 && (
        <p className="rounded-lg bg-warn/10 px-3 py-2 text-sm text-warn">
          <strong>{wrong.length === 1 ? "This is not one of them:" : "These are not:"}</strong>{" "}
          {wrong.map((w) => `{{${w}}}`).join(", ")} — it will be taken out and leave a gap.
        </p>
      )}

      <HowItLands
        text={shown}
        business={business}
        photoUrl={photoUrl}
        channels={[channel]}
      />

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="enabled"
          defaultChecked={campaign?.enabled ?? false}
          className="accent-[var(--accent)]"
        />
        Send this one
      </label>

      {/*
        * The honest number, beside the switch that starts it.
        *
        * Nobody should be able to switch a campaign on without seeing how many
        * people it can lawfully reach — and when that is nought, which it is
        * for every business today, saying so here is the difference between a
        * feature that looks broken and one that is waiting.
        */}
      <p className="hint">
        {reach?.[channel] ? (
          <>
            {reach[channel]} {reach[channel] === 1 ? "person has" : "people have"} agreed to hear
            from you {channel === "email" ? "by email" : "by text"} and had this job.
          </>
        ) : (
          <>
            Nobody has agreed to hear from you {channel === "email" ? "by email" : "by text"} yet,
            so this would reach no one. People can say yes on their own booking page.
          </>
        )}
      </p>

      <div className="flex items-center gap-4">
        <SubmitButton className="btn-ghost">{campaign ? "Save" : "Add campaign"}</SubmitButton>
        <FormMessage state={state} />
        <div className="flex-1" />
        {campaign && (
          <button type="submit" name="intent" value="delete" formNoValidate className="btn-danger">
            Remove
          </button>
        )}
      </div>
    </form>
  );
}
