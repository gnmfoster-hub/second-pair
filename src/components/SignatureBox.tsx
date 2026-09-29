"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Somewhere to sign, by drawing or by typing.
 *
 * Lifted out of the consent form on 29 September so the agreement a business
 * signs can use the same one. There is now one signature box in this product
 * rather than two, which matters more here than it would elsewhere: both the
 * documents it appears on are the ones that get read again when there is a
 * disagreement, and a fix made to one copy and not the other is a fix that is
 * only in the document nobody is arguing about.
 *
 * It talks to the form through named fields and nothing else — no callback, no
 * lifted state. So it can be dropped inside any `<form>` and the action reads
 * `signature` and `signer_name` the way it reads anything else.
 *
 * Two things in here are load-bearing rather than decorative, and both were
 * learned rather than designed:
 *
 *   • `touch-none` on the canvas. Without it, signing on a phone drags the page.
 *
 *   • The typed alternative. The canvas is driven by pointer events, is not
 *     focusable, and has no keyboard path — and signing is required. Without a
 *     second way, somebody using a keyboard or a screen reader cannot complete
 *     the one kind of document in this product that is legally operative.
 *     Typing your own name into a box that says it is your signature is a
 *     deliberate act of signing, which is the part that matters.
 */
export function SignatureBox({
  /** What the box is called. "Sign here" on a form; the agreement says more. */
  label = "Sign here",
  /** Said under the name field, where a business's own wording differs. */
  hint,
}: {
  label?: string;
  hint?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [data, setData] = useState("");
  /** Signing by typing rather than drawing. See the button below. */
  const [typing, setTyping] = useState(false);
  const [name, setName] = useState("");
  const drawing = useRef(false);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ratio = 2;
    c.width = c.offsetWidth * ratio;
    c.height = c.offsetHeight * ratio;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#17150f";

    const point = (e: PointerEvent) => {
      const r = c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const down = (e: PointerEvent) => {
      drawing.current = true;
      c.setPointerCapture(e.pointerId);
      const p = point(e);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
    };
    const move = (e: PointerEvent) => {
      if (!drawing.current) return;
      const p = point(e);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    };
    const up = () => {
      if (!drawing.current) return;
      drawing.current = false;
      setData(c.toDataURL("image/png"));
    };
    c.addEventListener("pointerdown", down);
    c.addEventListener("pointermove", move);
    c.addEventListener("pointerup", up);
    c.addEventListener("pointerleave", up);

    /*
     * Turning the phone resizes the box, and the canvas keeps the old one.
     *
     * The drawing surface is set once from the width at the time, so signing in
     * portrait and then turning the phone left the strokes offset from the
     * finger — signed, and looking nothing like the signature. Sized again on a
     * rotate, which clears it, so it is done before rather than during.
     */
    const resize = () => {
      if (c.offsetWidth * ratio === c.width) return;
      c.width = c.offsetWidth * ratio;
      c.height = c.offsetHeight * ratio;
      const again = c.getContext("2d");
      if (again) {
        again.scale(ratio, ratio);
        again.lineWidth = 2.2;
        again.lineCap = "round";
        again.lineJoin = "round";
        again.strokeStyle = "#17150f";
      }
      setData("");
    };
    window.addEventListener("resize", resize);

    return () => {
      c.removeEventListener("pointerdown", down);
      c.removeEventListener("pointermove", move);
      c.removeEventListener("pointerup", up);
      c.removeEventListener("pointerleave", up);
      window.removeEventListener("resize", resize);
    };
  }, []);

  const clear = () => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (c && ctx) ctx.clearRect(0, 0, c.width, c.height);
    setData("");
  };

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium">
          {label}
          <span className="text-warn"> *</span>
        </span>
        <button type="button" onClick={clear} className="text-sm text-muted hover:text-foreground">
          Clear
        </button>
      </div>
      {!typing && (
        <canvas
          ref={canvas}
          className="mt-2 h-40 w-full touch-none rounded-lg border border-dashed border-border bg-white"
          aria-label="Signature box. Draw your signature with your finger or mouse."
        />
      )}

      <button
        type="button"
        onClick={() => setTyping((t) => !t)}
        className="mt-2 text-sm text-muted underline underline-offset-4 hover:text-foreground"
      >
        {typing ? "Draw it instead" : "Type my name instead of drawing"}
      </button>

      <input
        type="hidden"
        name="signature"
        value={typing ? (name.trim() ? `typed:${name.trim()}` : "") : data}
      />

      <label className="mt-3 block">
        <span className="text-sm font-medium">
          Your full name<span className="text-warn"> *</span>
          {typing && <span className="hint block font-normal">This counts as your signature.</span>}
          {!typing && hint && <span className="hint block font-normal">{hint}</span>}
        </span>
        <input
          id="signer_name"
          name="signer_name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="input mt-2"
          autoComplete="name"
        />
      </label>
    </div>
  );
}
