"use client";

import { useEffect, useState } from "react";

/**
 * The booking on the clipboard.
 *
 * Kept in sessionStorage rather than in React state because the thing
 * somebody copies on Tuesday is nearly always pasted on Thursday, and moving
 * between days in this diary is a page load. State would be gone by the time
 * they got there, which is the one moment the feature exists for.
 *
 * Session rather than local: a copy is for the next minute. Finding last
 * week's booking still on the clipboard on Monday morning would be a trap
 * rather than a convenience.
 */

export type Copied = {
  id: string;
  /** Who or what it is, for the bar along the bottom. */
  what: string;
  /** How long it takes, said in the bar so a paste holds no surprise. */
  minutes: number;
};

const KEY = "diary.copied";
/* Storage events only reach other tabs, so this one carries it across the
 * components in this one. */
const CHANGED = "diary-copied-changed";

export function readCopied(): Copied | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Copied) : null;
  } catch {
    /* Private windows, blocked storage, a half-written value. Copying is a
     * convenience and must never be the reason the diary will not draw. */
    return null;
  }
}

export function writeCopied(copied: Copied | null): void {
  try {
    if (copied) sessionStorage.setItem(KEY, JSON.stringify(copied));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* Nothing to do about it, and nothing it breaks. */
  }
  window.dispatchEvent(new Event(CHANGED));
}

/** What is on the clipboard, kept in step across the page. */
export function useCopied(): Copied | null {
  const [copied, setCopied] = useState<Copied | null>(null);

  useEffect(() => {
    const read = () => setCopied(readCopied());
    read();
    window.addEventListener(CHANGED, read);
    /* And from another tab, where the storage event is the only signal. */
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(CHANGED, read);
      window.removeEventListener("storage", read);
    };
  }, []);

  return copied;
}
