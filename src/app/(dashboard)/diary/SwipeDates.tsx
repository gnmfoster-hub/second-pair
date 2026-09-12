"use client";

import { useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";

/**
 * Push the diary sideways to change the date.
 *
 * The arrows are small and sit at the top of the screen, which on a phone is
 * the furthest point from a thumb. Dragging is what every calendar does, and
 * this follows the same links the arrows do — a day in the day view, a week in
 * the week, a month in the month, keeping whoever is being looked at.
 *
 * It covers the whole diary, not the strip of date at the top. That was the
 * first version and it did not work in any way somebody would find: the date
 * row is forty pixels of a screen, and a gesture has to begin inside the thing
 * that is listening. Nobody aims at a header to turn a page — they push the
 * page.
 *
 * Two things inside keep their own drag, marked data-keeps-its-drag: the grid,
 * whose columns run off the side of a phone, and the row of person chips.
 * Stealing from either would make it unusable, and dragging a booking to
 * another stylist would turn into next week.
 *
 * On its own element rather than on the window, so there is exactly one thing
 * on this page deciding to navigate. Two listeners both doing it would push
 * twice and land two days out.
 *
 * Deliberately touch only. A trackpad's sideways scroll would fire this
 * constantly, and a mouse has the arrows.
 */
export function SwipeDates({
  back,
  forward,
  children,
}: {
  back: string;
  forward: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const from = useRef<{ x: number; y: number } | null>(null);

  return (
    <div
      /*
       * So the window-level swipe leaves this alone. Without it a drag here
       * would be heard twice — once by that and once by this — and the diary
       * would jump two days for one gesture.
       */
      data-no-swipe
      onTouchStart={(event) => {
        // One finger. A pinch or a two-fingered scroll is not a page turn.
        if (event.touches.length !== 1) {
          from.current = null;
          return;
        }

        /*
         * Not if the finger landed on something that scrolls sideways itself.
         *
         * This covers the whole diary now rather than the thin strip of date
         * at the top, which is the only way it is findable — but inside it are
         * two things that own a sideways drag: the grid, where the columns run
         * off the side of a phone, and the row of person chips. Taking their
         * gesture would make both unusable, and moving a booking to another
         * stylist would turn into next week.
         */
        if ((event.target as Element | null)?.closest?.("[data-keeps-its-drag]")) {
          from.current = null;
          return;
        }

        from.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
      }}
      onTouchEnd={(event) => {
        const started = from.current;
        from.current = null;
        if (!started) return;

        const touch = event.changedTouches[0];
        if (!touch) return;

        const across = touch.clientX - started.x;
        const down = Math.abs(touch.clientY - started.y);

        /*
         * Far enough to be meant, and clearly sideways.
         *
         * Sixty pixels so a slightly untidy scroll does not move the week, and
         * twice as far across as down because this bar is at the top of a page
         * people scroll — most of what happens here is a finger on its way
         * somewhere else.
         *
         * A tap is nought pixels, so every button inside still behaves exactly
         * as it did: nothing is intercepted, and nothing is prevented.
         */
        if (Math.abs(across) < 60 || Math.abs(across) < down * 2) return;

        // Left means forward, the way a page turns.
        router.push(across < 0 ? forward : back);
      }}
      onTouchCancel={() => (from.current = null)}
    >
      {children}
    </div>
  );
}
