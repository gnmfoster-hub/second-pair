"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { mostlyInView } from "@/lib/inView";
import { MomentCard } from "@/app/widget/[slug]/Moments";
import type { Moment } from "@/lib/engine/moments";
import { retires } from "@/lib/conversationCards";

/**
 * The assistant, working, while you watch.
 *
 * This panel was the conversation printed out — bubbles sitting there,
 * finished, the way a screenshot sits there. But the whole claim of the product
 * is about *when* it replies: at nine at night, in under a minute, while the
 * owner's hands are full. A finished transcript cannot make that claim. It has
 * to happen in front of you.
 *
 * So it plays, and it plays honestly. The customer's side is typed into the
 * composer a character at a time and then sent, because that is what a person
 * does. The assistant's side shows the same two dots the real widget shows and
 * then arrives whole, because that is what the real widget does — it does not
 * stream, and a demo that streamed would be selling something we do not ship.
 *
 * It is the real widget's chrome, the real bubbles and the real booking cards,
 * imported rather than imitated. Anyone who signs up should recognise the thing
 * they were shown.
 *
 * Rendered complete on the server and rewound before the first paint, so the
 * text is there for search engines and for anybody without JavaScript.
 */

type Beat =
  | { who: "them"; text: string }
  | { who: "us"; text: string; moment?: Moment }
  | { who: "tap"; slot: number };

type Line = { from: "them" | "us"; text: string; moment?: Moment };

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/*
 * How long a beat lasts.
 *
 * Typing is deliberately quicker than a real thumb — a demo that took as long
 * as genuinely typing a sentence would lose the reader before the reply. The
 * thinking pause is the one that has to feel true, because the pause before an
 * answer is the thing being demonstrated.
 */
const KEYSTROKE = 34;
const BEFORE_SEND = 420;
const THINKING = 1250;
const READ_PER_CHAR = 21;
const READ_MAX = 2500;
const HOLD = 4600;

