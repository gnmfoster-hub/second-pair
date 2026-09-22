"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { SCEN, type TradeKey } from "./scenarios";
import { TRADES } from "./scenarios";

/**
 * The hero, DESIGN.md §6 and §7.
 *
 * An evening at a one-person business, played out: the phone answers two
 * enquiries while the owner is working, and each booking is carried into the
 * diary by the second pair of hands. Then it stops and invites you to type,
 * and what you type goes to the real assistant.
 *
 * Four trades, one object each in scenarios.ts, copied from the pack.
 *
 * Two things the reference does that this deliberately does not:
 *
 * The reference positions the hand with numbers — rowY(i) = 212 + i*52, and
 * the keyboard at translate(1024px, 788px). That works because it is one fixed
 * 1440x900 artboard. Here the diary reflows, so every position is measured off
 * the real element with getBoundingClientRect and the hand is told where things
 * actually are. The brief asks for this explicitly.
 *
 * And it runs on timers alone. This checks prefers-reduced-motion and coarse
 * pointers first, because a hand that chases a cursor is a delight on a laptop
 * and a smear on a phone.
 */

/** The stages of the scripted run. Named so the render does not read as arithmetic. */
const S = {
  START: 0,
  TYPING_1: 1,
  REPLY_1: 2,
  ASK_2: 3,
  TYPING_2: 4,
  REPLY_2: 5,
  ASK_3: 6,
  TYPING_3: 7,
  REPLY_3: 8,
  CARD_1: 9,
  SWIPE_1: 10,
  LANDED_1: 11,
  BANNER: 12,
  TYPING_4: 13,
  REPLY_4: 14,
  ASK_5: 15,
  CARD_2: 16,
  SWIPE_2: 17,
  LANDED_2: 18,
  DONE: 19,
} as const;

/** Milliseconds from the start of the run. Straight from the reference. */
const SCRIPT: [number, number][] = [
  [900, S.TYPING_1], [2600, S.REPLY_1], [4000, S.ASK_2], [4800, S.TYPING_2],
  [7200, S.REPLY_2], [8800, S.ASK_3], [9500, S.TYPING_3], [11600, S.REPLY_3],
  [13000, S.CARD_1], [13800, S.SWIPE_1], [15400, S.LANDED_1], [16000, S.BANNER],
  [16900, S.TYPING_4], [18600, S.REPLY_4], [19800, S.ASK_5], [20600, S.CARD_2],
  [21400, S.SWIPE_2], [23000, S.LANDED_2], [23800, S.DONE],
];

/** Which stages increment the tally, and to what. */
const TALLY_AT: Record<number, number> = {
  [S.REPLY_1]: 1, [S.REPLY_2]: 2, [S.REPLY_3]: 3, [S.REPLY_4]: 4, [S.DONE]: 5,
};

type HandMode = "idle" | "type" | "hold" | "swipe" | "point";

/**
 * The pair holding the phone: yours, and the second one.
 *
 * Sat behind the phone rather than over it, so the cupped fingers show at its
 * edges and the screen is never covered. That is also what keeps them inside
 * the viewport on a phone — a hand hung off the left at a negative offset is
 * a horizontal scrollbar on a 390px screen, which the edge checker fails.
 *
 * The lg offsets are small on purpose. At -left-40 the cream hand sat across
 * "PAIR OF HANDS." in the headline, and at -right-28 the cobalt one ran off
 * the right of a 1024px window. Both now hug the phone the way they do on a
 * narrow screen, only larger.
 *
 * Offsets are from the top of the column in pixels, not percentages: the
 * column is the phone plus the diary under it, so "34%" put a hand a third of
 * the way down both and left it below the fold on a phone.
 *
 * px/py are how far each drifts with the cursor. Different per hand, because
 * two things moving the same distance read as one thing.
 */
const HOLDING = [
  {
    src: "/brand/hands/hand-front.webp",
    place: "-left-1 top-24 w-[108px] lg:-left-12 lg:top-28 lg:w-[186px]",
    keyframes: "sp-hold-a",
    seconds: 6.5,
    px: 32,
    py: 20,
  },
  {
    src: "/brand/hands/hand-second.webp",
    place: "-right-1 top-64 w-[104px] lg:-right-6 lg:top-64 lg:w-[176px]",
    keyframes: "sp-hold-b",
    seconds: 7.9,
    px: -24,
    py: -14,
  },
];

