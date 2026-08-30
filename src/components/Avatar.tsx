import type { Artist } from "@/lib/types";

/**
 * A face, or initials on a colour that is always the same for that person.
 *
 * Derived from the name rather than stored, so somebody who never uploads a
 * photo still reads as themselves in the diary rather than as a grey blank —
 * and their colour does not change when the row order does.
 */
const PALETTE = [
  "#c2410c",
  "#b45309",
  "#4d7c0f",
  "#047857",
  "#0e7490",
  "#1d4ed8",
  "#6d28d9",
  "#a21caf",
  "#be123c",
];

export function colourFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) % 100000;
  }
  return PALETTE[hash % PALETTE.length];
}

export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Public bucket, so this URL works in the widget on the studio's own site too. */
export function avatarUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/avatars/${path}`;
}

const SIZES = {
  xs: "size-6 text-[10px]",
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-16 text-lg",
} as const;

export function Avatar({
  person,
  size = "sm",
  className = "",
}: {
  person: Pick<Artist, "name" | "avatar_path" | "colour">;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const url = avatarUrl(person.avatar_path);
  const background = person.colour || colourFor(person.name);

  return (
    <span
      className={`inline-grid shrink-0 place-items-center overflow-hidden rounded-full font-medium text-white ${SIZES[size]} ${className}`}
      style={{ background }}
      title={person.name}
    >
      {url ? (
        // Supabase serves these; next/image would need the host allow-listed and
        // buys little for a 40px circle.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={person.name} className="size-full object-cover" />
      ) : (
        <span aria-hidden="true">{initialsFor(person.name)}</span>
      )}
      <span className="sr-only">{person.name}</span>
    </span>
  );
}

/** Overlapping faces, for showing a whole team in a small space. */
export function AvatarStack({
  people,
  max = 4,
}: {
  people: Pick<Artist, "name" | "avatar_path" | "colour">[];
  max?: number;
}) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;

  return (
    <span className="flex items-center">
      {shown.map((person, i) => (
        <Avatar
          key={person.name + i}
          person={person}
          size="xs"
          className={i === 0 ? "" : "-ml-2 ring-2 ring-surface"}
        />
      ))}
      {extra > 0 && (
        <span className="-ml-2 grid size-6 place-items-center rounded-full bg-surface-2 text-[10px] text-muted ring-2 ring-surface">
          +{extra}
        </span>
      )}
    </span>
  );
}
