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

/**
 * How long each stage has before the next one starts.
 *
 * Straight off SCRIPT, so it cannot drift from it the way a second hand-written
 * table would.
 */
const nextAt = new Map<number, number>(
  SCRIPT.map(([ms, st], i) => [st, (SCRIPT[i + 1]?.[0] ?? ms + 1700) - ms]),
);

/**
 * What a visitor is offered to ask, once the demo has played.
 *
 * Questions, not claims: the assistant answers each from the settings it
 * actually has, so nothing here promises anything the product cannot do.
 */
const ASK_FIRST = ["What does it cost?", "Will it work for my trade?", "How long to set up?"];

/**
 * Where the fingertip sits across the trimmed hand artwork, as a fraction of
 * its width. Measured off the file after the background was cut out, not
 * guessed: 4.5% across, and level with the top edge.
 */
const TIP_X = 0.045;

/** The beat at the end of a line for the hand to reach Send and press it. */
const PRESS_BEAT = 620;

/** Which stages increment the tally, and to what. */
const TALLY_AT: Record<number, number> = {
  [S.REPLY_1]: 1, [S.REPLY_2]: 2, [S.REPLY_3]: 3, [S.REPLY_4]: 4, [S.DONE]: 5,
};

type HandMode = "idle" | "type" | "press" | "hold" | "swipe" | "point";

/**
 * The hand, at the reference's own geometry.
 *
 * Worth writing the numbers down, because every version before this was
 * guessed and every one was wrong. The reference is a fixed 1440x900 board:
 * the phone is 360x700 at (700,140) and the hand is the same 700x974 artwork
 * this repository already had, rendered at its natural width — no width
 * attribute, no CSS width — at translate(560,290) rotate(-14deg), z-index 5,
 * behind the phone at z-index 10.
 *
 * So the hand is 1.94 times the width of the phone, and the phone sits in the
 * middle of it. That is the whole trick, and it is why nothing I tried looked
 * right: I had been drawing a 190px hand beside a 258px phone, a third of the
 * size it should be, so it could only ever sit next to the device instead of
 * under it. Big enough, the phone lands on the palm, the fingers rise past its
 * left edge and the wrist runs out below — which is the wrap Giles described.
 *
 * Expressed against the phone so it holds at every width:
 *   width  1.94 x phone width
 *   left  -0.389 x phone width
 *   top    0.214 x phone height
 *
 * Not mirrored. I flipped it last time to get the fingers pointing at the
 * device; at the right size they already do.
 */