export function Hero() {
  const [trade, setTrade] = useState<TradeKey>("tattoo");
  const [stage, setStage] = useState<number>(S.START);
  const [len, setLen] = useState(0);
  const [tally, setTally] = useState(0);
  const [sound, setSound] = useState(false);
  /*
   * Null until the browser has it.
   *
   * §6.7 wants the visitor's own local time, and the server has no idea what
   * that is: it renders one time, the browser renders another, and React
   * throws a hydration mismatch — error #418, which is what the public-page
   * check caught on every viewport before this shipped.
   *
   * So the clock is blank for one frame and then correct, rather than
   * confidently wrong and then corrected.
   */
  const [now, setNow] = useState<number | null>(null);

  /* What the visitor has typed, and what came back from the real assistant. */
  const [draft, setDraft] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  /* Where the hand is, in page pixels, and whether to draw it at all. */
  const [hand, setHand] = useState<{ x: number; y: number; mode: HandMode } | null>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  const timers = useRef<number[]>([]);
  const typer = useRef<number | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const phoneRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const diaryRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const threadRef = useRef<HTMLDivElement | null>(null);
  /*
   * The hand is positioned inside this, not on the page.
   *
   * Everything it points at is measured with getBoundingClientRect, which is
   * viewport-relative, and the hand is an absolutely positioned child of this
   * wrapper. Adding window.scroll to one and not subtracting the wrapper's own
   * offset from the other put it eighty pixels low and over the diary while
   * the assistant was supposed to be typing on the phone.
   */
  const stageRef = useRef<HTMLDivElement | null>(null);

  const sc = SCEN[trade];

  /*
   * What the visitor's machine is willing to do.
   *
   * Read once and kept, because both answers change what is built rather than
   * only how it moves: with reduced motion there is no hand at all, and on a
   * coarse pointer there is nothing for it to follow.
   */
  /*
   * Read through useSyncExternalStore rather than set from an effect.
   *
   * Both answers change what gets built rather than only how it moves, so they
   * have to be right on the first render: with reduced motion there is no hand
   * at all, and on a coarse pointer there is nothing for it to follow. Setting
   * them in an effect means one render with the wrong answer and a second to
   * correct it, which is exactly the cascade the compiler warns about.
   *
   * The server has no matchMedia, so its snapshot is "no": a hand that appears
   * after hydration is right, and one that is server-rendered and then removed
   * is a flash of something the visitor asked not to see.
   */
  const calm = useMedia("(prefers-reduced-motion: reduce)");
  const touch = useMedia("(pointer: coarse)");

  /*
   * The toggle is remembered, §6.6, and read after paint.
   *
   * Sound is off for everybody on the first frame, which is the only safe
   * default: a page that makes a noise before it has been asked is worse than
   * one that takes a frame to remember it was allowed to.
   */
  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      try {
        setSound(window.localStorage.getItem("sp-sound") === "on");
      } catch {
        /* A private window refuses storage. The toggle still works for this visit. */
      }
    });
    return () => window.cancelAnimationFrame(id);
  }, []);

  const toggleSound = useCallback(() => {
    setSound((was) => {
      const next = !was;
      try {
        window.localStorage.setItem("sp-sound", next ? "on" : "off");
      } catch {
        /* Nothing to do: it simply will not be remembered. */
      }
      return next;
    });
  }, []);

  /** 880Hz on a reply, 320Hz when a booking lands. §6.6. */
  const blip = useCallback(
    (st: number) => {
      if (!sound) return;
      try {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        audio.current = audio.current ?? new AC();
        const ctx = audio.current;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = st === S.LANDED_1 || st === S.LANDED_2 ? 320 : 880;
        gain.gain.value = 0.08;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.06);
      } catch {
        /* Audio is a nicety. Never let it break the page. */
      }
    },
    [sound],
  );

  /** The assistant's reply at this stage, for the typewriter. */
  const draftFor = useCallback(
    (st: number) =>
      st === S.TYPING_1 ? sc.a1 : st === S.TYPING_2 ? sc.a2 : st === S.TYPING_3 ? sc.a3 : st === S.TYPING_4 ? sc.a4 : "",
    [sc],
  );

  const clearAll = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    if (typer.current) {
      window.clearInterval(typer.current);
      typer.current = null;
    }
  }, []);

  /** Play the whole thing from the top. */
  const begin = useCallback(() => {
    clearAll();
    setStage(S.START);
    setTally(0);
    setLen(0);
    setSent(null);
    setAnswer(null);
    setRefused(null);

    for (const [ms, st] of SCRIPT) {
      timers.current.push(
        window.setTimeout(() => {
          setStage(st);
          setLen(0);
          if (TALLY_AT[st]) setTally(TALLY_AT[st]);
          blip(st);

          /*
           * Reduced motion gets the whole line at once. §6: replace movement
           * with fades, and a character-by-character typewriter is movement.
           */
          const text = draftFor(st);
          if (!text) return;
          if (calm) {
            setLen(text.length);
            return;
          }
          let n = 0;
          typer.current = window.setInterval(() => {
            n += 1;
            setLen(n);
            if (n >= text.length && typer.current) {
              window.clearInterval(typer.current);
              typer.current = null;
            }
          }, 34);
        }, ms),
      );
    }
  }, [blip, calm, clearAll, draftFor]);

  useEffect(() => {
    /* After paint: begin() resets several pieces of state and doing that
       synchronously inside an effect is a second render before the first has
       been seen. */
    const id = window.requestAnimationFrame(begin);
    return () => {
      window.cancelAnimationFrame(id);
      clearAll();
    };
  }, [begin, clearAll]);

  /* The clock only needs to be right to the minute. */
  useEffect(() => {
    const id = window.requestAnimationFrame(() => setNow(Date.now()));
    const t = window.setInterval(() => setNow(Date.now()), 15000);
    return () => {
      window.cancelAnimationFrame(id);
      window.clearInterval(t);
    };
  }, []);

  /*
   * Where the hand should be, measured rather than assumed.
   *
   * Everything it points at is a real element on the page, so it is asked
   * where it is. Run after paint and on resize, because a diary row that has
   * reflowed is in a different place and a hand that remembers the old one is
   * pointing at nothing.
   */
  const place = useCallback(() => {
    if (calm) {
      setHand(null);
      return;
    }

    const typing = stage === S.TYPING_1 || stage === S.TYPING_2 || stage === S.TYPING_3 || stage === S.TYPING_4 || waiting;
    const holding = stage === S.CARD_1 || stage === S.CARD_2;
    const swiping = stage === S.SWIPE_1 || stage === S.SWIPE_2;
    const landed = stage === S.LANDED_1 || stage === S.LANDED_2;

    const frame = stageRef.current?.getBoundingClientRect();
    if (!frame) return;
    /* Viewport rect to a position inside the wrapper the hand lives in. */
    const box = (el: Element | null) => {
      const r = el?.getBoundingClientRect();
      return r ? { left: r.left - frame.left, top: r.top - frame.top, width: r.width, height: r.height, right: r.right - frame.left } : null;
    };


    if (typing) {
      const r = box(inputRef.current);
      if (!r) return;
      /*
       * It travels along the input as the words appear, and bobs.
       *
       * This is what the reference does — 744 + shown.length * 6.6, with a 3px
       * bob on alternate characters — and it is the thing that makes the finger
       * look like it is doing the typing rather than hovering near it.
       *
       * An earlier version of this froze the renderer, and the traverse got the
       * blame. It was not the traverse. A character lands every 34ms and the
       * transition was 0.7s ease, so every frame restarted a long eased
       * animation that never once finished, under a full-viewport blended
       * grain. The reference sets .type to 0.12s linear for exactly this, and
       * at that length each step completes before the next arrives. React was
       * already re-rendering on every character anyway, because the bubble text
       * is derived from the same count, so the transform costs nothing extra.
       */
      const travel = Math.min(len * 6.6, Math.max(0, r.width - 72));
      setHand({
        x: r.left + 24 + travel,
        y: r.top + r.height * 0.5 + (len % 2 ? 3 : 0),
        mode: "type",
      });
      return;
    }

    if (holding || swiping || landed) {
      const which = stage === S.CARD_2 || stage === S.SWIPE_2 || stage === S.LANDED_2 ? sc.d2 : sc.d1;
      const target = swiping || landed ? box(rowRefs.current[which]) : box(threadRef.current);
      if (!target) return;
      setHand({
        x: target.left + 28,
        y: target.top + target.height * 0.5,
        mode: swiping ? "swipe" : "hold",
      });
      return;
    }

    setHand((was) => (was ? { ...was, mode: "idle" } : was));
  }, [calm, len, sc.d1, sc.d2, stage, waiting]);

  useEffect(() => {
    /* A frame later, so the rects are the ones just painted rather than the
       ones from before this stage rendered. */
    const id = window.requestAnimationFrame(place);
    return () => window.cancelAnimationFrame(id);
  }, [place]);

  useEffect(() => {
    const onResize = () => place();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [place]);

  /*
   * Parallax and follow, §6.1 and §6.2.
   *
   * Both are off on a coarse pointer and under reduced motion. The hand only
   * appears after the first real mouse move, so it never arrives unasked.
   */
  const onMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (calm || touch) return;
      const r = e.currentTarget.getBoundingClientRect();
      setTilt({ x: (e.clientX - r.left) / r.width - 0.5, y: (e.clientY - r.top) / r.height - 0.5 });

      const busy = stage !== S.DONE && stage !== S.START;
      if (busy || waiting) return;
      const frame = stageRef.current?.getBoundingClientRect();
      if (!frame) return;
      /* +20/+30 so it never covers the cursor, §6.2. */
      setHand({ x: e.clientX - frame.left + 20, y: e.clientY - frame.top + 30, mode: "idle" });
    },
    [calm, stage, touch, waiting],
  );

  /** Send what the visitor typed to the real assistant. §7. */
  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || waiting) return;
    clearAll();
    setStage(S.DONE);
    setSent(text);
    setDraft("");
    setAnswer(null);
    setRefused(null);
    setWaiting(true);

    try {
      const res = await fetch("/api/widget/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studio: "help", session: sessionKey(), message: text }),
      });
      const body = (await res.json().catch(() => ({}))) as { reply?: string; error?: string };
      if (body.reply) {
        setAnswer(body.reply);
        setTally((t) => t + 1);
        blip(S.REPLY_1);
      } else {
        /*
         * The endpoint refuses in words rather than throwing: "Slow down" when
         * somebody has sent too many. Said plainly rather than swallowed.
         */
        setRefused(body.error === "Slow down" ? "That is a lot of messages at once. Give it a moment." : "That did not get through. Try again in a moment.");
      }
    } catch {
      setRefused("That did not get through. Try again in a moment.");
    } finally {
      setWaiting(false);
    }
  }, [blip, clearAll, draft, waiting]);

  const clock = useMemo(() => {
    if (now === null) return null;
    const d = new Date(now);
    const h = d.getHours();
    const m = d.getMinutes();
    return {
      time: `${((h + 11) % 12) + 1}:${m < 10 ? "0" : ""}${m}${h < 12 ? "am" : "pm"}`,
      night: h >= 18 || h < 7,
    };
  }, [now]);

  const typingNow =
    stage === S.TYPING_1 || stage === S.TYPING_2 || stage === S.TYPING_3 || stage === S.TYPING_4;
  const shown = typingNow ? draftFor(stage).slice(0, len) : "";

  const tiltUsed = calm || touch ? { x: 0, y: 0 } : tilt;

  /* What is in the thread by now. Each line appears at its stage and stays. */
  const said: { who: "them" | "us"; text: string; at: number }[] = [
    { who: "them", text: sc.c1, at: S.START },
    { who: "us", text: sc.a1, at: S.REPLY_1 },
    { who: "them", text: sc.c2, at: S.ASK_2 },
    { who: "us", text: sc.a2, at: S.REPLY_2 },
    { who: "them", text: sc.c3, at: S.ASK_3 },
    { who: "us", text: sc.a3, at: S.REPLY_3 },
    { who: "us", text: sc.a4, at: S.REPLY_4 },
    { who: "them", text: sc.c5, at: S.ASK_5 },
  ];

  const bookedRow = (i: number) =>
    (stage >= S.LANDED_1 && i === sc.d1) || (stage >= S.LANDED_2 && i === sc.d2);

  const rowLabel = (i: number) =>
    stage >= S.LANDED_2 && i === sc.d2 ? sc.r2 : stage >= S.LANDED_1 && i === sc.d1 ? sc.r1 : sc.rows[i] ?? "";

  const rowTag = (i: number) =>
    stage >= S.LANDED_2 && i === sc.d2 ? sc.r2s : stage >= S.LANDED_1 && i === sc.d1 ? sc.r1s : "";

  return (
    <div ref={stageRef} className="relative" onMouseMove={onMove} onMouseLeave={() => setTilt({ x: 0, y: 0 })}>
    {/*
      * Three blocks on a phone, two columns from lg.
      *
      * On a phone the phone-shaped thing this hero is built around started at
      * y=992 on an 844px screen: the headline, the sub, both buttons and the
      * clock came first, so the demo was entirely below the fold and nobody
      * scrolling past ever saw it move. The order is now headline, the demo,
      * then the supporting copy.
      *
      * display:contents on the left wrapper lets its two halves become
      * orderable siblings of the right column without moving them in the
      * markup, so the reading order for a screen reader is unchanged.
      */}
    <div className="mx-auto flex max-w-6xl flex-col gap-10 px-5 py-14 sm:px-8 lg:grid lg:grid-cols-[1fr_minmax(0,560px)] lg:items-start lg:gap-8 lg:py-8">
      {/* ------------------------------------------------------------ left */}
      <div className="contents lg:relative lg:z-10 lg:block">
      <div className="relative z-10 order-1 lg:order-none">
        {/* "Show me a", §7. */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] uppercase tracking-[0.06em] text-muted">Show me a</span>
          {TRADES.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTrade(t.key)}
              aria-pressed={trade === t.key}
              className="px-2.5 py-1 text-[13px] uppercase tracking-[0.06em] transition-colors"
              style={{
                border: "2px solid var(--foreground)",
                borderRadius: 6,
                background: trade === t.key ? "var(--foreground)" : "transparent",
                color: trade === t.key ? "var(--background)" : "var(--foreground)",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/*
          * The headline, §8: stacked, one phrase per line, never centred.
          * Putty on the fifth line and cobalt on the last, which is the one
          * place §2 allows an accent line in a headline.
          */}
        <h1
          className="mt-6"
          style={{
            fontFamily: "var(--font-display), Impact, sans-serif",
            textTransform: "uppercase",
            lineHeight: 0.94,
            letterSpacing: "0.01em",
            fontSize: "clamp(52px, 7vw, 96px)",
          }}
        >
          <span className="block">You&rsquo;ve only</span>
          <span className="block">got one</span>
          <span className="block">pair of</span>
          <span className="block">hands.</span>
          <span className="block" style={{ color: "var(--putty)" }}>
            We&rsquo;re the
          </span>
          <span className="block" style={{ color: "var(--accent)" }}>
            second.
          </span>
        </h1>

      </div>

      {/* The supporting half: below the demo on a phone, under the headline from lg. */}
      <div className="relative z-10 order-3 lg:order-none">
        <p className="max-w-[60ch] text-[19px] leading-relaxed lg:mt-7">
          The assistant answers your customers and sorts your bookings while you work.
          When you need a website or an app, we build that too. Pick a trade on the right
          and watch a real evening play out.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-5">
          <a href="/home#ask" className="btn-primary" style={{ minHeight: 62, fontSize: "20px" }}>
            Book a 15 minute chat
          </a>
          <button type="button" onClick={begin} className="btn-text">
            Play it again
          </button>
        </div>

        {/* Clock and tally, §6.7 and §6.8. */}
        <div className="mt-10 flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <span
            style={{
              fontFamily: "var(--font-display), Impact, sans-serif",
              fontSize: 40,
              lineHeight: 1,
            }}
          >
            {clock ? clock.time : " "}
          </span>
          <span className="max-w-[40ch] text-sm text-muted">
            {clock
              ? clock.night
                ? "That’s your clock. You’ve knocked off. This is us, still answering."
                : "That’s your clock. You’re on the tools. This is us, on the phone."
              : ""}
          </span>
        </div>

        <p className="mt-3 text-sm text-muted">
          <strong className="text-foreground">{tally}</strong> messages answered while
          you&rsquo;ve been on this page.
          <button type="button" onClick={toggleSound} className="ml-3 underline underline-offset-4">
            {sound ? "Sound on" : "Sound off"}
          </button>
        </p>
      </div>

      </div>

      {/* ----------------------------------------------------------- right */}
      <div className="relative order-2 lg:order-none">
        {/*
          * The pair, holding the phone. §6.1.
          *
          * Two hands rather than one, because the second one is the product:
          * yours in skin and ours in cobalt, both on the phone. hand-second
          * has been in the repository since the first pack and had never been
          * put on a page.
          *
          * They are here at every width. Before this they were xl:block, so
          * the one thing the hero is named after was absent on every phone and
          * most laptops — and they moved only with the cursor, so even where
          * they showed on a tablet they were perfectly still.
          *
          * Two nested elements each: the wrapper takes the cursor parallax,
          * the image runs the idle breathing on its own. One element cannot do
          * both, because they are the same CSS property.
          *
          * Decorative, so hidden from a screen reader and never the only place
          * anything is said.
          */}
        {HOLDING.map((h) => (
          <span
            key={h.src}
            aria-hidden
            className={`pointer-events-none absolute select-none ${h.place}`}
            style={{
              transform: `translate(${tiltUsed.x * h.px}px, ${tiltUsed.y * h.py}px)`,
              transition: "transform 0.5s ease-out",
              /*
               * In front of the phone. They overlap its edges by about forty
               * pixels either side, and behind it that overlap was invisible —
               * which is why they read as two hands near a phone rather than a
               * pair holding one. Only the bezel and a sliver of screen is
               * covered; the thread sits inboard of it.
               */
              zIndex: 20,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={h.src}
              alt=""
              className="w-full select-none"
              style={{
                animation: `${h.keyframes} ${h.seconds}s ease-in-out infinite`,
                opacity: 0.95,
              }}
            />
          </span>
        ))}

        <div className="relative z-10 flex flex-col gap-3">
          {/* --------------------------------------------------- the phone */}
          <div
            ref={phoneRef}
            /*
             * Narrower on a phone so the pair behind it can be seen holding it.
             * At the full column width the phone covered both hands completely
             * and the hero was named after something invisible.
             */
            className="mx-auto w-full max-w-[258px] sm:max-w-[300px]"
            /*
             * A moulded object rather than a black rectangle.
             *
             * The new pack is rendered in 3D — the bubble mark and both hands
             * have real depth — and a flat slab of ink between two photographed
             * hands looked like a hole in the page rather than a thing being
             * held. So the bezel is lit: a gradient across it, a highlight along
             * the top edge where the light is, a darker rim at the bottom, and
             * two shadows instead of one — a tight contact shadow where it meets
             * the page and a wide soft one for the distance off it.
             *
             * All of it in the ink from §2. Depth from light, not from new
             * colours, which the pack's rules rule out.
             */
            style={{
              background:
                "linear-gradient(158deg, #34322a 0%, #1c1b14 32%, #16150f 62%, #0b0a06 100%)",
              borderRadius: 44,
              padding: 13,
              boxShadow: [
                "inset 0 1.5px 0 rgba(247,244,236,0.22)",
                "inset 0 -2px 2px rgba(0,0,0,0.55)",
                "inset 2px 0 2px rgba(0,0,0,0.35)",
                "inset -2px 0 2px rgba(0,0,0,0.35)",
                "0 2px 4px rgba(22,21,15,0.4)",
                "0 18px 30px -12px rgba(22,21,15,0.45)",
                "0 40px 60px -30px rgba(22,21,15,0.55)",
              ].join(", "),
            }}
          >
            <div
              /*
               * 440 rather than 560. The diary underneath is the payoff of the
               * whole run — the booking card is swiped into it — and at the old
               * height only 51px of a 312px panel was above the fold on a
               * 1280x844 screen, so almost nobody saw where the card landed.
               */
              className="flex h-[400px] flex-col overflow-hidden sm:h-[420px]"
              style={{
                background: "var(--surface)",
                borderRadius: 32,
                /* The screen sits down inside the bezel rather than on top of it. */
                boxShadow: "inset 0 2px 5px rgba(0,0,0,0.35), 0 0 0 1px rgba(0,0,0,0.5)",
              }}
            >
              {/*
                * The status bar, and the island above it.
                *
                * A tall rounded rectangle is not a phone until it has these:
                * the clock top left, the signal, wifi and battery top right,
                * and the island cut out of the middle. Giles asked for it to
                * read as a phone and this is most of what does it.
                *
                * The clock is the visitor's own, the same one the hero prints
                * under the headline, so the phone agrees with the page.
                */}
              <div className="relative flex shrink-0 items-center justify-between px-5 pb-1 pt-2.5">
                <span
                  className="text-[11px] font-semibold tabular-nums"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {clock ? clock.time.replace(/(am|pm)$/, "") : ""}
                </span>
                <span
                  aria-hidden
                  className="absolute left-1/2 top-1.5 h-[18px] w-[62px] -translate-x-1/2"
                  style={{ background: "#0b0a06", borderRadius: 999 }}
                />
                <span aria-hidden className="flex items-center gap-1">
                  {/* Signal, as four rising bars. */}
                  <span className="flex items-end gap-[1.5px]">
                    {[4, 6, 8, 10].map((h) => (
                      <span
                        key={h}
                        style={{
                          width: 2.5,
                          height: h,
                          borderRadius: 1,
                          background: "var(--foreground)",
                          display: "block",
                        }}
                      />
                    ))}
                  </span>
                  {/* Battery. */}
                  <span
                    className="relative ml-0.5 block"
                    style={{
                      width: 18,
                      height: 9.5,
                      borderRadius: 2.5,
                      border: "1px solid var(--foreground)",
                      opacity: 0.75,
                    }}
                  >
                    <span
                      className="absolute left-[1.5px] top-[1.5px] block"
                      style={{
                        width: 11,
                        height: 5.5,
                        borderRadius: 1,
                        background: "var(--foreground)",
                      }}
                    />
                  </span>
                </span>
              </div>

              {/* Who it is and what they are doing instead of answering. */}
              <div
                className="flex shrink-0 items-center gap-2.5 px-4 py-2.5"
                style={{ borderBottom: "1px solid var(--line)" }}
              >
                <span
                  className="grid size-9 shrink-0 place-items-center rounded-full text-[13px]"
                  style={{ background: "var(--accent)", color: "var(--on-accent)" }}
                >
                  {sc.ini}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{sc.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {sc.ch} &middot; {sc.doing}
                  </span>
                </span>
              </div>

              {/* The thread. */}
              {/*
                * Anchored to the bottom, the way a real thread is.
                *
                * The messages stack from the top, so once there are more of
                * them than the screen holds the newest one is pushed off the
                * end — and the newest is the only one that matters, because it
                * is the one just written. justify-end keeps the latest against
                * the composer and lets the oldest scroll up out of sight, which
                * is what every messaging app does. It only started showing when
                * the screen got shorter to bring the diary up.
                */}
              <div
                ref={threadRef}
                className="flex flex-1 flex-col justify-end space-y-2.5 overflow-hidden px-4 py-3"
              >
                {said
                  .filter((m) => stage >= m.at && m.text)
                  .map((m, i) => (
                    <div key={i} className={m.who === "us" ? "text-right" : ""}>
                      <span className={`bubble ${m.who === "us" ? "bubble-us" : "bubble-them"}`}>
                        {m.text}
                      </span>
                    </div>
                  ))}

                {typingNow && (
                  <div className="text-right">
                    <span className="bubble bubble-us">{shown}</span>
                  </div>
                )}

                {stage >= S.BANNER && stage < S.REPLY_4 && (
                  <div
                    className="px-2.5 py-2 text-xs"
                    style={{ background: "var(--surface-2)", borderRadius: 8 }}
                  >
                    <strong>New &middot; {sc.ban}:</strong> &ldquo;{sc.banq}&rdquo;
                  </div>
                )}

                {/* What the visitor typed, and what the real assistant said. */}
                {sent && (
                  <div className="text-right">
                    <span className="bubble bubble-them">{sent}</span>
                  </div>
                )}
                {waiting && <p className="text-xs text-muted">Typing&hellip;</p>}
                {answer && (
                  <div>
                    <span className="bubble bubble-us">{answer}</span>
                  </div>
                )}
                {refused && <p className="text-xs text-muted">{refused}</p>}

                {/* The card, before the hand takes it. */}
                {(stage === S.CARD_1 || stage === S.CARD_2) && (
                  <div className="booking-card">
                    <span className="booking-when">
                      <span className="block text-xs">
                        {stage === S.CARD_2 ? sc.k2d : sc.k1d}
                      </span>
                      <span className="block text-lg">
                        {stage === S.CARD_2 ? sc.k2t : sc.k1t}
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {stage === S.CARD_2 ? sc.k2 : sc.k1}
                      </span>
                      <span className="block text-xs text-muted">
                        {stage === S.CARD_2 ? sc.k2s : sc.k1s}
                      </span>
                    </span>
                  </div>
                )}
              </div>

              {/* A real input, §7. */}
              <div
                className="flex items-center gap-2 px-3 py-3"
                style={{ borderTop: "1px solid var(--line)" }}
              >
                <input
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") send();
                  }}
                  placeholder="Ask it something"
                  aria-label="Ask the assistant something"
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                />
                <button
                  type="button"
                  onClick={send}
                  disabled={waiting || !draft.trim()}
                  className="btn-primary shrink-0 px-3"
                  style={{ minHeight: 36, fontSize: 13 }}
                >
                  Send
                </button>
              </div>
              {/* The home indicator. The last thing that says "phone". */}
              <span
                aria-hidden
                className="mx-auto mb-1.5 mt-1 block shrink-0"
                style={{ width: 96, height: 4, borderRadius: 999, background: "var(--foreground)", opacity: 0.22 }}
              />
            </div>
          </div>

          {/* --------------------------------------------------- the diary */}
          <div
            ref={diaryRef}
            /*
              * The diary the app actually has, not a ruled notepad.
              *
              * Giles: it should look like the diary in the system. The app's
              * list is a hairline panel of white rows, each with a 3px coloured
              * rule down its left edge, the time in a right-aligned tabular
              * column, and status as a tinted pill — see DayList.tsx. This had
              * a 2px ink keyline, a 6px offset slab, ruled-paper stripes and
              * solid cobalt fills on the booked rows, none of which the product
              * does anywhere.
              */
            className="p-3"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 12,
            }}
          >
            {/*
              * The header the app's diary has: the title in Anton on the left
              * and what it adds up to on the right, which is the line the
              * product prints above every diary screen.
              */}
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <p
                className="text-xs uppercase tracking-[0.06em]"
                style={{ fontFamily: "var(--font-display), Impact, sans-serif" }}
              >
                This week&rsquo;s diary
              </p>
              <p className="text-[11px] tabular-nums text-muted">
                {sc.rows.filter((_, i) => rowLabel(i)).length} booked
              </p>
            </div>

            {/*
              * A time grid, not a list of cards.
              *
              * The diary in the product is an hour gutter down the left, a
              * hairline rule between every hour, and appointments as tinted
              * blocks with a colour rule on their leading edge — free time is
              * empty space rather than a box saying "Free". This is that, one
              * column wide.
              */}
            <div style={{ borderTop: "1px solid var(--border)" }}>
              {sc.rows.map((_, i) => (
                <div
                  key={i}
                  ref={(el) => {
                    rowRefs.current[i] = el;
                  }}
                  className="flex h-[38px] items-stretch text-sm"
                  style={{ borderBottom: "1px solid var(--border)" }}
                >
                  {rowLabel(i) ? (
                    <span
                      className="my-[3px] flex min-w-0 flex-1 items-center gap-2 rounded-[5px] px-2.5"
                      style={{
                        borderLeft: `3px solid ${bookedRow(i) ? "var(--accent)" : "var(--cal-work)"}`,
                        background: bookedRow(i)
                          ? "color-mix(in srgb, var(--accent) 11%, var(--surface))"
                          : "color-mix(in srgb, var(--cal-work) 10%, var(--surface))",
                      }}
                    >
                      {splitTime(rowLabel(i))[0] && (
                        <span className="shrink-0 text-[12px] font-semibold tabular-nums text-muted">
                          {splitTime(rowLabel(i))[0]}
                        </span>
                      )}
                      <span className="min-w-0 flex-1 truncate">{splitTime(rowLabel(i))[1]}</span>
                      {rowTag(i) && (
                        <span
                          className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em]"
                          style={
                            /deposit/i.test(rowTag(i))
                              ? { background: "color-mix(in srgb, var(--ok) 16%, transparent)", color: "var(--ok)" }
                              : { background: "color-mix(in srgb, var(--accent) 14%, transparent)", color: "var(--accent)" }
                          }
                        >
                          {rowTag(i)}
                        </span>
                      )}
                    </span>
                  ) : (
                    /* Free time is empty in the product, not a box that says so. */
                    <span className="ml-[3px] flex-1" />
                  )}
                </div>
              ))}
            </div>

            {stage >= S.DONE && <p className="mt-3 text-sm text-muted">{sc.done}</p>}
          </div>

          <p className="text-center text-xs text-muted">
            Demo. On your site this is your assistant.
          </p>
        </div>
      </div>

      {/*
        * The second pair, §6.2 to §6.5.
        *
        * Fixed to the page rather than to the phone, because it travels between
        * the two: it types in the input, picks the card out of the thread and
        * carries it into a diary row. Absent entirely under reduced motion.
        */}
      {hand && !calm && (
        <span
          aria-hidden
          className="pointer-events-none absolute block"
          style={{
            left: 0,
            top: 0,
            /*
             * Two elements, because a translate that travels and a tap that
             * loops cannot share one transform property. The outer one goes
             * where it is told; the inner one taps where it stands.
             */
            transform: `translate(${hand.x - 14}px, ${hand.y - 16}px)`,
            /*
             * Short and linear while typing, which is what makes the traverse
             * possible at all: a character lands every 34ms, so a 0.7s eased
             * transition never finishes and every frame restarts it. The
             * reference sets .type to .12s linear for the same reason.
             */
            transition:
              hand.mode === "swipe"
                ? "transform 1.6s ease"
                : hand.mode === "type"
                  ? "transform 0.12s linear"
                  : "transform 0.7s ease",
            zIndex: 40,
            willChange: "transform",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/hands/hand-point.webp"
            alt=""
            className="w-[92px] select-none sm:w-[130px]"
            style={{
              /* The fingertip sits about 14,16 into the artwork, §6. */
              transform: "rotate(-10deg)",
              animation: hand.mode === "type" ? "sp-tap 0.28s ease-in-out infinite" : undefined,
            }}
          />
        </span>
      )}
    </div>
    </div>
  );
}

/**
 * "11am Fine line" -> ["11am", "Fine line"]; anything without a leading time
 * gets an empty first half so the column still lines up.
 */
function splitTime(label: string): [string, string] {
  const m = /^(\d{1,2}(?::\d{2})?\s*(?:am|pm))\s+(.*)$/i.exec(label.trim());
  return m ? [m[1], m[2]] : ["", label];
}

/**
 * A media query as a value, without a render to correct itself.
 *
 * getServerSnapshot answers "no" on purpose: the server cannot know, and the
 * two things this gates are both movement. Arriving still and then moving is
 * right; arriving in motion and then stopping is the thing somebody who asked
 * for reduced motion is trying to avoid.
 */
function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", onChange);
      return () => m.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** A session key the rate limiter and the tidy-up scripts can recognise. */
function sessionKey(): string {
  const KEY = "sp-hero-session";
  try {
    const had = window.sessionStorage.getItem(KEY);
    if (had) return had;
    const made = "hero" + Math.random().toString(36).slice(2, 14) + "abcdefgh";
    window.sessionStorage.setItem(KEY, made);
    return made;
  } catch {
    return "hero" + Math.random().toString(36).slice(2, 14) + "abcdefgh";
  }
}

