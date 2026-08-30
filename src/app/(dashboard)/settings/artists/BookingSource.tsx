"use client";

import { useState } from "react";
import { Field } from "@/components/Form";
import { PROVIDER_LABELS, PROVIDERS, type ProviderKind } from "@/lib/booking/provider";
import type { Artist } from "@/lib/types";

const ORDER: ProviderKind[] = ["native", "ical_link", "google", "link_only", "manual"];

const BLURB: Record<ProviderKind, string> = {
  native:
    "Handled keeps the diary. Nothing to connect, and the assistant books straight into it.",
  ical_link:
    "Already on Fresha, Booksy, Treatwell or Square? Handled reads what's free from their calendar feed and sends people to your own booking page, so your system stays in charge.",
  google: "Availability read from a Google Calendar, and bookings written back to it.",
  link_only: "No diary access. The assistant qualifies and quotes, then hands over your link.",
  manual: "No diary at all. The assistant takes preferred days and you confirm.",
};

export function BookingSource({ artist }: { artist?: Artist }) {
  const [kind, setKind] = useState<ProviderKind>(
    (artist?.booking_provider as ProviderKind) ?? "native",
  );
  const caps = PROVIDERS[kind];

  return (
    <div className="space-y-4 rounded-lg border border-border bg-surface-2/40 p-4">
      <Field label="Where the diary lives">
        <select
          name="booking_provider"
          value={kind}
          onChange={(e) => setKind(e.target.value as ProviderKind)}
          className="input max-w-md"
        >
          {ORDER.map((k) => (
            <option key={k} value={k}>
              {PROVIDER_LABELS[k]}
            </option>
          ))}
        </select>
        <p className="hint mt-2">{BLURB[kind]}</p>
      </Field>

      {kind === "google" && (
        <Field
          label="Google Calendar ID"
          hint="Not connected yet — the sign-in flow is still to come."
        >
          <input
            name="calendar_id"
            defaultValue={artist?.calendar_id ?? ""}
            placeholder="name@example.com"
            className="input max-w-md font-mono text-xs"
          />
        </Field>
      )}

      {kind === "ical_link" && (
        <Field
          label="Calendar feed URL"
          hint="In Fresha: Profile → Workspaces → Manage → Calendar sync → Export your Fresha Calendar. It shares times only, never client names."
        >
          <input
            name="ical_url"
            defaultValue={artist?.ical_url ?? ""}
            placeholder="https://…/calendar.ics"
            className="input max-w-md font-mono text-xs"
          />
        </Field>
      )}

      {caps.handsOverLink && (
        <Field
          label="Booking page link"
          hint="Where the customer finishes the booking — the link you already share."
        >
          <input
            name="booking_url"
            defaultValue={artist?.booking_url ?? ""}
            placeholder="https://www.fresha.com/book/…"
            className="input max-w-md font-mono text-xs"
          />
        </Field>
      )}

      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
        <span>{caps.readsAvailability ? "✓ sees what's free" : "✕ cannot see the diary"}</span>
        <span>{caps.writesBookings ? "✓ books it for you" : "✕ cannot write bookings"}</span>
        {caps.handsOverLink && <span>✓ hands over your booking link</span>}
      </div>
    </div>
  );
}
