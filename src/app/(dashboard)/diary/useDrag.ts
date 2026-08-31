"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Dragging in the diary.
 *
 * Three gestures share one piece of state because they are the same gesture
 * with different intent: pick an entry up and move it, pull its bottom edge to
 * change how long it is, or drag across empty grid to create something.
 *
 * Pointer events rather than mouse events, so it works with a finger and a
 * stylus, and setPointerCapture means the drag survives the pointer leaving
 * the element — which it will, constantly, because the whole point is moving
 * between columns.
 *
 * Nothing commits until the pointer is released, and a drag under the
 * threshold is treated as a click. Otherwise every attempt to open an entry
 * would nudge it a few minutes.
 */

export const SNAP_MINUTES = 15;
/** Below this it was a click, not a drag. */
const SLOP_PX = 4;

export type DragKind = "move" | "resize" | "create";

export type Drag = {
  kind: DragKind;
  /** The entry being moved or resized. Absent when creating. */
  id?: string;
  /** Minutes from midnight, snapped. */
  startMinutes: number;
  endMinutes: number;
  /** Which column it is currently over. */
  columnKey: string;
  /** Whether it has passed the slop threshold and is really a drag. */
  live: boolean;
};

type Origin = {
  kind: DragKind;
  id?: string;
  pointerX: number;
  pointerY: number;
  /** Where in the entry it was grabbed, so it does not jump to the cursor. */
  grabOffsetMinutes: number;
  originalStart: number;
  originalEnd: number;
  columnKey: string;
};


/**
 * Where a drag lands.
 *
 * Pulled out of the pointer handler so it can be tested without a browser:
 * this is the part with the arithmetic in it, and the part that would silently
 * put an appointment at half past midnight if it were wrong.
 */
export function nextTimes(
  kind: DragKind,
  originalStart: number,
  originalEnd: number,
  deltaMinutes: number,
): { startMinutes: number; endMinutes: number } {
  const length = originalEnd - originalStart;

  if (kind === "move") {
    // Clamped so an entry cannot be dragged off either end of the day, and
    // keeping its length rather than squashing against the edge.
    const startMinutes = Math.max(0, Math.min(1440 - length, originalStart + deltaMinutes));
    return { startMinutes, endMinutes: startMinutes + length };
  }

  if (kind === "resize") {
    // Never shorter than one snap step, or it becomes too small to grab again.
    return {
      startMinutes: originalStart,
      endMinutes: Math.min(
        1440,
        Math.max(originalStart + SNAP_MINUTES, originalEnd + deltaMinutes),
      ),
    };
  }

  // Creating. The anchor is where the pointer went down, and dragging upwards
  // is allowed — people do it constantly when the slot they want is above.
  const to = Math.max(0, Math.min(1440, originalStart + deltaMinutes));
  const startMinutes = Math.min(originalStart, to);
  const endMinutes = Math.max(originalStart, to);

  // The minimum applies to the length, not to the end. Flooring the end at
  // anchor + one step made an upward drag overshoot past where it began:
  // pulling up from 10:00 gave 08:30 to 10:15.
  return endMinutes - startMinutes >= SNAP_MINUTES
    ? { startMinutes, endMinutes }
    : { startMinutes, endMinutes: Math.min(1440, startMinutes + SNAP_MINUTES) };
}

export function useDrag({
  hourHeight,
  columnKeyAt,
  onCommit,
}: {
  hourHeight: number;
  /** Which column a page x-coordinate is over, or null if it is outside. */
  columnKeyAt: (clientX: number) => string | null;
  onCommit: (drag: Drag) => void;
}) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const origin = useRef<Origin | null>(null);
  const current = useRef<Drag | null>(null);

  const snap = useCallback(
    (minutes: number) => Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES,
    [],
  );

  const begin = useCallback(
    (
      event: React.PointerEvent,
      opts: {
        kind: DragKind;
        id?: string;
        startMinutes: number;
        endMinutes: number;
        columnKey: string;
      },
    ) => {
      // Only the primary button. A right-click should never move an appointment.
      if (event.button !== 0) return;
      event.stopPropagation();
      (event.target as Element).setPointerCapture?.(event.pointerId);

      const box = event.currentTarget.getBoundingClientRect();
      const grabbedAt = ((event.clientY - box.top) / hourHeight) * 60;

      origin.current = {
        kind: opts.kind,
        id: opts.id,
        pointerX: event.clientX,
        pointerY: event.clientY,
        grabOffsetMinutes: opts.kind === "move" ? grabbedAt : 0,
        originalStart: opts.startMinutes,
        originalEnd: opts.endMinutes,
        columnKey: opts.columnKey,
      };

      const started: Drag = {
        kind: opts.kind,
        id: opts.id,
        startMinutes: opts.startMinutes,
        endMinutes: opts.endMinutes,
        columnKey: opts.columnKey,
        live: false,
      };
      current.current = started;
      setDrag(started);
    },
    [hourHeight],
  );

  useEffect(() => {
    if (!drag) return;

    const move = (event: PointerEvent) => {
      const from = origin.current;
      if (!from) return;

      const dy = event.clientY - from.pointerY;
      const dx = event.clientX - from.pointerX;
      const live =
        current.current?.live || Math.abs(dy) > SLOP_PX || Math.abs(dx) > SLOP_PX;
      if (!live) return;

      const deltaMinutes = snap((dy / hourHeight) * 60);
      const column = columnKeyAt(event.clientX) ?? from.columnKey;

      const { startMinutes, endMinutes } = nextTimes(
        from.kind,
        from.originalStart,
        from.originalEnd,
        deltaMinutes,
      );

      const next: Drag = {
        kind: from.kind,
        id: from.id,
        startMinutes,
        endMinutes,
        columnKey: from.kind === "resize" ? from.columnKey : column,
        live: true,
      };
      current.current = next;
      setDrag(next);
    };

    const finish = () => {
      const done = current.current;
      origin.current = null;
      current.current = null;
      setDrag(null);
      // A drag that never passed the threshold was a click; the element's own
      // onClick has already handled it.
      if (done?.live) onCommit(done);
    };

    const cancel = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      origin.current = null;
      current.current = null;
      setDrag(null);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    window.addEventListener("keydown", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      window.removeEventListener("keydown", cancel);
    };
  }, [drag, hourHeight, columnKeyAt, onCommit, snap]);

  return { drag: drag?.live ? drag : null, begin };
}

/** "9:30 am", from minutes since midnight. */
export function clockOf(minutes: number): string {
  const h24 = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const period = h24 < 12 ? "am" : "pm";
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${String(m).padStart(2, "0")} ${period}`;
}

/** "1h 30m", for the badge that follows a drag. */
export function lengthOf(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}
