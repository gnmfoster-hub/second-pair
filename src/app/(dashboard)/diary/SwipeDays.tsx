"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Swipe left and right to change the day.
 *
 * The arrows are at the top of the screen, which on a phone is the hardest
 * place for a thumb to reach and the furthest from where the eyes are. Every
 * calendar anybody has used on a phone moves a day when you push the day
 * sideways, and a diary that does not feels like a website.
 *
 * Deliberately touch only. A mouse has the arrows, a trackpad's horizontal
 * scroll would fire this constantly, and nothing here should change what a
 * keyboard does.
 */
export function SwipeDays({ back, forward }: { back: string; forward: string }) {
  const router = useRouter();

  // In a ref rather than state: these are read inside listeners that are set up
  // once, and re-binding them on every render would drop a gesture in progress.
  const links = useRef({ back, forward });
  links.current = { back, forward };

  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let tracking = false;

    const onStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;

      /*
       * Not if the finger landed on something that scrolls sideways itself.
       *
       * The person chips scroll, and so does anything wide inside an entry. A
       * swipe starting there is the user scrolling that thing, and stealing it
       * to change the day would make those controls unusable.
       */
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-no-swipe], input, textarea, select, [role=dialog]")) {
        tracking = false;
        return;
      }

      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
      tracking = true;
    };

    const onEnd = (event: TouchEvent) => {
      if (!tracking) return;
      tracking = false;

      const touch = event.changedTouches[0];
      if (!touch) return;

      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;

      /*
       * Sideways, and meant.
       *
       * 60px so a slightly untidy vertical scroll does not change the day, and
       * twice as far across as down so the gesture has to be deliberately
       * horizontal — reading a long list involves a lot of not-quite-straight
       * dragging.
       */
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 2) return;

      // Left means forward, the way a page turns.
      router.push(dx < 0 ? links.current.forward : links.current.back);
    };

    // Passive: this never calls preventDefault, so the browser is free to keep
    // scrolling at sixty frames a second while it watches.
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });

    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend", onEnd);
    };
  }, [router]);

  return null;
}
