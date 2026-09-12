"use client";

import { useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";

/**
 * Push the date bar sideways to change the date.
 *
 * The arrows are small, and on a phone they sit at the top of the screen,
 * which is the furthest point from a thumb. Dragging the dates themselves is
 * what every calendar on a phone does, and it works in whatever view is open
 * because it follows the same links the arrows do — a day in the day view, a
 * week in the week, a month in the month.
 *
 * On its own element rather than on the window, which matters. There is
 * already a window-level swipe for the day list, and two listeners both
 * deciding to navigate would push twice and land two days away; this one only
 * ever hears what happens inside the bar, and the bar opts out of the other
 * with data-no-swipe.
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
        from.current =
          event.touches.length === 1
            ? { x: event.touches[0].clientX, y: event.touches[0].clientY }
            : null;
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
