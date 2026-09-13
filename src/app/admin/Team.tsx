"use client";

import { useActionState } from "react";
import { fixPerson, type Result } from "./actions";
import type { BusinessSummary } from "@/lib/platform";

/**
 * One person's settings, reachable from support.
 *
 * The console could reach a business's own settings and its channels, and
 * nothing below that. So a call about a stylist — her rate is wrong, her
 * calendar will not connect, her reminders are going out as the shop's — meant
 * talking an owner through screens rather than fixing it, which is slowest for
 * exactly the people least likely to find the screen themselves.
 *
 * Settings only, and that line holds. This console has never been able to read
 * a conversation and still cannot: every customer of every business is told
 * that nobody else on Second Pair can see what they wrote, and a support screen
 * that could would make that sentence false for all of them at once.
 */
export function Team({ b }: { b: BusinessSummary }) {
  if (b.team.length === 0) return null;

  return (
    <details className="rounded-xl border border-border p-3">
      <summary className="cursor-pointer text-sm text-muted">
        Their people
        <span className="ml-2 text-xs">
          — {b.team.length}, {b.team.filter((p) => p.active).length} taking bookings
        </span>
      </summary>

      <div className="mt-4 space-y-3">
        {b.team.map((person) => (
          <Person key={person.id} person={person} />
        ))}
      </div>
    </details>
  );
}

function Person({ person }: { person: BusinessSummary["team"][number] }) {
  const [state, action] = useActionState<Result, FormData>(fixPerson, {});

  return (
    <form action={action} className="rounded-lg border border-border bg-surface-2/40 p-3">
      <input type="hidden" name="artist_id" value={person.id} />

      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-medium">{person.name}</span>
        {person.role && <span className="hint">{person.role}</span>}
        {!person.active && <span className="pill bg-surface-2 text-muted">not taking bookings</span>}
        {person.ownerManaged && <span className="pill bg-surface-2 text-muted">owner manages</span>}
        <span className="hint ml-auto">{person.hasLogin ? "has a login" : "no login"}</span>
      </div>

      {/*
       * The fault worth seeing before anything else. A calendar that stopped
       * reading is the commonest thing somebody rings about, and it is
       * invisible on every screen except this one.
       */}
      {person.personalCalendarError && (
        <p className="mt-2 rounded bg-warn/10 px-2 py-1 text-xs text-warn">
          Their calendar last failed: {person.personalCalendarError}
        </p>
      )}

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="label">Name</span>
          <input name="name" defaultValue={person.name} className="input" />
        </label>
        <label className="block">
          <span className="label">What they do</span>
          <input name="role" defaultValue={person.role ?? ""} className="input" />
        </label>
        <label className="block">
          <span className="label">Their email</span>
          <input name="email" defaultValue={person.email ?? ""} className="input" />
          <span className="hint">Where their own booking alerts go.</span>
        </label>
        <label className="block">
          <span className="label">Travelling time</span>
          <input
            name="travel_buffer_minutes"
            type="number"
            min={0}
            max={240}
            defaultValue={person.travelBufferMinutes ?? ""}
            placeholder="the business's"
            className="input"
          />
        </label>
        <label className="block">
          <span className="label">Hourly rate</span>
          <input
            name="hourly_rate"
            defaultValue={(person.hourlyRatePence / 100).toFixed(2)}
            className="input"
          />
        </label>
        <label className="block">
          <span className="label">Minimum charge</span>
          <input
            name="min_charge"
            defaultValue={(person.minChargePence / 100).toFixed(2)}
            className="input"
          />
        </label>
      </div>

      {/*
       * Their own calendar, which is the one thing here somebody genuinely
       * cannot fix for themselves when they have no login.
       */}
      <label className="mt-2 block">
        <span className="label">Their own calendar, blocking their time</span>
        <input
          name="personal_ical_url"
          type="url"
          defaultValue={person.personalIcalUrl ?? ""}
          placeholder="https://…/basic.ics"
          className="input font-mono text-xs"
        />
        <label className="mt-1 flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" name="touch_calendar" value="1" />
          Change it — leave unticked and this box is ignored, so clearing it is deliberate
        </label>
      </label>

      {/*
       * The switches are only written when this is ticked.
       *
       * An unticked checkbox is not submitted, so reading them straight would
       * turn every box into a deliberate off — and a support form that quietly
       * switches somebody's notifications off while fixing their rate is worse
       * than no support form.
       */}
      <div className="mt-3 rounded-lg bg-surface-2/60 p-2.5">
        <label className="flex items-center gap-2 text-xs font-medium">
          <input type="checkbox" name="touch_switches" value="1" />
          Change the switches below
        </label>

        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
          <Switch name="active" label="Taking bookings" on={person.active} />
          <Switch name="owner_managed" label="Owner manages them" on={person.ownerManaged} />
          <Switch name="notify_own_bookings" label="Told about their bookings" on={person.notifyOwnBookings} />
          <Switch name="reminders_own" label="Sends their own reminders" on={person.remindersOwn} />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="submit" className="btn-ghost text-sm">
          Save {person.name.split(" ")[0]}
        </button>
        {state.ok && <span className="hint">{state.note ?? "Saved."}</span>}
        {state.error && <span className="text-sm text-warn">{state.error}</span>}
      </div>
    </form>
  );
}

function Switch({ name, label, on }: { name: string; label: string; on: boolean }) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <input type="checkbox" name={name} defaultChecked={on} />
      {label}
    </label>
  );
}
