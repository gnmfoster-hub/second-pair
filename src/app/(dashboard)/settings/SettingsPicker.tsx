"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Settings on a phone or a tablet: one control, not a sideways scroll.
 *
 * The same groups run down the side from a laptop upwards, where there is room
 * for them. Narrower than that they were a row that scrolled, with each
 * group's heading sitting above its own links — which works right up until
 * somebody scrolls, and then a heading is stranded over a gap with its links
 * off one edge and the next group's cut through the middle of a word.
 *
 * That was replaced with the browser's own <select>, grouped with optgroups,
 * on the reasoning that a native control cannot overflow and opens as a proper
 * list on a phone. All true, and all beside the point: it is a grey system
 * dropdown in the middle of a product that had just been given two hand-built
 * sheets, and Giles's word for it was horrible. He is right. It was the only
 * menu in the app that looked like it belonged to the browser rather than to
 * the business, and settings is where somebody spends their first evening.
 *
 * So it is the same sheet as the account corner and the public site's menu:
 * full width, a 2px ink edge, 56px rows at 17px with an arrow, and the groups
 * kept as headings rather than thrown away. Three menus, one behaviour.
 */
export function SettingsPicker({
  groups,
}: {
  groups: { title: string; links: { href: string; label: string }[] }[];
}) {
  const here = usePathname();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  /*
   * Longest match wins. "/settings" is the start of every other settings
   * address, so a plain startsWith puts the business page in the box on every
   * screen — the one thing this control must never get wrong is saying where
   * you are.
   */
  const links = groups.flatMap((g) => g.links);
  const current =
    links
      .filter((l) => here === l.href || here.startsWith(l.href + "/"))
      .sort((a, b) => b.href.length - a.href.length)[0] ?? null;

  /* Escape closes it, and so does a tap anywhere else — as in the other two. */
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onTap = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };

    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onTap);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onTap);
    };
  }, [open]);

  return (
    <div ref={box} className="lg:hidden">
      <div className="label">Settings</div>

      {/*
        * The button says where you are, which is the job the closed <select>
        * was doing and the one thing that must survive the rebuild.
        */}
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="mt-1 flex min-h-[52px] w-full items-center justify-between gap-3 rounded-2xl px-4 text-[17px] font-medium transition-colors hover:bg-surface-2 active:bg-surface-2"
        style={{ border: "2px solid var(--foreground)", background: "var(--surface)" }}
      >
        {current?.label ?? "Choose a setting"}
        {/* A chevron that turns over, so the button says what it will do. */}
        <span
          aria-hidden
          className="text-muted transition-transform duration-200"
          style={{ transform: open ? "rotate(180deg)" : "none" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </button>

      {open && (
        <div
          role="menu"
          /*
            * Fixed and full width, like the other two, so it is never clipped
            * by whatever it is sitting inside and never needs the page to
            * make room for it.
            *
            * It can outgrow a phone screen — there are ten of these across
            * four groups — so this one scrolls where the others do not, capped
            * below the viewport rather than at a guessed number of rows.
            */
          className="fixed inset-x-3 top-[112px] z-40 overflow-y-auto rounded-[22px] p-2"
          style={{
            maxHeight: "calc(100dvh - 140px)",
            background: "var(--surface)",
            border: "2px solid var(--foreground)",
            boxShadow: "0 24px 50px -20px rgba(22,21,15,0.5)",
          }}
        >
          {groups.map((group, i) => (
            <div key={group.title} className={i ? "mt-1" : ""}>
              {/*
                * The group headings are kept.
                *
                * They are the reason this is not a flat list of ten: "Around a
                * booking" and "Your details" is how somebody finds a setting
                * they cannot name, and the optgroups were carrying that.
                */}
              <div
                className="px-4 pb-1 pt-2 text-[11px] uppercase tracking-wide text-muted"
                style={i ? { borderTop: "1px solid var(--border)" } : undefined}
              >
                {group.title}
              </div>

              {group.links.map((link) => {
                const on = link.href === current?.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    aria-current={on ? "page" : undefined}
                    className={`flex min-h-[56px] items-center justify-between gap-3 rounded-2xl px-4 text-[17px] transition-colors hover:bg-surface-2 active:bg-surface-2 ${
                      on ? "bg-surface-2 font-medium" : ""
                    }`}
                  >
                    {link.label}
                    <span aria-hidden className="text-muted">
                      &rarr;
                    </span>
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