const HOLDING = [
  {
    src: "/brand/hands/hand-front.webp",
    place: "-left-[39%] top-[21%] w-[194%]",
    keyframes: "sp-hold-a",
    seconds: 6.5,
    px: 16,
    py: 10,
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
  /* The hand goes here when the sentence is finished, to press it. */
  const sendRef = useRef<HTMLButtonElement | null>(null);
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


  /**
   * The sentence a "Book a 15 minute chat" button sent them here with.
   *
   * Read once, during the first render rather than in an effect, because the
   * observer that starts the demo also runs on mount — and if it wins, it
   * resets the stage and wipes the typed line before anybody sees it. Knowing
   * this before any effect runs is what lets the demo stand down instead of
   * racing it.
   *
   * Empty on the server, and it changes nothing that is rendered on the first
   * pass, so there is nothing for hydration to disagree about.
   */
  const askedFor = useRef<string | null>(null);
  if (askedFor.current === null) {
    askedFor.current =
      typeof window === "undefined"
        ? ""
        : (() => {
            try {
              return new URLSearchParams(window.location.search).get("say") ?? "";
            } catch {
              /* A malformed query is not worth breaking the hero over. */
              return "";
            }
          })();
  }

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
   * How wide the hand is drawn, which the fingertip offset is a fraction of.
   * The two numbers are the two the class sets, and they have to agree — read
   * from the same media query Tailwind's sm: uses.
   */
  const handWidth = useMedia("(min-width: 640px)") ? 142 : 104;

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

      /*
       * The audio is made here, in the click, and that is the whole fix.
       *
       * Giles: it says sound on and off and there is no sound. It was true,
       * and the reason is a rule every browser enforces: an AudioContext
       * created outside a user gesture is born suspended, and a suspended
       * context plays nothing. It was being created lazily inside blip(),
       * which is called from the demo's timers — so it was always made by a
       * setTimeout and never by a person, and every note since this was
       * written has gone into a context that was never running.
       *
       * Nothing threw and nothing logged. The toggle said "Sound on" and the
       * page stayed silent, which is exactly the shape of bug that survives.
       *
       * Creating it in the handler is what makes it allowed. resume() as well,
       * because a context can also be suspended later — Safari does it when a
       * tab is backgrounded — and coming back to a silent page would look like
       * the same fault all over again.
       */
      if (next) {
        try {
          const AC =
            window.AudioContext ??
            (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          if (AC) {
            audio.current = audio.current ?? new AC();
            void audio.current.resume();
          }
        } catch {
          /* Audio is a nicety. Never let it break the page. */
        }
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

        /*
         * A context can be suspended after it was running — a backgrounded
         * tab, a device waking up. Resuming is cheap and returns a promise
         * nothing here waits on: this note is lost either way, and the next
         * one is what matters.
         */
        if (ctx.state === "suspended") void ctx.resume();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = st === S.LANDED_1 || st === S.LANDED_2 ? 320 : 880;
        /*
         * Faded rather than cut. A gain that stops dead puts a step in the
         * waveform, which is heard as a click — the note is 60ms, so the
         * click is a fair share of what somebody actually hears.
         */
        const now = ctx.currentTime;
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.08, now + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.07);
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
          /*
           * Paced to the gap, not a fixed 34ms a character.
           *
           * At 34ms, fifteen of the sixteen lines across the four trades ran
           * past the moment their reply was due — the plumber's longest needed
           * 3978ms of a 2400ms window — so the sentence was cut off half
           * written and swapped for the finished one, every time, on every
           * trade. Nobody had noticed because the bubble is replaced by the
           * same words.
           *
           * Now each line is given the time it actually has, less a beat at the
           * end for the hand to reach Send and press it. Clamped so a short
           * line does not crawl and a long one stays readable.
           */
          const window_ms = nextAt.get(st) ?? 1700;
          const step = Math.min(34, Math.max(11, (window_ms - PRESS_BEAT) / text.length));
          let n = 0;
          typer.current = window.setInterval(() => {
            n += 1;
            setLen(n);
            if (n >= text.length && typer.current) {
              window.clearInterval(typer.current);
              typer.current = null;
            }
          }, step);
        }, ms),
      );
    }
  }, [blip, calm, clearAll, draftFor]);

  useEffect(() => {
    /*
     * It starts when somebody can see it, not when the page loads.
     *
     * It used to begin on mount and play exactly once, ever. Whatever a
     * visitor was doing during those twenty-four seconds, that was their one
     * showing — and afterwards the hand sat frozen wherever the last frame
     * left it, which is what Giles was describing as the pointer stopping
     * half way through.
     *
     * Said plainly: I could not reproduce a stop at the half way point. I
     * first assumed the demo was below the fold on a phone and had played to
     * nobody, and measured it rather than trusting that — the phone mock is
     * 77 per cent visible at the top of a 390 by 844 screen, so the theory was
     * wrong and is not what this fixes. Traced end to end it reaches the last
     * stage every time. The chat bubble is not it either: that is held back
     * to twenty-seven seconds precisely so it cannot interrupt this, by which
     * time the demo has finished.
     *
     * What is certainly true is that a demo which has played once and stopped
     * looks exactly like a demo that stopped early, and there was no way to
     * see it again short of reloading. So it plays whenever it is on screen
     * and starts again from the top each time it comes back, rather than
     * once per page load. Scrolling away part way through stops it instead of
     * leaving it running unwatched.
     */
    /*
     * The phone, not the whole hero.
     *
     * This watched stageRef first, which wraps the headline, the trade
     * buttons, the phone and the diary — on a phone that is some two thousand
     * pixels tall, so a 844px viewport parked at the very top already shows
     * more than a third of it and the observer fired instantly. The gate was
     * there and did nothing, which measured as "it still starts on load".
     *
     * The phone mock is the thing the demo happens on and is smaller than any
     * viewport, so a third of it being visible means somebody is actually
     * looking at it.
     */
    /* Somebody who arrived asking to book did not come for the demo, and
       starting it would wipe the sentence waiting in the box. */
    if (askedFor.current) return;

    const el = phoneRef.current ?? stageRef.current;
    if (!el) {
      const id = window.requestAnimationFrame(begin);
      return () => {
        window.cancelAnimationFrame(id);
        clearAll();
      };
    }

    let frame = 0;
    let playing = false;
    /*
     * Once per page load, not once per glance.
     *
     * This used to start again every time the phone came back on screen, which
     * was meant to fix a demo that looked stopped. It was not the fix — that
     * was a rest-point bug of mine — and it created a worse problem: any
     * scroll restarts the run, the script takes the hand back for another
     * twenty-four seconds, and the finger stops following the mouse. Giles saw
     * exactly that: the pointer does not follow after the demo finishes.
     *
     * So it plays when it is first properly seen and then stays finished, and
     * the hand belongs to the visitor from there. Play it again is a button,
     * right underneath it, which is the honest place for a decision to watch
     * something a second time.
     */
    let everStarted = false;

    /*
     * Two thresholds with a wide gap between them, not one.
     *
     * A single threshold is a line, and a line is something a scrolling
     * thumb crosses several times a second. The first version started the
     * demo at 0.35 and stopped it below 0.35, so easing the page up and down
     * on a phone — which is most of what a thumb does — tore the run down and
     * started it again on every crossing, and the hand jumped back to the
     * beginning each time. Giles: the finger point looks like it is
     * flickering on mobile. That was me.
     *
     * So it starts only when half of it is on screen and stops only when
     * almost none of it is, and everything between those two is a dead zone
     * where nothing happens at all. Crossing one boundary cannot put you
     * straight over the other, which is the property a single number cannot
     * have however it is chosen.
     */
    const START_AT = 0.5;
    const STOP_AT = 0.05;

    const watch = new IntersectionObserver(
      (entries) => {
        /* The last one is the current state; a burst can deliver several. */
        const ratio = entries[entries.length - 1].intersectionRatio;

        if (!playing && !everStarted && ratio >= START_AT) {
          playing = true;
          everStarted = true;
          /* After paint: begin() resets several pieces of state and doing that
             synchronously is a second render before the first has been seen. */
          frame = window.requestAnimationFrame(begin);
          return;
        }

        /*
         * Scrolled away while it was still running. Stop the timers rather
         * than let a demo nobody can see play itself out — but it does not
         * start again, so the hand is the visitor's when they come back.
         */
        if (playing && ratio <= STOP_AT) {
          playing = false;
          window.cancelAnimationFrame(frame);
          clearAll();
          /* Wherever it got to is where it stopped, and that is "done" as far
             as the hand is concerned: the visitor can have it now. */
          setStage(S.DONE);
        }
      },
      { threshold: [0, STOP_AT, START_AT, 1] },
    );

    watch.observe(el);

    return () => {
      watch.disconnect();
      window.cancelAnimationFrame(frame);
      clearAll();
    };
  }, [begin, clearAll]);

  /*
   * Arriving from a "Book a 15 minute chat" button, with the sentence typed.
   *
   * Those buttons are all over the site and all of them pointed at an anchor
   * that did not exist. They bring somebody here now, and rather than landing
   * them in front of an empty box with the demo still running, the box says
   * what they came to say and waits for them to send it.
   *
   * Typed, not sent. A button labelled "book a chat" that fires a message off
   * the moment it is pressed takes the decision away from somebody who may
   * only have been reading a label — Giles's words were "pre-populated with
   * text to confirm", and confirm is the important one. They can change it or
   * ignore it.
   *
   * Read off window rather than useSearchParams, which would make this page
   * dynamic for a string only the browser needs.
   */
  useEffect(() => {
    const say = askedFor.current ?? "";
    if (!say) return;

    /* Straight to the visitor's turn: the demo is not what they came for. */
    clearAll();
    setStage(S.DONE);
    setDraft(say.slice(0, 300));

    /* After paint, so the box exists and is where it will finally be. */
    const id = window.requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true });
      document.getElementById("ask")?.scrollIntoView({ block: "center" });
    });
    return () => window.cancelAnimationFrame(id);
  }, [clearAll]);

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


    /*
     * Reduced motion keeps the hand and the story, and loses the sliding.
     *
     * It removed the hand outright at first, which is what Giles was seeing:
     * his phone has Reduce Motion on, so the cream hand holding the phone
     * stayed and the blue finger never appeared. Then it was pinned at the
     * input, which kept the picture and threw away everything it was doing.
     *
     * §6 says what to do instead: replace movement with fades. So the hand
     * still goes everywhere it goes — along the words, onto Send, over to the
     * diary row — and it cross-fades between those places rather than
     * travelling. Nothing large slides across the screen, which is what the
     * preference is actually asking for, and somebody who has it turned on
     * still watches the assistant do the job.
     *
     * Everything below runs unchanged; only the transitions differ, in the
     * style further down.
     */

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
      /*
       * Two halves: follow the words, then press Send.
       *
       * Giles: it looked like it was tapping the screen the whole time a
       * message was being written. It was — the finger travelled with the text
       * and ran a tap loop on the spot at the same time, so the travel read as
       * jitter rather than as following. The loop is gone; while the sentence
       * is being written the hand only moves along it, a pixel or two of bob on
       * alternate characters, the way a finger does.
       *
       * Once the sentence is finished it goes to the Send button and presses
       * it, which is the one moment a tap is the right thing to draw.
       */
      const full = (waiting ? draft : draftFor(stage)).length;
      if (full > 0 && len >= full) {
        const b = box(sendRef.current);
        if (b) {
          setHand({ x: b.left + b.width * 0.5, y: b.top + b.height * 0.5, mode: "press" });
          return;
        }
      }

      /* No traverse under reduced motion: a step every 34ms is the one thing
         the preference is unambiguously about. It rests at the near end. */
      const travel = calm ? 0 : Math.min(len * 6.6, Math.max(0, r.width - 72));
      setHand({
        x: r.left + 24 + travel,
        y: r.top + r.height * 0.5 + (calm ? 0 : len % 2 ? 3 : 0),
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

    /*
     * At rest it points at the box the visitor is invited to type in.
     *
     * It used to stop wherever the script had last put it — which after a full
     * run is lying across a diary row, covering the booking it has just made.
     * Giles: the resting finger needs to be somewhere out of the way but
     * pointing at something meaningful, like the bit that says ask for real,
     * not covering stuff. Both halves of that are right, and the second is the
     * harder one.
     *
     * Under the box rather than on it. The artwork's fingertip is at its top
     * edge — see TIP_X — so the hand hangs down and to the right of whatever
     * point it is given. Put the tip on the input and the palm lies over the
     * words somebody is being asked to read. Put it a few pixels below the
     * bottom edge and the finger points up at the box with the whole hand in
     * the empty space underneath, touching nothing.
     */
    /*
     * Only when the run is actually over, not between two of its stages.
     *
     * This is reached at every gap in the script as well as at the end — after
     * a reply, before the next question — and the first version of it pointed
     * at the ask box every time. So the hand crossed the whole panel to the
     * box and back on each gap, four or five times a run, which on a phone is
     * the flicker Giles saw. A stage ending is not the demo resting.
     *
     * Everywhere else it stays exactly where it was, which is what it did
     * before and is right: the pause after a reply belongs to the message
     * that was just sent, not to the box at the bottom.
     */
    if (stage === S.DONE || stage === S.START) {
      const ask = box(inputRef.current);
      if (ask) {
        setHand({ x: ask.left + 34, y: ask.top + ask.height + 10, mode: "point" });
        return;
      }
    }

    setHand((was) => (was ? { ...was, mode: "idle" } : was));
  }, [calm, draft, draftFor, len, sc.d1, sc.d2, stage, waiting]);

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

      /*
       * The demo has the hand while the demo is running.
       *
       * I had this backwards for a day. Giles asked for the finger to follow
       * his mouse and I gave the pointer priority over the script, so moving
       * the mouse anywhere near the hero pulled the hand off whatever it was
       * demonstrating — mid-sentence, mid-swipe — and it only went back at the
       * next stage. His correction: it should follow the demo, then follow the
       * mouse when there is no demo running.
       *
       * Which is what the original guard did, so it is back. The hand belongs
       * to the script until the run is over, and to the visitor after it —
       * when it is theirs to type into anyway.
       */
      const busy = stage !== S.DONE && stage !== S.START;
      if (busy || waiting) return;

      const frame = stageRef.current?.getBoundingClientRect();
      if (!frame) return;
      /* +20/+30 so it never covers the cursor, §6.2. */
      setHand({ x: e.clientX - frame.left + 20, y: e.clientY - frame.top + 30, mode: "idle" });
    },
    [calm, stage, touch, waiting],
  );

  const onLeave = useCallback(() => setTilt({ x: 0, y: 0 }), []);

  /** Send what the visitor typed to the real assistant. §7. */
  const send = useCallback(async (preset?: string) => {
    const text = (preset ?? draft).trim();
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

  /* Null until the clock is known, same as the clock itself: see the note on `now`. */
  const week = useMemo(() => (now === null ? null : weekOf(now)), [now]);

  const bookedRow = (i: number) =>
    (stage >= S.LANDED_1 && i === sc.d1) || (stage >= S.LANDED_2 && i === sc.d2);

  const rowLabel = (i: number) =>
    stage >= S.LANDED_2 && i === sc.d2 ? sc.r2 : stage >= S.LANDED_1 && i === sc.d1 ? sc.r1 : sc.rows[i] ?? "";

  const rowTag = (i: number) =>
    stage >= S.LANDED_2 && i === sc.d2 ? sc.r2s : stage >= S.LANDED_1 && i === sc.d1 ? sc.r1s : "";

  return (
    <div ref={stageRef} className="relative" onMouseMove={onMove} onMouseLeave={onLeave}>
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
    <div className="shell shell-wide flex flex-col gap-10 py-14 lg:grid lg:grid-cols-[1fr_minmax(0,560px)] lg:items-start lg:gap-8 lg:py-8">
      {/* ------------------------------------------------------------ left */}
      <div className="contents lg:relative lg:z-10 lg:block">
      <div className="relative z-10 order-1 lg:order-none">
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
            /* Capped at 96 it stopped growing at 1370px, leaving a 1920
               screen with a small headline in a lot of paper. */
            fontSize: "clamp(52px, 6.4vw, 118px)",
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
          When you need a website or an app, we build that too. Pick a trade below and
          watch a real evening play out, then ask it something yourself &mdash; the one on
          this page is real.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-5">
          <a href="/home?say=I%20would%20like%20to%20book%20a%2015%20minute%20chat#ask" className="btn-primary" style={{ minHeight: 62, fontSize: "20px" }}>
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

        <div className="relative z-10 flex flex-col gap-3 lg:flex-row lg:items-start lg:gap-4">
          {/* --------------------------------------------------- the phone */}
          {/*
            * A shell, so the pair is positioned against the phone.
            *
            * They were absolute children of the whole right column. Once the
            * diary moved alongside the phone rather than under it, the column
            * got much wider than the phone and the cobalt hand was left
            * hanging in space next to the diary.
            */}
          <div className="relative mx-auto w-full max-w-[250px] shrink-0 sm:max-w-[268px] lg:mx-0 lg:w-[258px] lg:max-w-none">
        {HOLDING.map((h) => (
              <span
                key={h.src}
                aria-hidden
                className={`pointer-events-none absolute select-none ${h.place}`}
                style={{
                  transform: `translate(${tiltUsed.x * h.px}px, ${tiltUsed.y * h.py}px)`,
                  transition: "transform 0.5s ease-out",
                  /*
                   * Behind the phone, and they stay there.
                   *
                   * Put in front they read as two cut-outs laid over a rectangle,
                   * because that is what they are: the supplied artwork is a hand
                   * photographed palm-up with nothing in it, fingers curled toward
                   * the camera rather than wrapped round a flat object. No offset
                   * makes that grip a phone. Behind and to the side it reads as a
                   * pair reaching in, which is what the pose actually is.
                   */
                  zIndex: 0,
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

          <div
            ref={phoneRef}
            /* Named so a check can find the phone without guessing at a class. */
            data-phone=""
            /*
             * Narrower on a phone so the pair behind it can be seen holding it.
             * At the full column width the phone covered both hands completely
             * and the hero was named after something invisible.
             */
            className="relative z-10 w-full"
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
                "linear-gradient(150deg, #23221b 0%, #16150f 38%, #131209 70%, #0a0906 100%)",
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
            {/*
              * The power and volume keys, sat proud of the left and right
              * edges. Small, but a handset silhouette is not a plain rounded
              * rectangle and the eye knows it.
              */}
            <span
              aria-hidden
              className="pointer-events-none absolute -left-[2px] top-[19%] block"
              style={{ width: 2.5, height: 26, borderRadius: 2, background: "linear-gradient(90deg,#000,#2a291f)" }}
            />
            <span
              aria-hidden
              className="pointer-events-none absolute -left-[2px] top-[29%] block"
              style={{ width: 2.5, height: 42, borderRadius: 2, background: "linear-gradient(90deg,#000,#2a291f)" }}
            />
            <span
              aria-hidden
              className="pointer-events-none absolute -right-[2px] top-[25%] block"
              style={{ width: 2.5, height: 54, borderRadius: 2, background: "linear-gradient(270deg,#000,#2a291f)" }}
            />

            <div
              /*
               * 440 rather than 560. The diary underneath is the payoff of the
               * whole run — the booking card is swiped into it — and at the old
               * height only 51px of a 312px panel was above the fold on a
               * 1280x844 screen, so almost nobody saw where the card landed.
               */
              className="relative flex h-[430px] flex-col overflow-hidden sm:h-[460px] lg:h-[516px]"
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

                {/*
                  * "Now you have a go", said plainly.
                  *
                  * The input under this thread has always been wired to the
                  * real assistant, and nothing on the page said so — the copy
                  * invites you to watch an evening play out and then leaves a
                  * box that looks like part of the demo. Giles asked for it to
                  * be obvious.
                  *
                  * Three questions rather than an instruction, because a thing
                  * you can press is a clearer offer than a sentence telling you
                  * a box works. They are the questions a buyer actually opens
                  * with, and the assistant answers them from what is true
                  * today — including "not yet" on the Meta channels.
                  *
                  * Only once the run has finished and only until the visitor
                  * has sent something, so it never competes with the demo and
                  * never lingers after it has been used.
                  */}
                {stage >= S.DONE && !sent && !waiting && (
                  <div className="pt-1">
                    <p className="mb-2 text-xs font-medium">
                      Your turn &mdash; this one is the real assistant.
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {ASK_FIRST.map((q) => (
                        <button
                          key={q}
                          type="button"
                          onClick={() => send(q)}
                          className="rounded-full px-2.5 py-1 text-xs transition-colors"
                          style={{
                            border: "1px solid var(--accent)",
                            color: "var(--accent)",
                            background: "color-mix(in srgb, var(--accent) 7%, transparent)",
                          }}
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* A real input, §7. */}
              <div
                /*
                 * The target every "Book a 15 minute chat" on the site points
                 * at. There was no such element anywhere: each of those
                 * buttons linked to /home#ask, which matched nothing, so on
                 * the home page they did nothing at all and everywhere else
                 * they dropped somebody at the top of the home page to find
                 * it themselves. Giles: the book a chat buttons do not do
                 * anything.
                 *
                 * Two pixels of scroll margin so the header does not sit over
                 * it when the browser jumps here.
                 */
                id="ask"
                className="flex items-center gap-2 px-3 py-3 transition-colors"
                style={{
                  scrollMarginTop: 120,
                  borderTop: "1px solid var(--line)",
                  /* Lit once it is the visitor's turn, so the live box does not
                     look like the rest of the demo. */
                  background:
                    stage >= S.DONE && !sent && !waiting
                      ? "color-mix(in srgb, var(--accent) 6%, transparent)"
                      : undefined,
                }}
              >
                <input
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") send();
                  }}
                  onFocus={() => {
                    /*
                       Your turn, the moment you ask for it.
                       The invitation only appeared after twenty-four seconds of
                       demo, so anybody who wanted to try it sooner had to type
                       into a box the hand was already using. Touching it stops
                       the script and hands the thread over.
                    */
                    if (stage !== S.DONE) {
                      clearAll();
                      setStage(S.DONE);
                    }
                  }}
                  /*
                   * Short enough to fit beside the Send button.
                   *
                   * It said "Ask it something — this one is real", which wants
                   * 216 pixels in a box that measures 146 on a phone and 154
                   * on a laptop: cut off by seventy pixels, mid-word, hard
                   * against the button. At every width, not only on a phone,
                   * and since the day it was written — Giles saw it on the
                   * phone first because that is where the box is narrowest.
                   *
                   * The half being chopped was the half that mattered, so the
                   * claim moves out of the placeholder rather than being
                   * truncated: the line above this box already says "Your turn
                   * — this one is the real assistant", in full, where there is
                   * room for it.
                   */
                  placeholder="Ask it something"
                  aria-label="Ask the assistant something"
                  /*
                   * And anything that outgrows the box in future tapers off
                   * instead of being guillotined against the button.
                   */
                  className="min-w-0 flex-1 truncate bg-transparent text-sm outline-none"
                />
                <button
                  ref={sendRef}
                  type="button"
                  /* Wrapped: send() takes an optional preset now, and a bare
                     handler would hand it the click event as the message. */
                  onClick={() => send()}
                  disabled={waiting || !draft.trim()}
                  className="btn-primary shrink-0 px-3"
                  style={{
                    minHeight: 36,
                    fontSize: 13,
                    /* The hand presses it and the button gives, which is what
                       was missing: a finger tapping a control that does not
                       move reads as a finger near a control. */
                    transform: hand?.mode === "press" ? "translateY(1.5px)" : undefined,
                    filter: hand?.mode === "press" ? "brightness(0.93)" : undefined,
                  }}
                >
                  Send
                </button>
              </div>
              {/*
                * One soft diagonal across the glass. Glass catches light and a
                * flat fill does not, which is the other half of why a CSS
                * phone reads as a drawing of a phone.
                */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                  borderRadius: 32,
                  background:
                    "linear-gradient(118deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.14) 26%, rgba(255,255,255,0) 44%)",
                  mixBlendMode: "overlay",
                }}
              />

              {/* The home indicator. The last thing that says "phone". */}
              <span
                aria-hidden
                className="mx-auto mb-1.5 mt-1 block shrink-0"
                style={{ width: 96, height: 4, borderRadius: 999, background: "var(--foreground)", opacity: 0.22 }}
              />
            </div>
          </div>
          </div>

          {/* The diary and its caption, beside the phone from lg. */}
          {/*
            * Positioned, so it paints above the hand.
            *
            * The hand is absolute and the diary column was not positioned at
            * all, and a positioned element paints above a static one whatever
            * the DOM order — so the wrist ran across the diary's caption. The
            * reference has the same stacking deliberately: hand 5, diary 8,
            * phone 10.
            */}
          {/*
            * As tall as the week it is showing, not as tall as the phone.
            *
            * self-stretch made this match the phone beside it, and six rows
            * do not fill a phone — so on a laptop there were two hundred and
            * fifty empty pixels between the last appointment and the line
            * underneath. Giles: the diary is half empty and there is a lot of
            * wasted space.
            *
            * Two panels of different heights side by side is what a real
            * week looks like; a panel padded out to match its neighbour is
            * what an empty diary looks like, which is the opposite of the
            * thing this is meant to be showing.
            */}
          <div className="relative z-10 flex min-w-0 flex-col gap-2 lg:flex-1 lg:self-start">
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
            className="flex flex-col p-3"
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
                {week ? `${week[0].date}–${week[5].date} · ` : ""}
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
                  {/*
                    * The day and the date, down the left, as a diary has.
                    * Blank for one frame while the clock resolves rather than
                    * server-rendered wrong and corrected — the same reason the
                    * headline's clock starts empty.
                    */}
                  <span className="w-[52px] shrink-0 self-center pr-2 text-right text-[11px] leading-tight text-muted">
                    {week ? (
                      <>
                        <span className="block">{week[i]?.day}</span>
                        <span className="block tabular-nums opacity-70">{week[i]?.date}</span>
                      </>
                    ) : null}
                  </span>

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

            {/*
              * Always in the layout, faded in at the end rather than inserted.
              *
              * This was mounted at the last stage, and it is two lines of text
              * under the diary — so at the moment the demo finished, everything
              * below the hero jumped down 51 pixels. Measured, not guessed:
              * tracking every element outside the phone through a whole run,
              * this is the only thing on the page that changes size, and it is
              * the whole of the page's layout shift.
              *
              * Rendering it always and hiding it keeps the space reserved, so
              * the end of the demo is a line appearing rather than the page
              * moving under somebody's thumb. aria-hidden while invisible, so
              * a screen reader is not told about a summary of something that
              * has not happened yet.
              */}
            <p
              className="mt-3 text-sm text-muted transition-opacity duration-500 lg:mt-auto lg:pt-3"
              style={{ opacity: stage >= S.DONE ? 1 : 0 }}
              aria-hidden={stage < S.DONE}
            >
              {sc.done}
            </p>
          </div>

          </div>

        </div>

        {/*
          * The trade picker, directly under the demo it changes.
          *
          * It has been three places. Above the headline it pushed the
          * statement down a phone screen and asked for a choice before
          * saying what the choice was about; under the call to action it was
          * nowhere near the thing it changes. Here, and the reason it was
          * moved away from here the first time is handled rather than
          * avoided: the hand's wrist runs a long way below the phone, so the
          * row is positioned above it and the label is set in the foreground
          * rather than muted, which is what was unreadable over skin tone.
          *
          * Centred under the pair rather than ranged left, which is Giles's
          * call and the right one: it belongs to the phone and the diary
          * together, and hung off the left edge it looked like it belonged to
          * the phone alone.
          */}
        {/* Above the hand. The holding artwork runs down past the phone and
            was covering "Show me a" and the first chip with a wrist. */}
        {/*
          * Room for the hand to rest above them.
          *
          * The finger settles pointing up at the ask box, which puts a 142px
          * hand in the space under the phone — and at lg:mt-6 that space was
          * 24px, so it lay across "Show me a" and the first chip. The gap is
          * the finger's height now.
          *
          * This costs less than it just gave back: the diary no longer
          * stretches to the phone, which freed about 250px of nothing.
          */}
        <div className="relative z-30 mt-4 flex flex-wrap items-center justify-center gap-2 lg:mt-28">
        <span className="text-[13px] uppercase tracking-[0.06em]">Show me a</span>
        {TRADES.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTrade(t.key)}
            aria-pressed={trade === t.key}
            className="px-2.5 py-1 text-[13px] uppercase tracking-[0.06em] transition-colors"
            style={{
              border: "1.5px solid var(--foreground)",
              borderRadius: 999,
              background: trade === t.key ? "var(--foreground)" : "transparent",
              color: trade === t.key ? "var(--background)" : "var(--foreground)",
            }}
          >
            {t.label}
          </button>
        ))}
        {/*
          * The demo note lives with the picker. "Show me a tattoo studio"
          * and "this is a demo" are the same thought, and under the diary it
          * sat over the hand's wrist where muted grey on skin tone could
          * barely be read.
          */}
        </div>

        {/* Its own line: trailing the chips it sat over the hand's wrist,
            where muted grey on skin tone could barely be read. */}
        {/* A backing, because centred it lands on the hand's wrist and muted
            grey on skin tone cannot be read. */}
        <p className="relative z-10 mt-2 text-center text-[13px]">
          <span
            className="inline-block rounded-full px-3 py-1 text-muted"
            style={{ background: "color-mix(in srgb, var(--background) 82%, transparent)" }}
          >
            A demo. On your site this is your assistant.
          </span>
        </p>
      </div>

      {/*
        * The second pair, §6.2 to §6.5.
        *
        * Fixed to the page rather than to the phone, because it travels between
        * the two: it types in the input, picks the card out of the thread and
        * carries it into a diary row. Absent entirely under reduced motion.
        */}
      {hand && (
        <span
          aria-hidden
          data-hand={hand.mode}
          className="pointer-events-none absolute block"
          style={{
            left: 0,
            top: 0,
            /*
             * Two elements, because a translate that travels and a tap that
             * loops cannot share one transform property. The outer one goes
             * where it is told; the inner one taps where it stands.
             */
            /*
             * Aims the fingertip, not the corner. TIP_X is where the tip sits
             * across the trimmed artwork; the tip is at the very top of it, so
             * there is nothing to take off y.
             */
            /*
             * translate3d rather than translate, to keep it on its own layer.
             *
             * The same arithmetic either way; the z tells the browser to
             * composite it rather than repaint it against the grain overlay
             * and the hero behind. On a phone that is the difference between
             * a glide and a stutter.
             */
            transform: `translate3d(${hand.x - TIP_X * handWidth}px, ${hand.y}px, 0)`,
            /*
             * Short and linear while typing, which is what makes the traverse
             * possible at all: a character lands every 34ms, so a 0.7s eased
             * transition never finishes and every frame restarts it. The
             * reference sets .type to .12s linear for the same reason.
             */
            /*
             * "idle" is the visitor's own pointer, and wants to be quick.
             *
             * Everything here was 0.7s ease except the three scripted modes,
             * and following a mouse on three quarters of a second is not
             * following, it is drifting after — the finger arrives where the
             * cursor was rather than where it is, and never catches up while
             * the hand is moving. Now that the pointer takes the hand during
             * the demo as well, that is most of what anybody feels.
             *
             * 0.16s with a decelerating curve: fast enough to sit with the
             * cursor, long enough that it glides rather than snaps.
             *
             * "point" keeps the long ease. It is the one move the script makes
             * on its own across the whole panel, at the end of a run, and it
             * should look like the hand settling rather than jumping.
             */
            transition: calm
              ? "none"
              : hand.mode === "swipe"
                ? "transform 1.6s ease"
                : hand.mode === "type"
                  ? "transform 0.12s linear"
                  : hand.mode === "press"
                    ? "transform 0.3s cubic-bezier(.3,0,.2,1)"
                    : hand.mode === "idle"
                      ? "transform 0.16s cubic-bezier(.22,1,.36,1)"
                      : "transform 0.7s ease",
            zIndex: 40,
            willChange: "transform",
          }}
        >
          {/*
            * Two frames, not a nudge.
            *
            * The old artwork was a hand palm-on to the viewer with the finger
            * pointing up and left — a pointing gesture, and nobody types with
            * their palm facing the screen. This is the back of the hand seen
            * from above, the way you see your own reaching for a phone, and
            * the tap is a real finger bending rather than the whole picture
            * shifting four pixels down and back.
            *
            * The two frames are cut from one bounding box, so everything but
            * the finger is identical between them: the wrapper offset stays
            * put and swapping the image dips the fingertip on its own, which
            * is what a press looks like. Measured after trimming, the tip sits
            * 4.5% across and at the very top of the frame in the raised one,
            * and 9.4% of the frame lower in the pressed one.
            *
            * No rotation any more. The old one needed -10deg to aim the finger;
            * this one is drawn at the angle it should be.
            */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            /*
              * The key is the point under reduced motion.
              *
              * The wrapper jumps to the new place with no transition, so
              * without this the hand would simply be somewhere else between
              * one frame and the next. Keying on the position remounts the
              * image, which restarts the fade, so it leaves one place and
              * arrives at the other. Off entirely when motion is allowed,
              * where the travel does that job.
              */
            key={calm ? `${Math.round(hand.x)}:${Math.round(hand.y)}:${hand.mode}` : "hand"}
            /*
             * The 480px pair, not the 1155px originals.
             *
             * It is drawn at 104px here and 142 above sm, so 426 on a
             * three-times screen — the source was two and a half times more
             * than the densest phone can show, and both frames load because
             * the press one swaps in. 286KB became 40.
             *
             * scripts/brand-image-sizes.cjs regenerates them, and carries the
             * arithmetic for why 480.
             */
            src={
              hand.mode === "press"
                ? "/brand/hands/hand-type-press-480.webp"
                : "/brand/hands/hand-type-480.webp"
            }
            alt=""
            className="w-[104px] select-none sm:w-[142px]"
            style={calm ? { animation: "sp-appear 0.32s ease-out both" } : undefined}
          />
        </span>
      )}
    </div>
    </div>
  );
}

/**
 * Monday to Saturday of the week the visitor is in.
 *
 * The scenario rows are already a working week: every trade's second booking
 * lands on row 3 and its card says THU, the tattooist's first lands on row 5
 * and says SAT, the plumber's on row 2 and says WED. Row index is the weekday
 * and always has been — it was just never written down or shown, so the panel
 * read as a list rather than a diary.
 *
 * Derived from the clock rather than stored, so it is right every week without
 * anybody editing anything, and it agrees with the time printed under the
 * headline because both come from the same value.
 */
function weekOf(ms: number): { day: string; date: number }[] {
  const d = new Date(ms);
  /* getDay() is 0 for Sunday, so Sunday belongs to the week just gone. */
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return Array.from({ length: 6 }, (_, i) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    return { day: day.toLocaleDateString("en-GB", { weekday: "short" }), date: day.getDate() };
  });
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

