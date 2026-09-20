"use client";

import { useState, useTransition } from "react";
import { setStatus } from "./actions";
import { CONV_STATUS_LABELS, type ConvStatus } from "@/lib/types";
import { STATUS_TONE } from "@/lib/conversationStatus";

/**
 * Where a conversation has got to.
 *
 * Saves on change rather than making you pick and then press Set. A two-step
 * control for a one-step decision is how a status ends up wrong: people choose
 * the value, see it in the box, and walk away without pressing anything.
 *
 * Still a native select underneath, which is the right control on a phone —
 * iOS and Android both give it a proper picker, and no custom dropdown is
 * better than that.
 */
const STATUSES: ConvStatus[] = [
  "new",
  "qualified",
  "booked",
  "deposit_paid",
  "needs_human",
  "lost",
  /*
   * Paperwork sits down here with spam because neither one is a customer, and
   * it is offered at all for the reason the category exists: the filing is my
   * guess. This is where somebody says the guess was wrong. Moving a real
   * enquiry out of Paperwork, or a receipt into it, is the only signal that
   * ever says which way the rules want bending.
   */
  "paperwork",
  "spam",
];


export function StatusPicker({
  conversationId,
  current,
  hasBooking,
}: {
  conversationId: string;
  current: ConvStatus;
  /**
   * There is a booking in the diary off the back of this conversation.
   *
   * Spam means "this was never a customer". Somebody with an appointment is a
   * customer by definition, so the option is not offered — and it is not a
   * hypothetical: John had a deep clean booked with Karen for the Thursday,
   * two reminders sent, and a second clean half-arranged, and the thread was
   * marked spam by a mis-tap. Spam hides a conversation from the inbox and
   * every figure, so he simply vanished from the business he was booked with
   * while the assistant carried on talking to him.
   *
   * Hidden rather than confirmed with a dialog. There is no good reason to
   * mark a booked customer as spam, and a warning somebody has to read is a
   * warning somebody clicks through.
   */
  hasBooking?: boolean;
}) {
  const [saving, save] = useTransition();
  const [failed, setFailed] = useState<string | null>(null);

  // Still listed if it is somehow already set, or the box would show a blank.
  const choices = STATUSES.filter(
    (s) => s !== "spam" || !hasBooking || current === "spam",
  );

  /*
   * Shown where the pill is, because that is what was just pressed. The pill
   * itself goes back to the real value on its own — nothing was written, so
   * the page re-renders with what is actually stored, and a control that
   * quietly reverts with no explanation is the thing being fixed here.
   */
  return (
    <span className="inline-flex flex-col items-start gap-1">
    <label
      /*
       * The same mark as the inbox, straight and unworn.
       *
       * It is the same thing about the same conversation, so it should look
       * like the same thing — it had its own colours and they had drifted, so
       * Qualified was green in the list and grey on the page you opened from
       * it. But it is a control rather than a mark: distressing something
       * somebody is meant to press says the control is broken, which is why
       * the ink and the lean are both off here.
       */
      className={`stamp stamp-flat relative gap-2 text-sm transition-opacity ${STATUS_TONE[current]} ${
        saving ? "opacity-60" : ""
      }`}
    >
      <span className="sr-only">Status</span>
      <span>{saving ? "Saving…" : CONV_STATUS_LABELS[current]}</span>

      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="m6 9 6 6 6-6" />
      </svg>

      {/* The real control, invisible on top of the pill so the native picker
          still opens and the keyboard still works. */}
      <select
        value={current}
        disabled={saving}
        onChange={(event) => {
          const next = event.target.value;
          save(async () => {
            const form = new FormData();
            form.set("conversation_id", conversationId);
            form.set("status", next);
            const result = await setStatus(form);
            setFailed(result?.error ?? null);
          });
        }}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {choices.map((status) => (
          <option key={status} value={status}>
            {CONV_STATUS_LABELS[status]}
          </option>
        ))}
      </select>
    </label>
      {failed && <span className="text-xs text-warn">{failed}</span>}
    </span>
  );
}
