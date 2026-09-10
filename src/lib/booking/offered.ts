/**
 * Reading back the times that were already offered.
 *
 * The slots tool writes each time it hands over as `(starts_at: <iso>)` in its
 * own result, and that result is kept on the assistant's message. This is how
 * "have you got anything else" is answered: the times already read out are
 * pulled back out of the record and left out of the next search.
 *
 * Its own file, and its own test, because the first version used `\S+` and so
 * captured the closing bracket with every timestamp. Nothing failed. The
 * timestamps simply all parsed as invalid, the list of times to avoid came out
 * empty, and the assistant carried on free to offer the exact times somebody
 * had just turned down — which is the entire fault this was written to fix. A
 * silent parser is worth a test on its own.
 */

export type ToolTrace = { name?: string; result?: string } | null | undefined;

/** Every ISO start named in one tool result. */
export function timesIn(result: string): string[] {
  return [...result.matchAll(/starts_at: ([^)\s]+)/g)].map((hit) => hit[1]);
}

/**
 * Every time offered across a conversation's stored tool traces.
 *
 * Deduplicated, because the same slot is often offered more than once across a
 * conversation and there is no sense excluding it twice.
 */
export function offeredIn(traces: (ToolTrace[] | null)[]): string[] {
  const found = new Set<string>();
  for (const calls of traces) {
    for (const call of calls ?? []) {
      if (call?.name !== "get_available_slots" || typeof call.result !== "string") continue;
      for (const time of timesIn(call.result)) found.add(time);
    }
  }
  return [...found];
}
