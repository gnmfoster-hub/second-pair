"use client";

import Link from "next/link";
import { useSheet, asSheet } from "@/components/useSheet";
import type { Words } from "@/lib/wordsText";

/**
 * Who is this for, asked before anything else.
 *
 * The form used to open straight onto a title and a length, which quietly
 * decides two things: that this is one person, and that whoever is typing
 * knows how long the job takes. Both are often wrong, and the second is
 * doubly so — the business has already written down how long a colour takes,
 * and asking again is asking somebody to remember something the product knows.
 *
 * Asking who first is what makes the rest possible. Only once it knows this is
 * Mrs Doyle can it set aside the twenty minutes extra somebody recorded
 * against her months ago, which is the whole point of having recorded it.
 */
export function AddMenu({
  onPick,
  onClose,
  byList,
  words,
}: {
  onPick: (kind: "client" | "walkin" | "other") => void;
  onClose: () => void;
  /** Whether this business keeps a named price list to pick a service from. */
  byList: boolean;
  /** What this business calls things, from its trade and its own changes. */
  words: Words;
}) {
  const sheet = useSheet<HTMLDivElement>();

  return asSheet(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        /*
          * Holds the diary still behind it, like the form it opens into.
          * Without it a drag anywhere over this scrolls the week underneath,
          * so the menu appears to be stuck to a page that is moving.
          */
        ref={sheet}
        className="max-h-[min(82dvh,var(--sheet-room,82dvh))] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-2xl bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-xl sm:rounded-2xl sm:pb-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="section-title">What are you adding?</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-muted hover:text-foreground"
          >
            Close
          </button>
        </div>

        <div className="mt-4 space-y-2">
          <Choice
            title="Somebody who has been before"
            detail={
              byList
                ? `Their record, their usual ${words.practitioner}, and anything the ${words.business} has written down about how long they take.`
                : "Their record and their history, so this booking joins the rest."
            }
            onClick={() => onPick("client")}
          />

          <Choice
            title="Somebody new, or a walk-in"
            detail="A name and a time. You can make them a client later if they come back."
            onClick={() => onPick("walkin")}
          />

          <Link href="/diary/group" className="block">
            <Choice
              title="Several people together"
              detail="A wedding party, a family, a house with four rooms. Each gets their own appointment, tied together."
            />
          </Link>

          <Choice
            title="Time off, or something that is not a client"
            detail="A meeting, a holiday, lunch, a delivery. Blocks the diary without being an appointment."
            onClick={() => onPick("other")}
          />

          {/*
            * The one thing on this menu that never touches the diary.
            *
            * A bottle sold over the counter takes no time and blocks nothing,
            * so it has no business being an appointment. But it is money taken
            * today, and this is where somebody already comes to write down
            * what has just happened.
            */}
          <Link href="/diary/sell" className="block">
            <Choice
              title="Sell something"
              detail={`${words.exampleProduct}, a voucher, somebody paying cash. Goes in the takings, not the diary.`}
            />
          </Link>
        </div>
      </div>
    </div>,
  );
}

function Choice({
  title,
  detail,
  onClick,
}: {
  title: string;
  detail: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-xl border border-border bg-surface-2/40 px-4 py-3 text-left transition-colors hover:border-accent/40"
    >
      <div className="font-medium">{title}</div>
      <div className="hint mt-0.5">{detail}</div>
    </button>
  );
}
