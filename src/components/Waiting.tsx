/**
 * The mark, waiting.
 *
 * The Second Pair mark is a speech bubble with two dots — which is the typing
 * indicator everybody already recognises, and two of them for the pair. On an
 * empty inbox that is not decoration: it is the assistant sitting there ready,
 * which is exactly what the page is trying to say.
 *
 * The dots breathe in turn, slowly. Slowly matters — anything quicker reads as
 * loading, and this is not loading, it is waiting.
 *
 * Server-rendered; the animation is CSS, so it costs nothing and stops on its
 * own for anybody who has asked for less motion.
 */
export function Waiting({ className = "size-14" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 76 74"
      className={className}
      role="img"
      aria-label="Your assistant, waiting"
    >
      <path
        d="M18 0h40a18 18 0 0 1 18 18v22a18 18 0 0 1-18 18H36l-20 16V58h-.5A17.5 17.5 0 0 1 0 40.5V18A18 18 0 0 1 18 0Z"
        fill="var(--logo-bubble)"
        opacity="0.16"
      />
      <circle cx="26" cy="28" r="7" fill="var(--logo-bubble)" className="breathe" />
      <circle
        cx="50"
        cy="28"
        r="7"
        fill="var(--highlight)"
        className="breathe"
        style={{ animationDelay: "700ms" }}
      />
    </svg>
  );
}
