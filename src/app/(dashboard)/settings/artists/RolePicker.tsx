"use client";

import { useState } from "react";

/**
 * What this person does.
 *
 * The trade pack suggests the usual ones — a tattoo studio has a piercer, a
 * salon has a nail technician — but the last option is always a box to type in.
 * Businesses name their people in their own words, and a fixed list would
 * either be wrong or be a list somebody has to keep arguing with.
 *
 * Optional throughout. A one-person business has no use for this, and being
 * made to pick a role for yourself is the kind of small friction that makes
 * software feel like paperwork.
 */
export function RolePicker({
  suggested,
  value,
}: {
  /** The roles this trade usually has. May be empty. */
  suggested: string[];
  value: string | null;
}) {
  // Something typed rather than picked stays in the box, so it can be edited
  // rather than having to be retyped from scratch.
  const isCustom = Boolean(value) && !suggested.includes(value ?? "");
  const [role, setRole] = useState(value ?? "");
  const [typing, setTyping] = useState(isCustom);

  return (
    <div>
      <input type="hidden" name="role" value={role} />

      {suggested.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggested.map((option) => {
            const chosen = role === option;
            return (
              <button
                key={option}
                type="button"
                aria-pressed={chosen}
                onClick={() => {
                  // Pressing the chosen one again clears it, because there is
                  // no other way to go back to having no role.
                  setRole(chosen ? "" : option);
                  setTyping(false);
                }}
                className={`rounded-full px-3 py-1 text-xs transition-colors ${
                  chosen
                    ? "bg-accent text-white"
                    : "border border-border text-muted hover:text-foreground"
                }`}
              >
                {option}
              </button>
            );
          })}

          <button
            type="button"
            aria-pressed={typing}
            onClick={() => {
              setTyping(true);
              if (suggested.includes(role)) setRole("");
            }}
            className={`rounded-full px-3 py-1 text-xs transition-colors ${
              typing
                ? "bg-accent text-white"
                : "border border-dashed border-border text-muted hover:text-foreground"
            }`}
          >
            Something else
          </button>
        </div>
      )}

      {(typing || suggested.length === 0) && (
        <input
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="Creative director"
          aria-label="What this person does"
          className="input mt-2 max-w-xs"
          autoFocus={typing && suggested.length > 0}
        />
      )}
    </div>
  );
}
