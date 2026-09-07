"use client";

import { useActionState, useEffect, useState } from "react";
import { saveWidgetLook, type FormState } from "../actions";
import { paint, readHex, autoText } from "@/lib/widget/colour";

/**
 * How the widget looks on their own website.
 *
 * These were attributes on the script tag, which means they lived in the HTML
 * of the business's own site. To change their accent colour an owner had to
 * open their source, find the line, edit it and republish — or ring us. A
 * salon that rebrands could not do it from the product they pay for.
 *
 * Held here, it applies everywhere the moment they save. The script tag still
 * wins if somebody has deliberately written one, because being quietly
 * overruled by a setting you cannot see is worse than having two places.
 */
export function Appearance({
  accent,
  text,
  position,
  teaser,
}: {
  accent: string | null;
  text: string | null;
  position: string;
  teaser: string | null;
}) {
  const [state, action] = useActionState<FormState, FormData>(saveWidgetLook, {});
  const [colour, setColour] = useState(accent ? `#${accent}` : "#14243F");
  const [ink, setInk] = useState(text ? `#${text}` : "");

  /*
   * Follow the saved value back.
   *
   * These start from a prop and then stop listening to it, which is right
   * while somebody is typing and wrong the moment the save comes back. Saving
   * a colour the server tidied — #FFF written as #ffffff, or a text colour
   * dropped because it was the automatic one anyway — left the box showing
   * what had been typed rather than what had been kept, so the next save sent
   * the old value again and it looked like saving did nothing.
   */
  useEffect(() => {
    setColour(accent ? `#${accent}` : "#14243F");
    setInk(text ? `#${text}` : "");
  }, [accent, text]);

  /*
   * Exactly what the site will do, from the same function the site uses.
   *
   * A preview that runs its own version of the rule is a preview that can lie,
   * and this one used to: it promised a pale colour would be darkened, which
   * only the panel ever did.
   */
  const look = paint(readHex(colour), ink ? readHex(ink) : null);
  const automatic = !ink || readHex(ink) === autoText(look.fill);

  return (
    <form action={action} className="card mt-4 space-y-5 p-5">
      <div>
        <h2 className="section-title">How it looks</h2>
        <p className="hint mt-1">
          Changes here reach your site straight away &mdash; there is nothing to paste
          again.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="label">Your colour</span>
          <div className="mt-1 flex items-center gap-2">
            {/*
              * A swatch and the code together. The picker is how anybody
              * actually chooses a colour; the hex box is how somebody pastes
              * the one their designer gave them, which is the more common case
              * for a business with a brand.
              */}
            <input
              type="color"
              value={colour}
              onChange={(e) => setColour(e.target.value)}
              className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-border bg-surface p-1"
              aria-label="Pick a colour"
            />
            <input
              name="widget_accent"
              value={colour}
              onChange={(e) => setColour(e.target.value)}
              className="input font-mono"
              placeholder="#14243F"
              spellCheck={false}
            />
          </div>
          <p className="hint mt-1.5">
            The button on your site and anything the customer taps.
          </p>
        </label>

        <label className="block">
          <span className="label">The writing on it</span>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="color"
              value={`#${look.text}`}
              onChange={(e) => setInk(e.target.value)}
              className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-border bg-surface p-1"
              aria-label="Pick a text colour"
            />
            <input
              name="widget_text"
              value={ink}
              onChange={(e) => setInk(e.target.value)}
              className="input font-mono"
              placeholder="Chosen for you"
              spellCheck={false}
            />
          </div>
          <p className="hint mt-1.5">
            {automatic
              ? "Left to us: whichever of white and near-black reads better on your colour."
              : "Empty this box to have it chosen for you."}
          </p>
        </label>

        <label className="block">
          <span className="label">Which corner</span>
          <select name="widget_position" defaultValue={position} className="input">
            <option value="right">Bottom right</option>
            <option value="left">Bottom left</option>
          </select>
          <p className="hint mt-1.5">
            Move it if something else on your site already sits in that corner.
          </p>
        </label>
      </div>

      <label className="block">
        <span className="label">The nudge</span>
        <input
          name="widget_teaser"
          defaultValue={teaser ?? ""}
          className="input"
          maxLength={140}
          placeholder="Hi — anything I can help you with?"
        />
        <p className="hint mt-1.5">
          Appears a few seconds after somebody lands, and types itself out. Say what you
          would say if you looked up and saw them in the doorway.
        </p>
      </label>

      {/*
        * The thing itself, not a description of it.
        *
        * Somebody choosing a colour is asking "what will that look like", and
        * the honest answer is the button, at the size it appears on their site,
        * saying what it will say.
        */}
      <div className="rounded-xl border border-border p-4">
        <div className="label">On your site</div>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <span
            className="inline-flex h-14 items-center gap-2.5 rounded-full px-[18px] text-[13.5px] font-medium shadow-lg"
            style={{ background: `#${look.fill}`, color: `#${look.text}` }}
          >
            <span
              className="h-[7px] w-[7px] rounded-full"
              style={{ background: "#4ade80" }}
            />
            {teaser?.trim() || "Answering now"}
          </span>

          <div className="text-sm">
            <div className={look.readable ? "text-muted" : "text-warn"}>
              {look.readable
                ? `Comfortable to read (${look.ratio.toFixed(1)} to 1).`
                : `Hard to read (${look.ratio.toFixed(1)} to 1).`}
            </div>
            {!look.readable && (
              <p className="hint mt-0.5 max-w-xs">
                It is your brand and you can keep it. But 4.5 to 1 is the point
                where most people stop having to work at it, and somebody
                glancing at a corner of a page is not going to work at it.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" className="btn bg-accent text-on-accent">
          Save
        </button>
        {state.ok && <span className="hint">Saved. Your site has it already.</span>}
        {state.error && <span className="text-sm text-warn">{state.error}</span>}
      </div>
    </form>
  );
}