export function LiveDemo({
  script,
  brand,
  onBrand,
  business,
  initials,
  supportSlug,
}: {
  script: readonly Beat[];
  /** The salon's own colour — the widget wears the business's brand, not ours. */
  brand: string;
  onBrand: string;
  business: string;
  initials: string;
  /** Our own assistant, if one is configured. Enables "ask ours". */
  supportSlug?: string;
}) {
  const finished = script.filter((b): b is Extract<Beat, { who: "them" | "us" }> => b.who !== "tap");

  /*
   * Everything, until the browser says otherwise.
   *
   * Server-rendered, and a panel that arrives empty is a hole in the page for a
   * crawler or anybody whose JavaScript is slow. The rewind happens before the
   * first paint, so nobody sees the full list flash.
   */
  const [lines, setLines] = useState<Line[]>(() =>
    finished.map((b) => ({ from: b.who, text: b.text, moment: b.who === "us" ? b.moment : undefined })),
  );
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [pressed, setPressed] = useState<number | null>(null);
  const [live, setLive] = useState(false);
  const [asking, setAsking] = useState(false);
  /*
   * Somebody who has asked their phone for less motion.
   *
   * Kept as state rather than checked where it is needed, because it decides
   * two different things: that nothing starts on its own, and that there is a
   * button offering to start it.
   */
  const [stillPreferred, setStillPreferred] = useState(false);
  const thread = useRef<HTMLDivElement>(null);

  useIsomorphicLayoutEffect(() => {
    // Anybody who has asked for less motion gets the transcript, complete and
    // still. It says the same thing; it just does not move.
    /*
     * Reduce Motion means do not move on your own, not do not exist.
     *
     * This used to return here and leave a finished transcript on the page
     * forever. That is the correct instinct — nothing should start animating
     * at somebody who has asked their device for less of it — and it is a bad
     * answer for the one thing on this page that is the product. On a phone
     * with Reduce Motion switched on, which is a very ordinary setting to
     * have, the demo simply never worked and looked broken.
     *
     * So it still never starts by itself. It offers instead, and a press is
     * consent. That is the same bargain a video makes.
     */
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setStillPreferred(true);
      return;
    }

    const panel = thread.current;
    if (!panel) return;

    /*
     * It starts when somebody can see it, not when the page loads.
     *
     * On a desktop the panel sits beside the headline and is on screen
     * immediately, so starting at mount looked right and was only ever right
     * by accident. On a phone it is below the fold: the conversation played
     * its twenty seconds to nobody while the reader was still on the first
     * paragraph, and by the time they scrolled down it had finished and was
     * holding — a still transcript, which is the one thing this exists not to
     * be. It worked on a PC and not on a phone, and the difference was never
     * the device.
     *
     * Measured off the element's own box on a timer rather than with an
     * IntersectionObserver. The observer is the tidier tool and it is the
     * wrong one here for the same reason requestAnimationFrame was: it does
     * not run in a document that is not being painted, so it can silently
     * never fire, and a demo that never starts is indistinguishable from a
     * broken one. A timer always arrives, and asking a rectangle where it is
     * costs nothing twice a second.
     *
     * Cleared only when it starts, for the same reason. Emptying the thread at
     * mount would leave a blank panel sitting there through all the scrolling
     * it takes to reach it; the finished conversation is the better thing to
     * find, right up until it becomes the live one.
     */
    const enoughOfItShowing = () =>
      mostlyInView(panel.getBoundingClientRect(), window.innerHeight);

    if (enoughOfItShowing()) {
      setLines([]);
      setLive(true);
      return;
    }

    const look = window.setInterval(() => {
      if (!enoughOfItShowing()) return;
      window.clearInterval(look);
      setLines([]);
      setLive(true);
    }, 400);

    return () => window.clearInterval(look);
  }, []);

  /*
   * The buttons on the page open this, rather than scrolling to it.
   *
   * They were anchors pointing at the panel, which works on a phone where it is
   * below the fold and does nothing at all on a desktop where it is already on
   * screen — the main call to action on the page moved sixty-seven pixels and
   * appeared broken. They now point at #ask, which this listens for: it opens
   * the assistant and brings itself into view, so the same link is right at
   * both sizes.
   */
  useEffect(() => {
    const open = () => {
      if (window.location.hash !== "#ask") return;
      setAsking(true);

      /*
       * Only scroll if it is actually off screen.
       *
       * "Bring it into view" and "centre it" are different requests, and this
       * asked for the second — so on a desktop, where the panel is already
       * beside the headline, pressing the button shoved the page down to
       * centre something the reader was already looking at. Nothing appeared
       * to happen except the page moving, which is the worst of both.
       *
       * On a phone it genuinely is below the fold, and there the scroll is the
       * whole point.
       */
      const box = thread.current?.closest("[id]");
      if (!box) return;
      const seen = box.getBoundingClientRect();
      const mostlyVisible = seen.top >= 0 && seen.bottom <= window.innerHeight;
      if (!mostlyVisible) box.scrollIntoView({ behavior: "smooth", block: "nearest" });
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);

  // Follow the conversation down, the way the real thing does.
  useEffect(() => {
    const el = thread.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, thinking, draft]);

  useEffect(() => {
    if (!live || asking) return;

    /*
     * Written down first, played from a clock second.
     *
     * This used to schedule the whole script up front as a few hundred
     * setTimeouts at increasing offsets, which fails in two ways that both
     * look like "the demo stopped typing".
     *
     * A browser clamps timers in a tab that is not in front to about a second,
     * so a 34ms keystroke fires at 1000ms — but a timer already set for eight
     * seconds still fires at eight. The order collapses: keystrokes bunch up
     * while later beats arrive on time, and the reply lands before the
     * question has finished being typed.
     *
     * And leaving the tab at all is worse. Every pending timer comes due while
     * away and fires the moment you return, so the conversation jumps to the
     * end in one frame — which is exactly what somebody sees when they switch
     * back to the homepage and find it finished instead of running.
     *
     * So beats are collected with their times and played by a frame loop that
     * asks what is due by now. Frames do not run in a hidden tab, so the demo
     * pauses where it stands and carries on when somebody is actually looking.
     */
    const beats: { at: number; run: () => void }[] = [];
    const at = (ms: number, fn: () => void) => {
      beats.push({ at: ms, run: fn });
    };

    let t = 700;

    const play = () => {
      for (const beat of script) {
        if (beat.who === "us") {
          at(t, () => setThinking(true));
          t += THINKING;
          at(t, () => {
            setThinking(false);
            setLines((l) => [...l, { from: "us", text: beat.text, moment: beat.moment }]);
          });
          t += Math.min(READ_MAX, 800 + beat.text.length * READ_PER_CHAR);
          continue;
        }

        if (beat.who === "tap") {
          // The press is shown before the message appears, because a button
          // that sends with no acknowledgement looks like a page reloading.
          at(t, () => setPressed(beat.slot));
          t += 500;
          at(t, () => {
            setPressed(null);
            const card = lastSlots(script);
            const label = card?.slots[beat.slot]?.label ?? "";
            setLines((l) => [...l, { from: "them", text: `${label} please` }]);
          });
          t += 700;
          continue;
        }

        // Typed a character at a time into the composer, then sent — the only
        // half of this conversation a human is actually doing.
        for (let i = 1; i <= beat.text.length; i++) {
          at(t, () => setDraft(beat.text.slice(0, i)));
          t += KEYSTROKE;
        }
        t += BEFORE_SEND;
        at(t, () => {
          setDraft("");
          setLines((l) => [...l, { from: "them", text: beat.text }]);
        });
        t += 650;
      }

      at(t + HOLD, () => {
        setLines([]);
        // Rebuild from the top rather than replaying a spent queue.
        beats.length = 0;
        next = 0;
        looped = true;
        t = 700;
        play();
      });
    };

    play();


    let next = 0;
    let looped = false;

    /*
     * Pumped by a timer, and told the time by the clock.
     *
     * The first version of this scheduled every beat up front as its own
     * setTimeout at a fixed offset. That is what broke: a browser clamps
     * timers in a tab that is not in front to about a second, so a 34ms
     * keystroke fired at 939ms while a beat already set for eight seconds
     * still fired at eight. The order collapsed, and leaving the tab at all
     * made every pending timer come due at once on return.
     *
     * The fix was never to stop using timers — it was to stop trusting them to
     * keep time. Each tick asks the clock how long it has actually been and
     * plays whatever is due, so a late tick catches up rather than stretching
     * the conversation out.
     *
     * Frames were the obvious pump and the wrong one. requestAnimationFrame
     * does not run at all in a tab that is not being painted, which sounds
     * like a feature — the demo waits for an audience — but it means the whole
     * thing can silently never start, and from the outside that is
     * indistinguishable from it being broken. A timer always arrives. If it
     * arrives late the arithmetic absorbs it.
     */
    let origin = performance.now();

    const tick = () => {
      const gone = performance.now() - origin;

      while (next < beats.length && beats[next].at <= gone) {
        beats[next++].run();
        /*
         * The last beat empties the queue and rebuilds it for the next run
         * through. Without stopping here the loop would carry straight on into
         * that fresh queue still holding the elapsed time of the run that just
         * finished, and play the whole conversation in a single tick.
         */
        if (looped) {
          looped = false;
          origin = performance.now();
          break;
        }
      }
    };

    const pump = window.setInterval(tick, 40);

    return () => window.clearInterval(pump);
  }, [live, asking, script]);

  return (
    <div
      /*
       * The real widget's shape: a bubble pinched at the corner nearest where
       * its launcher would sit. On the page it is a picture of the thing rather
       * than the thing, so it has no launcher — but it should still be the
       * shape somebody will recognise when they get one.
       */
      className="overflow-hidden rounded-[22px] rounded-br-md border border-border bg-background shadow-[0_16px_50px_rgba(10,12,16,0.16),0_2px_8px_rgba(10,12,16,0.06)]"
      style={{ ["--brand" as string]: brand, ["--on-brand" as string]: onBrand }}
    >
      {asking && supportSlug ? (
        <iframe
          src={`/widget/${supportSlug}`}
          title="Ask Second Pair's assistant"
          className="h-[30rem] w-full border-0"
        />
      ) : (
        <div className="relative h-[30rem]">
          {/* The identity, floating on glass — the real widget's header. */}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 p-3">
            <div className="flex w-fit items-center gap-2.5 rounded-full border border-border bg-surface/75 py-1.5 pl-1.5 pr-4 shadow-[var(--shadow-card)] backdrop-blur-xl">
              <span
                className="grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold"
                style={{ background: brand, color: onBrand }}
                aria-hidden
              >
                {initials}
              </span>
              <div className="min-w-0">
                <div className="truncate text-[0.8rem] font-semibold leading-tight">{business}</div>
                <div className="flex items-center gap-1.5 text-[0.68rem] leading-tight text-muted">
                  {thinking ? (
                    <>
                      <span className="flex gap-[3px]" aria-hidden>
                        {[0, 1].map((d) => (
                          <span
                            key={d}
                            className="breathe size-[3px] rounded-full"
                            style={{ background: brand, animationDelay: `${d * 400}ms` }}
                          />
                        ))}
                      </span>
                      Typing
                    </>
                  ) : (
                    <>
                      <span className="size-1.5 rounded-full bg-[#22c55e]" aria-hidden />
                      Answering now
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/*
            * Offered, never started, for anybody who asked for less motion.
            *
            * It sits over the finished conversation rather than replacing it,
            * so the page still says what the product does before anybody
            * presses anything. A press is consent — the same bargain a video
            * makes with the same setting.
            */}
          {stillPreferred && !live && (
            <button
              type="button"
              onClick={() => {
                setLines([]);
                setLive(true);
              }}
              className="absolute inset-x-0 bottom-4 z-20 mx-auto flex w-fit items-center gap-2 rounded-full border border-border bg-surface/95 px-4 py-2.5 text-[13px] font-medium shadow-[var(--shadow-pop)] backdrop-blur"
            >
              <svg width="13" height="13" viewBox="0 0 12 12" aria-hidden="true">
                <path d="M2.5 1.5v9l8-4.5-8-4.5Z" fill="currentColor" />
              </svg>
              Watch it happen
            </button>
          )}

          <div
            ref={thread}
            /*
             * Clear of the composer, which floats over this rather than sitting
             * beside it. The padding has to beat the composer's height — it was
             * set to exactly match, which left the last card sitting flush
             * against it with the bottom border tucked underneath.
             */
            className="h-full space-y-1 overflow-y-auto px-3.5 pb-[8.5rem] pt-[4.5rem]"
            aria-live="polite"
          >
            {lines.map((line, i) => {
              const mine = line.from === "them";
              const next = lines[i + 1];
              const last = !next || next.from !== line.from;

              // Only the newest card of a kind is live, exactly as in the real
              // widget — see the note on `retires` there.
              const card =
                line.moment &&
                !lines.some((l, j) => j > i && l.moment && retires(l.moment.kind, line.moment!.kind))
                  ? line.moment
                  : null;

              return (
                <div key={i} className="contents">
                  <div className={`flex items-end gap-2 ${mine ? "flex-row-reverse" : ""}`}>
                    {!mine &&
                      (last ? (
                        <span
                          className="grid size-7 shrink-0 place-items-center rounded-full text-[10px] font-semibold"
                          style={{ background: brand, color: onBrand }}
                          aria-hidden
                        >
                          {initials}
                        </span>
                      ) : (
                        <span className="size-7 shrink-0" />
                      ))}
                    <div
                      className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                        live ? "motion-safe:animate-[rise_200ms_ease-out]" : ""
                      } ${
                        mine
                          ? `${last ? "rounded-br-md" : ""}`
                          : `bg-surface-2 text-foreground ${last ? "rounded-bl-md" : ""}`
                      }`}
                      style={mine ? { background: brand, color: onBrand } : undefined}
                    >
                      {line.text}
                    </div>
                  </div>

                  {card && (
                    <div className="flex flex-col gap-2 pl-9 pt-1">
                      <MomentCard
                        moment={card}
                        brand={brand}
                        onBrand={onBrand}
                        disabled
                        pressed={card.kind === "slots" ? pressed : null}
                        onPick={() => {}}
                      />
                    </div>
                  )}
                </div>
              );
            })}

            {thinking && (
              <div className="flex items-end gap-2 pt-1">
                <span
                  className="grid size-7 shrink-0 place-items-center rounded-full text-[10px] font-semibold"
                  style={{ background: brand, color: onBrand }}
                  aria-hidden
                >
                  {initials}
                </span>
                <div className="rounded-2xl rounded-bl-md bg-surface-2 px-4 py-3.5">
                  <span className="flex gap-1" role="status" aria-label="Typing">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="size-1.5 rounded-full bg-muted/70 motion-safe:animate-bounce"
                        style={{ animationDelay: `${i * 140}ms`, animationDuration: "1s" }}
                      />
                    ))}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* The composer, with the customer's half being typed into it. */}
          <div className="absolute inset-x-0 bottom-0 bg-background px-3.5 pb-3.5 pt-3">
            <div className="flex items-end gap-1.5 rounded-2xl border border-border bg-surface p-1.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl text-muted" aria-hidden>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 11.5 12.2 19.3a4.6 4.6 0 0 1-6.5-6.5l7.8-7.8a3 3 0 1 1 4.3 4.3l-7.8 7.8a1.5 1.5 0 0 1-2.1-2.1l7.2-7.2" />
                </svg>
              </span>
              <p className="flex-1 py-2 text-sm text-foreground">
                {draft || <span className="text-muted/70">Write a message…</span>}
                {draft && <span className="ml-px inline-block w-px animate-pulse">|</span>}
              </p>
              <span
                className="grid size-11 shrink-0 place-items-center rounded-xl transition-opacity"
                style={{ background: brand, color: onBrand, opacity: draft ? 1 : 0.35 }}
                aria-hidden
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4.5 12h13M12 6.5 17.5 12 12 17.5" />
                </svg>
              </span>
            </div>
            <p className="mt-2 text-center text-[11px] text-muted">
              Answered by an assistant · a human sees everything
            </p>
          </div>
        </div>
      )}

      {supportSlug && (
        <button
          type="button"
          onClick={() => {
            // Clear the hash on the way back, otherwise the link that opened
            // this is already "used" and pressing it again does nothing.
            if (asking && window.location.hash === "#ask") {
              history.replaceState(null, "", window.location.pathname);
            }
            setAsking((a) => !a);
          }}
          className="w-full border-t border-border py-2.5 text-center text-[12px] font-medium text-highlight-strong transition-colors hover:bg-surface-2"
        >
          {asking ? "← Back to the demo" : "Ask ours anything, right now →"}
        </button>
      )}
    </div>
  );
}

function lastSlots(script: readonly Beat[]) {
  for (let i = script.length - 1; i >= 0; i--) {
    const beat = script[i];
    if (beat.who === "us" && beat.moment?.kind === "slots") return beat.moment;
  }
  return null;
}
