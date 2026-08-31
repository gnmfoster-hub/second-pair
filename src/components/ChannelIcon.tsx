import type { Channel } from "@/lib/types";

/**
 * Where an enquiry came in.
 *
 * Twelve pixels, one stroke weight, drawn on the same grid as the nav icons.
 * Deliberately not the platforms' own logos: using them would mean a licence
 * question, four different visual weights fighting each other in a list, and
 * a row of brand colours competing with the status pill that actually matters.
 */
const icon = {
  width: 12,
  height: 12,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function ChannelIcon({
  channel,
  className,
}: {
  channel: Channel;
  /** For sizing and alignment where twelve pixels on the baseline is wrong. */
  className?: string;
}) {
  const base = { ...icon, className };

  switch (channel) {
    case "whatsapp":
    case "messenger":
      // A bubble with a tail — the shape both of them share.
      return (
        <svg {...base}>
          <path d="M21 11.5a8 8 0 0 1-11.6 7.1L4 20l1.5-4.9A8 8 0 1 1 21 11.5Z" />
        </svg>
      );

    case "instagram":
      return (
        <svg {...base}>
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="3.5" />
          <path d="M17.5 6.5h.01" />
        </svg>
      );

    case "sms":
      return (
        <svg {...base}>
          <rect x="6" y="2" width="12" height="20" rx="2.5" />
          <path d="M10.5 18.5h3" />
        </svg>
      );

    case "email":
      return (
        <svg {...base}>
          <rect x="2.5" y="5" width="19" height="14" rx="2" />
          <path d="m3 7 9 6 9-6" />
        </svg>
      );

    case "voice":
      return (
        <svg {...base}>
          <path d="M4.5 5.5a2 2 0 0 1 2-2h2l1.5 4-2 1.5a12 12 0 0 0 5.5 5.5l1.5-2 4 1.5v2a2 2 0 0 1-2 2A16 16 0 0 1 4.5 5.5Z" />
        </svg>
      );

    default:
      // The website widget.
      return (
        <svg {...base}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3.5 12h17M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
        </svg>
      );
  }
}
