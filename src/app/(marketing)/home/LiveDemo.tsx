"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * The assistant, working, while you watch.
 *
 * This panel was the conversation printed out — six bubbles sitting there,
 * finished, the way a screenshot sits there. But the whole claim of the product
 * is about *when* it replies: at nine at night, in under a minute, while the
 * owner's hands are full. A finished transcript cannot make that claim. It has
 * to happen in front of you.
 *
 * So it plays. The customer types, the assistant thinks for a beat and answers,
 * the clock in the header is the real one, and it loops so anybody landing
 * mid-cycle still sees it work. The pause before each reply is the point of the
 * whole thing, which is why it is timed to read as considered rather than
 * instant — an answer that appears with no gap at all reads as canned.
 *
 * Rendered in full on the server, then rewound before the first paint, so the
 * text is there for search engines and for anybody without JavaScript.
 */

type Line = { readonly from: "them" | "us"; readonly text: string };

/** useLayoutEffect on the client, useEffect on the server, without the warning. */
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/*
 * How long a beat lasts.
 *
 * Long enough that the reply reads as considered, short enough that somebody
 * scanning the page sees a whole exchange before they scroll past it. The
 * thinking pause is fixed; the pause after a message scales with how much there
 * is to read, because watching a long answer vanish is worse than waiting.
 */
const THINKING = 1100;
const READ_PER_CHAR = 22;
const READ_MAX = 2600;
const HOLD = 4200;

export function LiveDemo({
  conversation,
  supportSlug,
}: {
  conversation: readonly Line[];
  /** The help assistant's own studio, if one is configured. Enables "ask ours". */
  supportSlug?: string;
}) {
  /*
   * How many lines are showing.
   *
   * Starts at all of them: this component is server-rendered, and a panel that
   * arrives empty is a hole in the page for anybody whose JavaScript is slow,
   * off, or a crawler. The rewind below happens before the browser paints, so
   * nobody sees the full list flash.
   */
  const [shown, setShown] = useState(conversation.length);
  const [thinking, setThinking] = useState(false);
  const [live, setLive] = useState(false);
  const [asking, setAsking] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useIsomorphicLayoutEffect(() => {
    // Anybody who has asked for less motion gets the transcript, complete and
    // still. It says the same thing; it just does not move.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    setShown(0);
    setLive(true);
  }, []);

  useEffect(() => {
    if (!live || asking) return;

    const at = (ms: number, fn: () => void) => {
      timers.current.push(setTimeout(fn, ms));
    };

    let t = 400;
    const play = () => {
      conversation.forEach((line, i) => {
        // Only the assistant thinks. The customer is typing on their own phone
        // and we have no business pretending to know how long that took.
        if (line.from === "us") {
          at(t, () => setThinking(true));
          t += THINKING;
        }
        at(t, () => {
          setThinking(false);
          setShown(i + 1);
        });
        t += Math.min(READ_MAX, 700 + line.text.length * READ_PER_CHAR);
      });

      at(t + HOLD, () => {
        setShown(0);
        t = 400;
        play();
      });
    };
    play();

    const running = timers.current;
    return () => {
      running.forEach(clearTimeout);
      running.length = 0;
    };
  }, [live, asking, conversation]);

  const visible = conversation.slice(0, shown);

  return (
    <div className="card overflow-hidden p-0">
      <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-on-accent">
          {asking ? "SP" : "FE"}
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">
            {asking ? "Second Pair" : "Foster Electrical"}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <span className="size-1.5 rounded-full bg-ok" aria-hidden />
            {asking ? "Ours, answering you" : "Usually replies in under a minute"}
          </div>
        </div>
        {!asking && <Clock />}
      </div>

      {asking && supportSlug ? (
        <iframe
          src={`/widget/${supportSlug}?embed=1`}
          title="Ask Second Pair's assistant"
          className="h-[26rem] w-full border-0"
        />
      ) : (
        <>
          {/*
           * A floor under the panel.
           *
           * Without it the card grows a line at a time and shoves the page
           * around under the reader — on a hero, while they are still deciding
           * whether to stay.
           */}
          <div
            className="flex min-h-[19.5rem] flex-col justify-end gap-2.5 p-4"
            aria-live="polite"
          >
            {visible.map((line, i) => (
              <div
                key={i}
                className={`max-w-[86%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  live ? "settle" : ""
                } ${
                  line.from === "them"
                    ? "ml-auto rounded-br-sm bg-accent text-on-accent"
                    : "rounded-tl-sm bg-surface-2"
                }`}
              >
                {line.text}
              </div>
            ))}

            {thinking && (
              <div className="flex w-fit items-center gap-1.5 rounded-2xl rounded-tl-sm bg-surface-2 px-3.5 py-3">
                <span className="sr-only">Typing</span>
                {[0, 1, 2].map((d) => (
                  <span
                    key={d}
                    className="breathe size-1.5 rounded-full bg-muted"
                    style={{ animationDelay: `${d * 180}ms` }}
                    aria-hidden
                  />
                ))}
              </div>
            )}
          </div>

          <p className="border-t border-border px-4 py-2.5 text-center text-[11px] text-muted">
            A real conversation shape. Nobody at Foster Electrical was awake.
          </p>
        </>
      )}

      {supportSlug && (
        <button
          type="button"
          onClick={() => setAsking((a) => !a)}
          className="w-full border-t border-border py-2.5 text-center text-[12px] font-medium text-highlight-strong transition-colors hover:bg-surface-2"
        >
          {asking ? "← Back to the demo" : "Ask ours anything, right now →"}
        </button>
      )}
    </div>
  );
}

/**
 * The real time, because that is the argument.
 *
 * The header used to read 21:47 — a made-up hour chosen to say "look how late
 * this was". Showing whatever time it actually is for the person reading makes
 * the same point and cannot be accused of staging it.
 */
function Clock() {
  const [now, setNow] = useState<string | null>(null);

  useEffect(() => {
    const tick = () =>
      setNow(
        new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }),
      );
    tick();
    const id = setInterval(tick, 20_000);
    return () => clearInterval(id);
  }, []);

  return (
    <span className="num ml-auto shrink-0 text-[11px] text-muted" suppressHydrationWarning>
      {now ?? "21:47"}
    </span>
  );
}
