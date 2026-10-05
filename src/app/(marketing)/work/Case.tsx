import type { CSSProperties, ReactNode } from "react";
import { Passing } from "../home/scroll";

/**
 * One piece of work, given a whole screen.
 *
 * These were a paragraph each in a three-column list, with a screenshot
 * further down the page that the paragraph did not sit beside. Somebody
 * deciding whether to ring wants to look at the thing, so each one is now its
 * own band: the name at headline size, what we did for them, and the live
 * site in a frame that scrolls through its own page as this one goes past.
 *
 * The picture is of the live site and the link goes to it. Nothing here is a
 * mock-up.
 */

/** The frame shows this much of a 720-wide picture at a time. */
const VIEW = 520;

export function Case({
  name,
  children,
  did,
  href,
  domain,
  src,
  height,
  alt,
  night,
  flip,
}: {
  name: ReactNode;
  children: ReactNode;
  /** What we did for them, as short labels. */
  did: string[];
  href: string;
  domain: string;
  src: string;
  height: number;
  alt: string;
  night?: boolean;
  /** Picture on the left. */
  flip?: boolean;
}) {
  return (
    <section className={`sp-case${night ? " sp-night" : ""}`} data-flip={flip ? "" : undefined}>
      <Passing
        className="shell sp-case-in"
        style={{ "--max": (((height - VIEW) / height) * 100).toFixed(2) } as CSSProperties}
      >
        <div className="sp-case-words">
          <h3 className="font-display sp-case-name">{name}</h3>
          <p>{children}</p>
          <ul>
            {did.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
          <a href={href} target="_blank" rel="noopener noreferrer" className="sp-case-link">
            {domain}
            <span aria-hidden> →</span>
          </a>
        </div>

        <a href={href} target="_blank" rel="noopener noreferrer" className="sp-frame sp-case-frame">
          <div className="sp-frame-bar" aria-hidden>
            <i />
            <i />
            <i />
            <span>{domain}</span>
          </div>
          <div className="sp-site-view">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={alt} width={720} height={height} loading="lazy" decoding="async" />
          </div>
        </a>
      </Passing>
    </section>
  );
}
