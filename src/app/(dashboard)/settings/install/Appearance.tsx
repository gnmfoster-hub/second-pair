"use client";

import { useActionState, useEffect, useState } from "react";
import { saveWidgetLook, type FormState } from "../actions";
import { paint, readHex, autoText } from "@/lib/widget/colour";
import {
  geometry,
  bubbleColours,
  lineFor,
  fontStack,
  weightValue,
  surfaceLook,
  painted,
  type Font,
  type Weight,
  type Surface,
  type Shape,
  type Size,
  type Bubble,
  type Pulse,
} from "@/lib/widget/look";

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
export type WidgetLook = {
  accent: string | null;
  text: string | null;
  position: string;
  teaser: string | null;
  enabled: boolean;
  lineOpen: string | null;
  lineClosed: string | null;
  shape: string;
  size: string;
  bubble: string;
  pulse: string;
  font: string;
  weight: string;
  surface: string;
  bubbleFill: string | null;
  bubbleText: string | null;
};

export function Appearance({
  accent,
  text,
  position,
  teaser,
  enabled,
  lineOpen,
  lineClosed,
  shape: savedShape,
  size: savedSize,
  bubble: savedBubble,
  pulse: savedPulse,
  font: savedFont,
  weight: savedWeight,
  surface: savedSurface,
  bubbleFill,
  bubbleText,
}: WidgetLook) {
  const [state, action] = useActionState<FormState, FormData>(saveWidgetLook, {});
  const [colour, setColour] = useState(accent ? `#${accent}` : "#14243F");
  const [ink, setInk] = useState(text ? `#${text}` : "");
  const [shape, setShape] = useState<Shape>((savedShape as Shape) ?? "round");
  const [size, setSize] = useState<Size>((savedSize as Size) ?? "medium");
  const [bubble, setBubble] = useState<Bubble>((savedBubble as Bubble) ?? "light");
  const [pulse, setPulse] = useState<Pulse>((savedPulse as Pulse) ?? "once");
  const [font, setFont] = useState<Font>((savedFont as Font) ?? "system");
  const [weight, setWeight] = useState<Weight>((savedWeight as Weight) ?? "medium");
  const [surface, setSurface] = useState<Surface>((savedSurface as Surface) ?? "raised");
  const [nudgeFill, setNudgeFill] = useState(bubbleFill ? `#${bubbleFill}` : "");
  const [nudgeInk, setNudgeInk] = useState(bubbleText ? `#${bubbleText}` : "");

  /*
   * Whether this browser will show any of it.
   *
   * Windows turns animations off for a lot of people without them ever having
   * chosen it — battery saver does it, and so does a setting several versions
   * of Windows have moved. Somebody in that state switches the ring on, sees
   * nothing, and reasonably concludes the ring is broken.
   *
   * Read after mount rather than during render, because the server has no
   * browser to ask and guessing produces a hydration mismatch.
   */
  const [motionOff, setMotionOff] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const read = () => setMotionOff(query.matches);
    read();
    query.addEventListener("change", read);
    return () => query.removeEventListener("change", read);
  }, []);
  const [on, setOn] = useState(enabled);
  const [openLine, setOpenLine] = useState(lineOpen ?? "");
  const [closedLine, setClosedLine] = useState(lineClosed ?? "");

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
    setShape((savedShape as Shape) ?? "round");
    setSize((savedSize as Size) ?? "medium");
    setBubble((savedBubble as Bubble) ?? "light");
    setPulse((savedPulse as Pulse) ?? "once");
    setFont((savedFont as Font) ?? "system");
    setWeight((savedWeight as Weight) ?? "medium");
    setSurface((savedSurface as Surface) ?? "raised");
    setNudgeFill(bubbleFill ? `#${bubbleFill}` : "");
    setNudgeInk(bubbleText ? `#${bubbleText}` : "");
    setOn(enabled);
    setOpenLine(lineOpen ?? "");
    setClosedLine(lineClosed ?? "");
  }, [
    accent,
    text,
    savedShape,
    savedSize,
    savedBubble,
    savedPulse,
    savedFont,
    savedWeight,
    savedSurface,
    bubbleFill,
    bubbleText,
    enabled,
    lineOpen,
    lineClosed,
  ]);

  /*
   * Exactly what the site will do, from the same function the site uses.
   *
   * A preview that runs its own version of the rule is a preview that can lie,
   * and this one used to: it promised a pale colour would be darkened, which
   * only the panel ever did.
   */
  const look = paint(readHex(colour), ink ? readHex(ink) : null);
  const automatic = !ink || readHex(ink) === autoText(look.fill);
  const box = geometry(size, shape);
  const preset = bubbleColours(bubble);
  const nudgePaint =
    nudgeFill || nudgeInk
      ? paint(nudgeFill ? readHex(nudgeFill) : null, nudgeInk ? readHex(nudgeInk) : null)
      : null;
  const nudge = nudgePaint
    ? { fill: `#${nudgePaint.fill}`, text: `#${nudgePaint.text}`, shadow: preset.shadow }
    : preset;

  const face = surfaceLook(surface, look.fill);
  const buttonPaint = painted(surface, look.fill, look.text);
  const stack = fontStack(font);

  // Shown open, because that is the state a business pictures when choosing.
  const shown = lineFor("Answering now", true, { open: openLine });

  return (
    <form action={action} className="card mt-4 space-y-5 p-5">
      <div>
        <h2 className="section-title">How it looks</h2>
        <p className="hint mt-1">
          Changes here reach your site straight away &mdash; there is nothing to paste
          again.
        </p>
      </div>

      {/*
        * The off switch, above everything it governs.
        *
        * Turning it off takes the widget off the page rather than hiding it,
        * and leaves the script tag alone — so it comes back with one tick and
        * nobody has to go near their website.
        */}
      <label className="flex items-start gap-3 rounded-xl border border-border p-4">
        <input
          type="checkbox"
          name="widget_enabled"
          checked={on}
          onChange={(e) => setOn(e.target.checked)}
          className="mt-0.5 accent-[var(--accent)]"
        />
        <span>
          <span className="text-sm font-medium">Show it on my website</span>
          <p className="hint mt-0.5">
            {on
              ? "It is on your site now. Turn this off and it disappears — the code stays where it is, so it comes back with one tick."
              : "It is off. Nobody sees it and nothing is answering on your website. The code on your site can stay where it is."}
          </p>
        </span>
      </label>

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

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="label">Its shape</span>
          <select
            name="widget_shape"
            value={shape}
            onChange={(e) => setShape(e.target.value as Shape)}
            className="input"
          >
            <option value="round">Round</option>
            <option value="soft">Softly squared</option>
            <option value="square">Squared</option>
          </select>
          <p className="hint mt-1.5">Match whatever your own buttons do.</p>
        </label>

        <label className="block">
          <span className="label">Its size</span>
          <select
            name="widget_size"
            value={size}
            onChange={(e) => setSize(e.target.value as Size)}
            className="input"
          >
            <option value="small">Small</option>
            <option value="medium">Medium</option>
            <option value="large">Large</option>
          </select>
          <p className="hint mt-1.5">Larger gets noticed. Smaller gets out of the way.</p>
        </label>

        <label className="block">
          <span className="label">Catching an eye</span>
          <select
            name="widget_pulse"
            value={pulse}
            onChange={(e) => setPulse(e.target.value as Pulse)}
            className="input"
          >
            <option value="off">Stay still</option>
            <option value="once">Ring once</option>
            <option value="always">Keep ringing</option>
          </select>
          <p className="hint mt-1.5">
            {pulse === "off"
              ? "No movement at all beyond appearing."
              : pulse === "once"
                ? "Two rings when the nudge appears, then it settles."
                : "A ring every few seconds. Stops the moment somebody opens it or waves the nudge away, and after two minutes regardless."}
          </p>
          {motionOff && pulse !== "off" && (
            <p className="hint mt-1.5 text-warn">
              <strong>This browser is set to reduce motion</strong>, so you will not see
              it here or on your site &mdash; visitors without that setting will. It is
              usually Windows&rsquo; own animation setting, or battery saver.
            </p>
          )}
        </label>

        <label className="block">
          <span className="label">The nudge bubble</span>
          <select
            name="widget_bubble"
            value={bubble}
            onChange={(e) => setBubble(e.target.value as Bubble)}
            className="input"
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
          <p className="hint mt-1.5">Dark, if your site is dark.</p>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block">
          <span className="label">Its lettering</span>
          <select
            name="widget_font"
            value={font}
            onChange={(e) => setFont(e.target.value as Font)}
            className="input"
          >
            <option value="site">Match my website</option>
            <option value="system">System</option>
            <option value="sans">Sans</option>
            <option value="serif">Serif</option>
            <option value="rounded">Rounded</option>
            <option value="mono">Monospace</option>
          </select>
          <p className="hint mt-1.5">
            {font === "site"
              ? "Takes whatever your own pages are set in, webfont and all. Nothing to load and nothing to configure."
              : "Shown here in the real face. Match my website is usually the one that makes it look like it belongs."}
          </p>
        </label>

        <label className="block">
          <span className="label">How heavy</span>
          <select
            name="widget_weight"
            value={weight}
            onChange={(e) => setWeight(e.target.value as Weight)}
            className="input"
          >
            <option value="regular">Regular</option>
            <option value="medium">Medium</option>
            <option value="bold">Bold</option>
          </select>
          <p className="hint mt-1.5">The nudge stays at a reading weight either way.</p>
        </label>

        <label className="block">
          <span className="label">How it sits on the page</span>
          <select
            name="widget_surface"
            value={surface}
            onChange={(e) => setSurface(e.target.value as Surface)}
            className="input"
          >
            <option value="raised">Raised</option>
            <option value="flat">Flat</option>
            <option value="glass">Frosted</option>
            <option value="outline">Outline</option>
          </select>
          <p className="hint mt-1.5">
            {surface === "raised"
              ? "A shadow, so it floats above your page. Reads on anything."
              : surface === "flat"
                ? "No shadow. Sits in the page rather than over it."
                : surface === "glass"
                  ? "Frosted, with your page showing through. Check it against a busy part of your site."
                  : "An outline with your page showing through. The writing is your colour, over whatever is behind it — worth looking at on a photograph."}
          </p>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="label">The nudge, in your own colours</span>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="color"
              value={nudge.fill}
              onChange={(e) => setNudgeFill(e.target.value)}
              className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-border bg-surface p-1"
              aria-label="Pick a nudge colour"
            />
            <input
              name="widget_bubble_fill"
              value={nudgeFill}
              onChange={(e) => setNudgeFill(e.target.value)}
              className="input font-mono"
              placeholder={bubble === "dark" ? "Dark" : "Light"}
              spellCheck={false}
            />
          </div>
          <p className="hint mt-1.5">
            Empty uses the light or dark you picked above.
          </p>
        </label>

        <label className="block">
          <span className="label">And its writing</span>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="color"
              value={nudge.text}
              onChange={(e) => setNudgeInk(e.target.value)}
              className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-border bg-surface p-1"
              aria-label="Pick a nudge text colour"
            />
            <input
              name="widget_bubble_text"
              value={nudgeInk}
              onChange={(e) => setNudgeInk(e.target.value)}
              className="input font-mono"
              placeholder="Chosen for you"
              spellCheck={false}
            />
          </div>
          <p className="hint mt-1.5">
            Left empty, it picks whichever reads on the colour beside it.
          </p>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="label">What it says when you are open</span>
          <input
            name="widget_line_open"
            value={openLine}
            onChange={(e) => setOpenLine(e.target.value)}
            className="input"
            maxLength={48}
            placeholder="Answering now"
          />
          <p className="hint mt-1.5">
            Leave it empty and it says &ldquo;Answering now&rdquo;.
          </p>
        </label>

        <label className="block">
          <span className="label">And when you are closed</span>
          <input
            name="widget_line_closed"
            value={closedLine}
            onChange={(e) => setClosedLine(e.target.value)}
            className="input"
            maxLength={48}
            placeholder="Closed — I can still book you"
          />
          <p className="hint mt-1.5">
            This is the one that earns its keep. Somebody reading it at ten at night
            is being told they can still get booked in, which is the whole point of
            paying for this. Say it in your words if ours are not yours.
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

        {/*
          * The real thing, at the size and shape it will be.
          *
          * Every number here comes from the same functions the site uses, so
          * this cannot promise something the widget will not do. That is not
          * theoretical: for weeks it described a darkening only the panel did.
          */}
        <div
          className={`mt-3 flex flex-wrap items-end gap-4 ${on ? "" : "opacity-40 saturate-0"}`}
        >
          <div className="flex flex-col items-start gap-2.5">
            <span
              className="inline-flex max-w-full items-center gap-2 whitespace-nowrap"
              style={{
                background: nudge.fill,
                color: nudge.text,
                boxShadow: nudge.shadow,
                borderRadius: shape === "square" ? "10px 10px 2px 10px" : "14px 14px 4px 14px",
                padding: "11px 14px",
                font: `400 14px/1.45 ${stack === "inherit" ? "inherit" : stack}`,
              }}
            >
              {teaser?.trim() || "Hi — anything I can help you with?"}
            </span>

            {/*
              * The ring, so the choice can be seen rather than imagined.
              *
              * Written here rather than in a stylesheet because the colour is
              * the business's and changes as they pick it. "Keep ringing" is
              * shown as a loop; on their site the same ring stops when the
              * visitor answers it, which the text beside the box says.
              */}
            <style>{`
              @keyframes sp-preview-ring {
                0%   { box-shadow: var(--sp-rest), 0 0 0 0 var(--sp-preview); transform: scale(1); }
                35%  { transform: scale(1.045); }
                70%  { box-shadow: var(--sp-rest), 0 0 0 22px rgba(0,0,0,0); }
                100% { box-shadow: var(--sp-rest), 0 0 0 0 rgba(0,0,0,0); transform: scale(1); }
              }
              @media (prefers-reduced-motion: reduce) {
                .sp-preview-button { animation: none !important; }
              }
            `}</style>

            <span
              className="sp-preview-button inline-flex items-center"
              style={
                {
                  background: buttonPaint.background,
                  color: buttonPaint.colour,
                  height: box.height,
                  minWidth: box.height,
                  borderRadius: box.radius,
                  fontSize: box.font,
                  fontWeight: weightValue(weight),
                  fontFamily: stack === "inherit" ? "inherit" : stack,
                  boxShadow: face.shadow === "none" ? "none" : face.shadow,
                  border: face.border === "0" ? undefined : face.border,
                  backdropFilter: face.blur ?? undefined,
                  gap: 10,
                  padding: `0 ${box.padding}px 0 ${Math.round(box.padding * 0.67)}px`,
                  "--sp-preview": `#${look.fill}d9`,
                  // The ring carries the resting shadow in every frame, so a
                  // flat or outlined button must not grow one while it rings.
                  "--sp-rest": face.shadow === "none" ? "0 0 0 0 rgba(0,0,0,0)" : face.shadow,
                  animation:
                    pulse === "off" || !on
                      ? undefined
                      : pulse === "once"
                        ? "sp-preview-ring 1.6s ease-out 2"
                        : "sp-preview-ring 1.6s ease-out infinite",
                } as React.CSSProperties
              }
            >
              <span
                className="rounded-full"
                style={{ width: 7, height: 7, background: "#4ade80", flex: "none" }}
              />
              {shown}
            </span>
          </div>

          <div className="text-sm">
            {!on && (
              <div className="text-muted">
                Switched off. Nothing appears on your site at all.
              </div>
            )}
            {/*
              * A number only where a number means something.
              *
              * Contrast is between the writing and what is behind it. On a
              * filled button that is the fill, and we know it. On an outlined
              * or frosted one it is the customer's own page showing through,
              * which we have never seen — quoting the fill-against-text figure
              * there would be a confident answer to a different question.
              */}
            {surface === "outline" || surface === "glass" ? (
              <div className="text-muted">
                {surface === "outline"
                  ? "The writing sits on your own page, so how readable it is depends on what is behind it."
                  : "Your page shows through, so the contrast is a little lower than it looks here."}
                <p className="hint mt-0.5 max-w-xs">
                  Worth looking at on the busiest part of your site &mdash; a photograph,
                  or a dark section &mdash; rather than on a plain background.
                </p>
              </div>
            ) : (
              <>
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
              </>
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
