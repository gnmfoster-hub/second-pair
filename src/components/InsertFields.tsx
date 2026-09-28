"use client";

import { MESSAGE_FIELDS, type MessageKind } from "@/lib/messageFields";

/**
 * Buttons that put a field into the wording, where the cursor is.
 *
 * Giles, 28 Sep: "there is no way of adding customer name and other required
 * fields." There was not. The names were written in a tooltip and in the grey
 * example inside an empty box, which disappears the moment anybody types — so
 * from the second sentence onwards the only way to add one was to remember it
 * and spell it right.
 *
 * Spelling it wrong is the part that matters, because it fails quietly. A
 * template saying {{firstname}} does not error: the renderer strips what it
 * cannot fill, and the customer gets "See you tomorrow, ." The check that
 * catches it has always existed and only ever ran after the fact.
 *
 * ── Why it inserts at the cursor rather than appending ──────────────────────
 *
 * Because of where these actually go. "Hi ⟨name⟩, you're booked in for ⟨when⟩"
 * has two of them mid-sentence and none at the end, so appending would mean
 * cutting and pasting every single time — which is the same amount of typing
 * this is meant to remove, plus a chance to break the braces.
 *
 * The caller owns the textarea and its state; this only says what to change it
 * to. That keeps the preview, the segment count and the unknown-field warning
 * all working off the one value they already watch.
 */
export function InsertFields({
  kind,
  /** The textarea this writes into, so the cursor position can be read. */
  target,
  value,
  onChange,
}: {
  kind: MessageKind;
  target: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (next: string) => void;
}) {
  function insert(name: string) {
    const token = `{{${name}}}`;
    const el = target.current;

    /*
     * No textarea to read a cursor from is not an error worth showing anybody.
     *
     * It happens if this renders before the ref is attached. Appending is the
     * right answer then: the field lands somewhere sensible and nothing is
     * lost, which beats doing nothing and looking broken.
     */
    if (!el) {
      onChange(value + token);
      return;
    }

    const from = el.selectionStart ?? value.length;
    const to = el.selectionEnd ?? from;

    /*
     * A space before it where one is wanted.
     *
     * Typing "Hi" then pressing "their first name" gave "Hi{{name}}", and the
     * owner then has to click into exactly the right place to fix it — which is
     * the fiddliness this is supposed to remove. Only where the character
     * before is a word rather than a space or an opening bracket, so
     * "Hi {{name}}" and "(", "—" are all left alone.
     */
    const before = value.slice(0, from);
    const needsSpace = /[\w.,!?]$/.test(before);
    const inserted = `${needsSpace ? " " : ""}${token}`;

    onChange(before + inserted + value.slice(to));

    /*
     * The cursor goes after what was just put in, so somebody can carry on
     * typing the sentence rather than hunting for where they were.
     *
     * After the paint, because the value it is positioning within has not been
     * written to the DOM yet at this point in the handler.
     */
    const at = from + inserted.length;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(at, at);
    });
  }

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="label mr-0.5">Add a field</span>
        {MESSAGE_FIELDS[kind].map((field) => (
          <button
            key={field.name}
            type="button"
            onClick={() => insert(field.name)}
            /*
             * The plain-English word is the button, and the braces are not.
             *
             * "their first name" is what somebody is looking for; "{{name}}" is
             * how the machine spells it, and putting that on the button means
             * reading the tooltip to find out which is which. The literal is
             * still shown, quieter, because it is what ends up in the box and
             * seeing it there is how the connection gets made.
             */
            className="btn-ghost gap-1.5 px-2.5 py-1 text-[13px]"
            title={`Puts ${field.means} in — it arrives as "${field.example}"`}
          >
            {field.means}
            <code className="text-[11px] text-muted">{`{{${field.name}}}`}</code>
          </button>
        ))}
      </div>
      <p className="hint mt-1.5 max-w-prose">
        These are filled in when it sends. Anything else in braces is taken out and
        leaves a gap in the sentence, so it is worth using the buttons rather than
        typing them.
      </p>
    </div>
  );
}
