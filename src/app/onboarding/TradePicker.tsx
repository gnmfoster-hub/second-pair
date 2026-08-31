"use client";

import { useMemo, useState } from "react";
import { VERTICALS_BY_CATEGORY, searchTrades, type VerticalPack } from "@/lib/verticals";

/**
 * Picking your trade.
 *
 * Thirty-four options is too many for a radio list and far too many for a
 * phone, so this is a search box over a grouped list. Typing filters; not
 * typing shows the categories. The aliases matter as much as the labels — a
 * sparky types "sparky", not "electrician".
 */
export function TradePicker({ defaultValue = "general" }: { defaultValue?: string }) {
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState(defaultValue);

  const results = useMemo(() => (query.trim() ? searchTrades(query) : null), [query]);

  return (
    <div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search — plumber, nails, dog groomer…"
        className="input"
        aria-label="Search trades"
        autoComplete="off"
      />

      <input type="hidden" name="vertical" value={chosen} />

      <div className="mt-3 max-h-[22rem] overflow-y-auto rounded-xl border border-border">
        {results ? (
          results.length ? (
            <div className="p-1.5">
              {results.map((pack) => (
                <TradeOption
                  key={pack.id}
                  pack={pack}
                  chosen={chosen === pack.id}
                  onChoose={setChosen}
                />
              ))}
            </div>
          ) : (
            <div className="px-4 py-10 text-center">
              <p className="text-sm font-medium">Nothing matching &ldquo;{query}&rdquo;</p>
              <p className="hint mx-auto mt-1.5 max-w-xs">
                Pick <strong className="text-foreground">Something else</strong> — it does
                everything the others do, you just write your own services and wording.
              </p>
              <button
                type="button"
                onClick={() => {
                  setChosen("general");
                  setQuery("");
                }}
                className="btn-ghost mt-4"
              >
                Use Something else
              </button>
            </div>
          )
        ) : (
          VERTICALS_BY_CATEGORY.map((group) => (
            <section key={group.category}>
              <h3 className="sticky top-0 z-10 border-b border-border bg-surface-2/95 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted backdrop-blur">
                {group.category}
              </h3>
              <div className="p-1.5">
                {group.trades.map((pack) => (
                  <TradeOption
                    key={pack.id}
                    pack={pack}
                    chosen={chosen === pack.id}
                    onChoose={setChosen}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}

function TradeOption({
  pack,
  chosen,
  onChoose,
}: {
  pack: VerticalPack;
  chosen: boolean;
  onChoose: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChoose(pack.id)}
      aria-pressed={chosen}
      className={`flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
        chosen ? "bg-accent/10" : "hover:bg-surface-2"
      }`}
    >
      <span
        className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border ${
          chosen ? "border-accent bg-accent" : "border-border"
        }`}
      >
        {chosen && <span className="size-1.5 rounded-full bg-white" />}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{pack.label}</span>
        <span className="hint mt-0.5 block">{pack.blurb}</span>
      </span>
    </button>
  );
}
