/**
 * Is enough of this on screen to be worth starting?
 *
 * Pulled out of the homepage demo so it can be tested without a browser. It
 * decides whether the conversation has an audience yet, and getting it wrong
 * is not a visual glitch — it is a demo that either plays to nobody or never
 * plays at all.
 */
export function mostlyInView(
  box: { top: number; bottom: number; height: number },
  viewportHeight: number,
  /** How much of it has to be showing. */
  atLeast = 0.5,
): boolean {
  if (box.height <= 0 || viewportHeight <= 0) return false;

  const shown = Math.min(box.bottom, viewportHeight) - Math.max(box.top, 0);
  if (shown <= 0) return false;

  /*
   * Measured against whichever is smaller, the element or the screen.
   *
   * Comparing against the element's own height alone looks right and quietly
   * fails on a small phone: a panel taller than the viewport can never have
   * half of itself showing, so the demo would wait forever on exactly the
   * devices it was meant to be fixed for. What is being asked is "is this
   * filling the screen enough to be what somebody is looking at", and past the
   * point where it is taller than the screen, the screen is the honest
   * denominator.
   */
  return shown / Math.min(box.height, viewportHeight) >= atLeast;
}
