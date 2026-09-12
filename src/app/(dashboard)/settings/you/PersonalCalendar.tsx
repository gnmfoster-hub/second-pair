"use client";

import { useActionState } from "react";
import { Field, FormMessage, SubmitButton } from "@/components/Form";
import { savePersonalCalendar, type FormState } from "../actions";
import type { Artist } from "@/lib/types";

/**
 * Their own calendar, so their life blocks their work.
 *
 * The assistant reads the business's diary and nothing else, so it will book
 * somebody at the time of their own dentist appointment, their child's
 * assembly, or a funeral — and be perfectly correct in doing so, because
 * nothing ever told it. Keeping two diaries in your head is the tax that
 * mistake charges, and it is paid by the person least able to notice it.
 *
 * One address, pasted once. Every calendar worth using publishes one, which is
 * why this beats connecting to each of them properly: Google, Apple and
 * Outlook all do it, with no sign-in, no app review and nothing we can change
 * at their end.
 */
export function PersonalCalendar({ artist }: { artist: Artist }) {
  const [state, action] = useActionState<FormState, FormData>(savePersonalCalendar, {});
  const linked = Boolean(artist.personal_ical_url);

  return (
    <form action={action} className="card space-y-4 p-6">
      <div>
        <h2 className="section-title">Your own calendar</h2>
        <p className="hint mt-1 max-w-prose">
          Paste the address of the calendar you actually live by and anything in it will
          stop you being booked. We only ever read it &mdash; nothing here can add to,
          change or delete anything in your calendar.
        </p>
      </div>

      <Field
        label="Calendar address"
        hint="Ends in .ics. Leave it empty to disconnect."
      >
        <input
          name="personal_ical_url"
          type="url"
          defaultValue={artist.personal_ical_url ?? ""}
          placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
          className="input"
        />
      </Field>

      {/*
        * Where to find it, because "paste your calendar's address" is only
        * instructions to somebody who already knows it exists. All three hide
        * it somewhere different and none of them calls it the same thing.
        */}
      <details className="rounded-lg bg-surface-2 px-3.5 py-3 text-sm text-muted">
        <summary className="cursor-pointer font-medium text-foreground">
          Where do I find that address?
        </summary>
        <div className="mt-3 space-y-3">
          <p>
            <strong className="text-foreground">Google Calendar.</strong> On a computer,
            Settings &rarr; pick the calendar on the left &rarr; scroll to{" "}
            <strong className="text-foreground">Secret address in iCal format</strong> and
            copy it. Use the secret one, not the public one.
          </p>
          <p>
            <strong className="text-foreground">Apple / iCloud.</strong> On a Mac, right
            click the calendar &rarr; Share Calendar &rarr; tick{" "}
            <strong className="text-foreground">Public Calendar</strong> and copy the
            address. On iPhone it is Calendars &rarr; the <em>i</em> beside it &rarr;
            Public Calendar.
          </p>
          <p>
            <strong className="text-foreground">Outlook.</strong> Settings &rarr; Calendar
            &rarr; <strong className="text-foreground">Shared calendars</strong> &rarr;
            Publish a calendar, choose{" "}
            <strong className="text-foreground">Can view all details</strong>, and copy
            the ICS link.
          </p>
          <p className="text-xs">
            Anybody holding that address can read that calendar, which is why it is worth
            pointing this at the calendar you keep appointments in rather than one holding
            anything private. Clear the box here to disconnect, and change it at their end
            to revoke it everywhere.
          </p>
        </div>
      </details>

      {linked && (
        <>
          <Field label="Show it in the diary">
            <label className="flex items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                name="personal_calendar_show"
                defaultChecked={artist.personal_calendar_show !== false}
                className="mt-0.5"
              />
              <span>
                Put a block in my column so the day reads true.
                <span className="hint block">
                  It is never bookable and never counts towards takings. Off, it still
                  stops you being booked &mdash; it just does not appear.
                </span>
              </span>
            </label>
          </Field>

          <Field label="Show what it says">
            <label className="flex items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                name="personal_calendar_titles"
                defaultChecked={artist.personal_calendar_titles === true}
                className="mt-0.5"
              />
              <span>
                Show the name of each one instead of just &ldquo;Busy&rdquo;.
                <span className="hint block">
                  Everybody who works here can see the diary, and a personal calendar has
                  personal things in it. Off unless you want them read.
                </span>
              </span>
            </label>
          </Field>
        </>
      )}

      {artist.personal_calendar_error && (
        <p className="text-sm text-warn">
          Last read failed: {artist.personal_calendar_error}. Your appointments are still
          safe &mdash; but nothing from this calendar is blocking your time until it works
          again.
        </p>
      )}

      <div className="flex items-center gap-4">
        <SubmitButton />
        <FormMessage state={state} />
        <span className="hint">
          Read every few minutes, so a change there takes a moment to arrive here.
        </span>
      </div>
    </form>
  );
}
