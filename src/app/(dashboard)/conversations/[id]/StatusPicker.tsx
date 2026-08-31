"use client";

import { useTransition } from "react";
import { setStatus } from "./actions";
import { CONV_STATUS_LABELS, type ConvStatus } from "@/lib/types";

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
];

const TONE: Record<ConvStatus, string> = {
  new: "bg-surface-2 text-muted",
  qualified: "bg-surface-2 text-foreground",
  deposit_paid: "bg-ok/10 text-ok",
  booked: "bg-ok/10 text-ok",
  needs_human: "bg-warn/15 text-warn",
  lost: "bg-surface-2 text-muted/60",
};

export function StatusPicker({
  conversationId,
  current,
}: {
  conversationId: string;
  current: ConvStatus;
}) {
  const [saving, save] = useTransition();

  return (
    <label
      className={`relative inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-opacity ${TONE[current]} ${
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
            await setStatus(form);
          });
        }}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {STATUSES.map((status) => (
          <option key={status} value={status}>
            {CONV_STATUS_LABELS[status]}
          </option>
        ))}
      </select>
    </label>
  );
}
