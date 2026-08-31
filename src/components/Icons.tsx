/*
 * The nav set. Sixteen pixels, 1.5 stroke, drawn on the same grid so they sit
 * together — mixing icon sets is the quickest way to make a sidebar look
 * assembled rather than designed.
 */

type IconProps = { className?: string };

const base = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function InboxIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3 12h4l2 3h6l2-3h4" />
      <path d="M5.5 5h13l2.5 7v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Z" />
    </svg>
  );
}

export function DiaryIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

export function ClientsIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="9" cy="8" r="3.25" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <path d="M16 5.5a3 3 0 0 1 0 5.5M17.5 20a6 6 0 0 0-2-4.5" />
    </svg>
  );
}

export function WeekIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3 20h18" />
      <path d="M6 20v-5M11 20v-9M16 20v-6M21 20v-11" />
    </svg>
  );
}

export function SettingsIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6" />
    </svg>
  );
}

/**
 * The mark.
 *
 * A message that has been dealt with: a bubble with the tail squared off, and
 * a tick through it. It has to survive being 20px in a sidebar, so it is two
 * shapes and no detail.
 */
export function Mark({ className = "size-7" }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <path
        d="M6 4h20a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H14l-8 6V4Z"
        fill="var(--accent)"
      />
      <path
        d="m11 13 3.6 3.6L21.5 9.5"
        fill="none"
        stroke="#fff"
        strokeWidth="2.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
