/**
 * The phones and tablets signed up to be buzzed, said back to their owner.
 *
 * `push_subscriptions.last_used_at` is written every time a device is actually
 * reached, and the comment in `lib/notify` says exactly what it is for: "the
 * column somebody looks at to work out which of two devices has stopped
 * working". It had no screen. Found by the audit of columns the product writes
 * and never reads.
 *
 * The gap it leaves is a quiet one, which is the worst kind. A push
 * subscription dies without telling anybody — a phone replaced, a browser
 * clearing its site data, somebody turning notifications off at the operating
 * system. Nothing fails, no error appears; the phone simply stops buzzing, and
 * the owner finds out when a customer rings up about a message nobody answered.
 * Until this screen there was no way to look.
 *
 * ── The trap this has to avoid ──────────────────────────────────────────────
 *
 * "Not buzzed yet" must not read as "broken". On these accounts it usually
 * means nothing has needed anybody's attention, which is the product working
 * rather than failing — so the page says that once, plainly, instead of
 * putting a warning against every device.
 *
 * Pure, so the wording can be tested without a database or a clock.
 */

export type Device = {
  id: string;
  /** "iPhone", "the salon iPad" — what the browser called itself. */
  label: string | null;
  addedAt: string;
  lastUsedAt: string | null;
};

/** Days between two instants, floored. Negative clock skew reads as nought. */
function daysBetween(from: string, to: Date): number {
  const ms = to.getTime() - new Date(from).getTime();
  return ms <= 0 ? 0 : Math.floor(ms / 86_400_000);
}

/** "today", "yesterday", "3 days ago", "5 weeks ago". */
export function howLongAgo(iso: string, now: Date = new Date()): string {
  const days = daysBetween(iso, now);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 9) return `${weeks} weeks ago`;
  const months = Math.floor(days / 30);
  return months <= 1 ? "a month ago" : `${months} months ago`;
}

/**
 * How long a device may go unreached before it is worth mentioning.
 *
 * Only ever applied to a device that has been reached at least once, so it is
 * a real change of behaviour rather than a guess: this phone used to buzz and
 * has not for a month, while others have. Six weeks because a quiet salon in
 * January is a real thing and a false alarm here teaches somebody to ignore
 * the screen.
 */
export const QUIET_DAYS = 42;

/**
 * The line under one device.
 *
 * Says when it was added and when it was last reached, and nothing else. No
 * verdict on a device that has simply never been needed — see `nothingSent`
 * for where that is said once instead.
 */
export function deviceLine(device: Device, now: Date = new Date()): string {
  const added = `Added ${howLongAgo(device.addedAt, now)}`;

  if (!device.lastUsedAt) return `${added} · not buzzed yet`;

  return `${added} · last buzzed ${howLongAgo(device.lastUsedAt, now)}`;
}

/**
 * Whether this particular device looks like it has stopped working.
 *
 * True only when it has been reached before, has not been for a long time, and
 * something else has been reached since — which is the one shape that means
 * this device rather than a quiet month. Anything less is not evidence.
 */
export function looksDead(device: Device, all: Device[], now: Date = new Date()): boolean {
  if (!device.lastUsedAt) return false;
  if (daysBetween(device.lastUsedAt, now) < QUIET_DAYS) return false;

  return all.some(
    (other) =>
      other.id !== device.id &&
      other.lastUsedAt != null &&
      new Date(other.lastUsedAt) > new Date(device.lastUsedAt as string),
  );
}

/**
 * True when no device here has ever been reached.
 *
 * The sentence this drives is the whole point of the screen being honest: a
 * business that has never had a notification is not broken, it has never had
 * anything waiting on a person, and telling it otherwise is how a working
 * product gets mistrusted.
 */
export function nothingSent(devices: Device[]): boolean {
  return devices.length > 0 && devices.every((d) => !d.lastUsedAt);
}

/** "iPhone", or an honest admission when the browser said nothing useful. */
export function nameOf(device: Device): string {
  return device.label?.trim() || "A device";
}
