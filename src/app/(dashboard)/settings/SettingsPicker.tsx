"use client";

import { useRouter, usePathname } from "next/navigation";

/**
 * Settings on a phone or a tablet: one control, not a sideways scroll.
 *
 * The same groups run down the side from a laptop upwards, where there is room
 * for them. Narrower than that they were a row that scrolled, with each
 * group's heading sitting above its own links — which works right up until
 * somebody scrolls, and then a heading is stranded over a gap with its links
 * off one edge and the next group's cut through the middle of a word. Two
 * headings and four and a half labels, none of them lined up with anything.
 *
 * A grouped picker says the same thing in the space available: where you are,
 * what else there is, and which parts belong together. It is the browser's own
 * control, so it opens as a proper list on a phone and a tidy menu on a
 * tablet, and nothing can overflow because nothing is laid out.
 */
export function SettingsPicker({
  groups,
}: {
  groups: { title: string; links: { href: string; label: string }[] }[];
}) {
  const router = useRouter();
  const here = usePathname();

  /*
   * Longest match wins. "/settings" is the start of every other settings
   * address, so a plain startsWith puts the business page in the box on every
   * screen — the one thing this control must never get wrong is saying where
   * you are.
   */
  const current =
    groups
      .flatMap((g) => g.links)
      .filter((l) => here === l.href || here.startsWith(l.href + "/"))
      .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? "/settings";

  return (
    <div className="lg:hidden">
      <label className="label" htmlFor="settings-picker">
        Settings
      </label>
      <select
        id="settings-picker"
        value={current}
        onChange={(e) => router.push(e.target.value)}
        className="input mt-1 w-full"
      >
        {groups.map((group) => (
          <optgroup key={group.title} label={group.title}>
            {group.links.map((link) => (
              <option key={link.href} value={link.href}>
                {link.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}
