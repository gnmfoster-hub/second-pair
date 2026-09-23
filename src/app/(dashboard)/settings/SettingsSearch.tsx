"use client";

import { useState } from "react";
import Link from "next/link";
import { findSettings } from "@/lib/settingsSearch";

/**
 * A box at the top of the settings rail that finds a setting by name.
 *
 * Giles: "can we have a search function in the settings area to find things."
 *
 * Thirteen pages and well over a hundred fields, and the rail can only tell
 * you which page something is on if you already know which group it belongs
 * to. He has been caught by this twice himself — once looking for the review
 * setting, which was two fields on the business page, and once looking for
 * where to name a person's own business.
 *
 * It searches settings, not pages. "Deposit" lands on the deposit rule rather
 * than on a page called Business that happens to contain it, and each result
 * says which page it is on so the next look is unaided.
 *
 * No results box until two characters are typed: one letter matches half of
 * everything, and a list that appears on the first keystroke covers the rail
 * somebody may have been about to use instead.
 */
export function SettingsSearch({ owner }: { owner: boolean }) {
  const [query, setQuery] = useState("");
  const found = findSettings(query, { owner });
  const asked = query.trim().length >= 2;

  return (
    <div className="mb-5">
      <label className="block">
        <span className="sr-only">Find a setting</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a setting"
          className="input w-full"
          autoComplete="off"
        />
      </label>

      {/* A hairline under the answers, or the first one reads as the first
          item of the rail heading below it. */}
      {asked && (
        <div className="mt-2 border-b border-border pb-4">
          {found.length === 0 ? (
            /*
             * Said plainly rather than shown as an empty space. "Nothing
             * matched" is an answer; a box that simply stays blank reads as a
             * search that has not finished.
             */
            <p className="hint px-2.5">
              Nothing matched. Try what the thing does rather than what it is called —
              &ldquo;no show&rdquo;, &ldquo;deposit&rdquo;, &ldquo;colour&rdquo;.
            </p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {found.map((s) => (
                <li key={`${s.href}-${s.label}`}>
                  <Link
                    href={s.href}
                    onClick={() => setQuery("")}
                    className="block rounded-lg px-2.5 py-1.5 text-sm hover:bg-surface-2"
                  >
                    {s.label}
                    {/* Where it is, so the next look does not need the box. */}
                    <span className="hint block">{s.page}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
