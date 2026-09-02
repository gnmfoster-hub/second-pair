"use client";

import { formatPence } from "@/lib/money";
import type { Moment } from "@/lib/engine/moments";

/**
 * The bits of a booking that should not be a sentence.
 *
 * Every chat widget on the internet is bubbles. That is fine for support, where
 * the answer genuinely is words — but this one is trying to get somebody into a
 * diary, and the moments that decide whether that happens were all prose:
 *
 *   "Giles has Tuesday 9am or Thursday 1pm free — either any good?"
 *
 * which asks a person standing in a supermarket to type "thursday please"
 * clearly enough to be understood, on a phone, one-handed. Every one of those
 * typed replies is a place to lose them, and losing them is the entire thing
 * the product exists to stop.
 *
 * So the four moments that matter become things you touch. A time is a button.
 * A price is a card you can read at a glance instead of parsing out of a
 * paragraph. A booking is something you can put straight into your own calendar
 * — which is the difference between a confirmation and a thing you remember.
 *
 * The words stay exactly as they were, above the card. They carry the tone, and
 * they are what gets stored and sent by text message where none of this can be
 * drawn. This is a second way of reading the same reply, never the only way.
 */

/** Tapping a time sends this. Written as the customer would say it. */
export const slotMessage = (label: string) => `${label} please`;

export function MomentCard({
  moment,
  brand,
  onBrand,
  onPick,
  disabled,
  pressed = null,
}: {
  moment: Moment;
  brand: string;
  onBrand: string;
  /** Sends a message on the customer's behalf, exactly as if they had typed it. */
  onPick: (message: string) => void;
  disabled: boolean;
  /**
   * Which slot to draw as being pressed, for the demo on the home page.
   *
   * A button that sends with no acknowledgement looks like the page reloading,
   * and the demo has no cursor to explain itself with. Nothing sets this in the
   * widget proper, where a real finger does the job.
   */
  pressed?: number | null;
}) {
  switch (moment.kind) {
    case "slots":
      return (
        <Card>
          <Label>
            {moment.appointment === "consultation"
              ? `${moment.minutes}-minute consultation with ${moment.person}`
              : `${moment.minutes} minutes with ${moment.person}`}
          </Label>
          <div className="mt-2.5 grid gap-1.5">
            {moment.slots.map((slot, i) => (
              <button
                key={slot.startsAt}
                type="button"
                disabled={disabled}
                onClick={() => onPick(slotMessage(slot.label))}
                /*
                 * Full width and 44px tall, stacked rather than wrapped.
                 *
                 * These are the highest-stakes taps in the product and they
                 * happen one-handed on a phone. Four dates in a wrapping row
                 * put two of them under a thumb at once.
                 */
                className={`flex min-h-11 items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left text-sm font-medium transition-all motion-safe:animate-[rise_240ms_ease-out_both] ${
                  pressed === i
                    ? "scale-[0.98]"
                    : "border-border bg-surface hover:-translate-y-px active:translate-y-0 disabled:opacity-40"
                }`}
                style={
                  pressed === i
                    ? { borderColor: brand, color: brand, background: `color-mix(in srgb, ${brand} 8%, transparent)` }
                    : undefined
                }
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = brand;
                  e.currentTarget.style.color = brand;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "";
                  e.currentTarget.style.color = "";
                }}
              >
                <span>{slot.label}</span>
                <span aria-hidden className="text-muted">
                  →
                </span>
              </button>
            ))}
          </div>
          <Foot>Or say when suits you better.</Foot>
        </Card>
      );

    case "quote":
      return (
        <Card>
          <Label>
            {moment.label}
            {moment.person ? ` with ${moment.person}` : ""}
          </Label>
          <p className="mt-1.5 font-display text-2xl font-bold tabular-nums leading-none">
            {formatPence(moment.lowPence)}
            <span className="mx-1.5 font-normal text-muted">–</span>
            {formatPence(moment.highPence)}
          </p>
          {moment.note && <p className="mt-1 text-[11px] text-muted">{moment.note}</p>}

          <dl className="mt-3 space-y-1 text-xs">
            <Row term="How long" value={hours(moment.hoursLow, moment.hoursHigh)} />
            {moment.depositPence > 0 && (
              <Row term="Deposit" value={formatPence(moment.depositPence)} />
            )}
            {moment.needsConsultation && <Row term="First" value="A consultation" />}
          </dl>

          {/* Not decoration. Saying a price is an estimate is the promise the
              assistant is required to make every time it gives one, and it is
              easier to trust when it is attached to the number itself. */}
          <Foot>An estimate — confirmed when they&rsquo;ve seen it.</Foot>
        </Card>
      );

    case "booked":
      return (
        <Card accent={brand}>
          <Label>{moment.held ? "Held for you" : "Booked in"}</Label>
          <p className="mt-1.5 text-base font-semibold leading-snug">{moment.label}</p>
          <p className="mt-0.5 text-xs text-muted">with {moment.person}</p>

          <a
            href={calendarHref(moment)}
            download={`${moment.person.replace(/\W+/g, "-").toLowerCase()}-appointment.ics`}
            className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-transform hover:-translate-y-px"
            style={{ background: brand, color: onBrand }}
          >
            <CalendarIcon />
            Add to my calendar
          </a>

          {moment.held && <Foot>Held for an hour while the deposit is paid.</Foot>}
        </Card>
      );

    case "deposit":
      return (
        <Card accent={brand}>
          <Label>Deposit to secure it</Label>
          <p className="mt-1.5 font-display text-2xl font-bold tabular-nums leading-none">
            {formatPence(moment.amountPence)}
          </p>
          <a
            href={moment.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-transform hover:-translate-y-px"
            style={{ background: brand, color: onBrand }}
          >
            <LockIcon />
            Pay securely
          </a>
          {/* Somebody about to type a card number wants to know where it goes.
              Naming Stripe is the shortest way to say "not into this chat". */}
          <Foot>Card handled by Stripe. Nothing is stored here.</Foot>
        </Card>
      );

    case "handover":
      return (
        <div className="flex items-center gap-2.5 rounded-xl border border-border bg-surface-2/60 px-3.5 py-2.5 text-xs text-muted motion-safe:animate-[rise_240ms_ease-out_both]">
          <span className="relative flex size-2 shrink-0" aria-hidden>
            <span
              className="absolute inline-flex size-full rounded-full opacity-70 motion-safe:animate-ping"
              style={{ background: brand }}
            />
            <span
              className="relative inline-flex size-2 rounded-full"
              style={{ background: brand }}
            />
          </span>
          {moment.person ? `Getting ${moment.person} for you.` : "Getting someone for you."}
        </div>
      );
  }
}

