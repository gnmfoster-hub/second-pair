"use client";

import { useId, useState } from "react";

/**
 * A small question mark that opens a sentence of explanation.
 *
 * Every screen on here says what it means, which is right — somebody setting a
 * business up at eleven at night has nobody to ask. But saying all of it, all
 * the time, has a cost of its own: a page of grey sentences under every box is
 * a page people stop reading, and then the one hint that mattered goes unread
 * with the rest.
 *
 * So the rule is about consequence, not length. A hint stays on the page when
 * getting it wrong costs something — money into the wrong account, a customer
 * offered somebody who has left, a switch that cannot be undone. It goes
 * behind this when it is a detail, a reassurance, or a thing anybody could
 * work out by pressing it.
 *
 * Plain HTML behaviour on purpose: a real button, a real label, keyboard
 * focus, and the text in the page rather than in a tooltip that a phone cannot
 * show and a screen reader skips.
 */
export function Explain({
  children,
  label = "What this means",
}: {
  children: React.ReactNode;
  /** What the button is called for somebody who cannot see the symbol. */
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={id}
        aria-label={label}
        className={`ml-1.5 inline-grid h-[1.15em] w-[1.15em] shrink-0 place-items-center rounded-full border text-[0.68em] font-semibold leading-none align-[0.05em] transition-colors ${
          open
            ? "border-accent bg-accent text-on-accent"
            : "border-border text-muted hover:border-accent hover:text-accent"
        }`}
      >
        ?
      </button>
      {open && (
        /*
          * Set back to ordinary sentence case on purpose.
          *
          * These sit inside a field's label, and a label is uppercase with
          * wide letter-spacing — so the first explanation opened as A WHOLE
          * SENTENCE SHOUTED AT THE READER. It is a sentence, and it should
          * look like one wherever it is hung.
          */
        <span
          id={id}
          className="hint mt-1 block text-[0.8rem] font-normal normal-case leading-snug tracking-normal"
        >
          {children}
        </span>
      )}
    </>
  );
}
