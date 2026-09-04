"use client";

import { useActionState, useState } from "react";
import { saveWidgetLook, type FormState } from "../actions";

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
  position,
  teaser,
}: {
  accent: string | null;
  position: string;
  teaser: string | null;
}) {
  const [state, action] = useActionState<FormState, FormData>(saveWidgetLook, {});
  const [colour, setColour] = useState(accent ? `#${accent}` : "#14243F");

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
            Used for the button and anything the customer taps. A pale colour is
            darkened just enough for white text to read on it.
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
