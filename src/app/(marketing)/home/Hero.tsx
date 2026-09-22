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

export function Hero() {
  const [trade, setTrade] = useState<TradeKey>("tattoo");
  const [stage, setStage] = useState<number>(S.START);
  const [len, setLen] = useState(0);
  const [tally, setTally] = useState(0);
  const [sound, setSound] = useState(false);
  const [now, setNow] = useState(() => Date.now());

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
    const t = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(t);
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
       * Placed once, then it taps where it stands.
       *
       * The first version moved it a few pixels along the input for every
       * character, which is 34ms apart — a new transform with a 0.7s
       * transition thirty times a second, under a full-viewport blended grain.
       * The compositor could not keep up and the tab stopped answering
       * screenshots; a visitor would have felt it as the whole page going
       * treacly while the assistant "typed".
       *
       * §6.3 asks for a tap, not a traverse. So it sits at the near end of the
       * input and the tap is a CSS loop, which the compositor runs on its own
       * without React in the way.
       */
      setHand({ x: r.left + 24, y: r.top + r.height * 0.5, mode: "type" });
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
  }, [calm, sc.d1, sc.d2, stage, waiting]);

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
    <div className="mx-auto grid max-w-6xl items-start gap-10 px-5 py-14 sm:px-8 lg:grid-cols-[1fr_minmax(0,560px)] lg:py-20">
      {/* ------------------------------------------------------------ left */}
      <div className="relative z-10">
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

        <p className="mt-7 max-w-[60ch] text-[19px] leading-relaxed">
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
            {clock.time}
          </span>
          <span className="max-w-[40ch] text-sm text-muted">
            {clock.night
              ? "That’s your clock. You’ve knocked off. This is us, still answering."
              : "That’s your clock. You’re on the tools. This is us, on the phone."}
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

      {/* ----------------------------------------------------------- right */}
      <div className="relative">
        {/*
          * The front hand, §6.1. Decorative, so it is hidden from a screen
          * reader and never carries meaning on its own.
          */}
        {!calm && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src="/brand/hands/hand-front.webp"
            alt=""
            aria-hidden
            className="pointer-events-none absolute -left-52 top-24 hidden w-[260px] select-none opacity-95 xl:block"
            style={{
              transform: `translate(${tiltUsed.x * 32}px, ${tiltUsed.y * 20}px) rotate(${tiltUsed.x * 2}deg)`,
              transition: "transform 0.5s ease-out",
              zIndex: 0,
            }}
          />
        )}

        <div className="relative z-10 flex flex-col gap-6">
          {/* --------------------------------------------------- the phone */}
          <div
            ref={phoneRef}
            className="mx-auto w-full max-w-[360px]"
            style={{
              background: "var(--foreground)",
              borderRadius: 42,
              padding: 12,
              boxShadow: "var(--shadow-pop)",
            }}
          >
            <div
              className="flex h-[560px] flex-col overflow-hidden"
              style={{ background: "#ffffff", borderRadius: 32 }}
            >
              {/* Who it is and what they are doing instead of answering. */}
              <div
                className="flex items-center gap-2.5 px-4 py-3"
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
              <div ref={threadRef} className="flex-1 space-y-2.5 overflow-hidden px-4 py-4">
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
            </div>
          </div>

          <p className="text-center text-xs text-muted">
            Demo. On your site this is your assistant.
          </p>

          {/* --------------------------------------------------- the diary */}
          <div
            ref={diaryRef}
            className="p-4"
            style={{
              background: "var(--surface-2)",
              border: "2px solid var(--foreground)",
              boxShadow: "var(--shadow-card)",
              backgroundImage:
                "repeating-linear-gradient(transparent 0 43px, rgba(22,21,15,0.06) 43px 44px)",
            }}
          >
            <p
              className="mb-2 text-xs uppercase tracking-[0.06em] text-muted"
              style={{ fontFamily: "var(--font-display), Impact, sans-serif" }}
            >
              This week
            </p>

            <div className="space-y-1">
              {sc.rows.map((_, i) => (
                <div
                  key={i}
                  ref={(el) => {
                    rowRefs.current[i] = el;
                  }}
                  className="flex h-11 items-center gap-2 px-2.5 text-sm"
                  style={
                    bookedRow(i)
                      ? { background: "var(--accent)", color: "var(--on-accent)" }
                      : rowLabel(i)
                        ? { color: "var(--foreground)" }
                        : { border: "1.5px dashed var(--putty)", color: "var(--muted)" }
                  }
                >
                  <span className="min-w-0 flex-1 truncate">{rowLabel(i) || "Free"}</span>
                  {rowTag(i) && (
                    <span
                      className="shrink-0 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.06em]"
                      style={{ background: "var(--on-accent)", color: "var(--accent)", borderRadius: 4 }}
                    >
                      {rowTag(i)}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {stage >= S.DONE && <p className="mt-3 text-sm text-muted">{sc.done}</p>}
          </div>
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
          className="pointer-events-none absolute hidden lg:block"
          style={{
            left: 0,
            top: 0,
            /*
             * Two elements, because a translate that travels and a tap that
             * loops cannot share one transform property. The outer one goes
             * where it is told; the inner one taps where it stands.
             */
            transform: `translate(${hand.x - 14}px, ${hand.y - 16}px)`,
            transition: hand.mode === "swipe" ? "transform 1.6s ease" : "transform 0.7s ease",
            zIndex: 40,
            willChange: "transform",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/hands/hand-point.webp"
            alt=""
            className="w-[130px] select-none"
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