/* ────────────────────────────────────────────────────────────────── pieces */

function Card({ children, accent }: { children: React.ReactNode; accent?: string }) {
  return (
    <div
      className="rounded-2xl border border-border bg-surface p-3.5 shadow-[var(--shadow-card)] motion-safe:animate-[rise_260ms_ease-out_both]"
      /*
       * A hairline of the business's own colour down the left edge.
       *
       * Enough to mark these apart from the bubbles as "this is a thing, not a
       * sentence", without spending the brand colour on a whole filled panel
       * that would shout over the conversation.
       */
      style={accent ? { borderLeft: `3px solid ${accent}` } : undefined}
    >
      {children}
    </div>
  );
}

const Label = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[10px] font-semibold uppercase tracking-[0.09em] text-muted">{children}</p>
);

const Foot = ({ children }: { children: React.ReactNode }) => (
  <p className="mt-2.5 text-[11px] leading-snug text-muted">{children}</p>
);

const Row = ({ term, value }: { term: string; value: string }) => (
  <div className="flex justify-between gap-3">
    <dt className="text-muted">{term}</dt>
    <dd className="font-medium tabular-nums">{value}</dd>
  </div>
);

const hours = (low: number, high: number) =>
  low === high ? `${low} hour${low === 1 ? "" : "s"}` : `${low}–${high} hours`;

/**
 * The appointment, as a file their phone understands.
 *
 * Built here rather than fetched: everything needed is already on screen, and a
 * data URL works with no round trip and nothing to go wrong offline. Folded and
 * escaped per RFC 5545 — the same rules the reminder calendar files follow.
 */
function calendarHref(moment: Extract<Moment, { kind: "booked" }>) {
  const stamp = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,");

  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Second Pair//EN",
    "BEGIN:VEVENT",
    `UID:${stamp(moment.startsAt)}-secondpair`,
    /*
     * Stamped from the appointment, not from the clock.
     *
     * DTSTAMP wants the moment the object was made, and reading the clock at
     * render time made the server and the browser produce different files —
     * a hydration mismatch on the home page, where this card is rendered on
     * both. The appointment itself is a fixed point and every calendar
     * application is content with it.
     */
    `DTSTAMP:${stamp(moment.startsAt)}`,
    `DTSTART:${stamp(moment.startsAt)}`,
    `DTEND:${stamp(moment.endsAt)}`,
    `SUMMARY:${esc(`Appointment with ${moment.person}`)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  return `data:text/calendar;charset=utf-8,${encodeURIComponent(body)}`;
}

const CalendarIcon = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <rect x="3" y="5" width="18" height="16" rx="2.5" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </svg>
);

const LockIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
    <path d="M8 10.5V7a4 4 0 1 1 8 0v3.5" />
  </svg>
);
