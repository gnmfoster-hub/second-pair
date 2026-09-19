/**
 * Who is actually having their clients reminded, and who is not.
 *
 * A reminder template belongs to the business, or to one person. Somebody with
 * `reminders_own` set uses only their own; everybody else uses the business's.
 * That rule is in reminders.ts and it is right. What nothing said out loud is
 * the state it leaves when a business has *no* business-wide template — then
 * everybody without their own sends nothing at all.
 *
 * Willow & Co was in exactly that state and had been for weeks: one template,
 * Aisha's, and five other stylists whose clients were reminded of nothing. The
 * settings screen listed her template with no indication whose it was, so the
 * page read as set up. Nobody would find that until somebody did not turn up.
 *
 * Kept apart from the database so the awkward combinations can be tested
 * without one, because the combination that matters is the rare one.
 */

export type CoverPerson = {
  id: string;
  name: string;
  active: boolean;
  /** They send their own instead of the business's. */
  ownReminders: boolean;
};

export type CoverTemplate = {
  /** Null for the business's own. */
  artist_id?: string | null;
  enabled?: boolean | null;
};

export type Cover = {
  /** How many enabled templates the business has for everybody. */
  businessWide: number;
  /** People who send their own, and have at least one. */
  onTheirOwn: string[];
  /**
   * People whose clients are sent nothing.
   *
   * Either they are on the business's and it has none, or they are on their
   * own and have not written one — both end the same way for the client.
   */
  sendingNothing: string[];
};

export function reminderCover(templates: CoverTemplate[], people: CoverPerson[]): Cover {
  // Only enabled ones count. A disabled template is a draft, not a reminder.
  const live = templates.filter((t) => t.enabled !== false);
  const businessWide = live.filter((t) => !t.artist_id).length;

  const onTheirOwn: string[] = [];
  const sendingNothing: string[] = [];

  for (const person of people) {
    if (!person.active) continue;

    if (person.ownReminders) {
      const theirs = live.filter((t) => t.artist_id === person.id).length;
      if (theirs) onTheirOwn.push(person.name);
      else sendingNothing.push(person.name);
      continue;
    }

    if (!businessWide) sendingNothing.push(person.name);
  }

  return { businessWide, onTheirOwn, sendingNothing };
}

/**
 * The sentence to put on the page, or nothing when all is well.
 *
 * Names people rather than counting them: "Sarah, Mo, Priya, Chen and Nadia"
 * is a thing an owner acts on, and "5 people are not covered" is a thing an
 * owner reads past.
 */
export function whatIsMissing(cover: Cover): string | null {
  if (!cover.sendingNothing.length) return null;

  const who = listOf(cover.sendingNothing);

  if (!cover.businessWide && cover.onTheirOwn.length) {
    return (
      `There is no reminder for the business as a whole — only ${listOf(cover.onTheirOwn)}'s own. ` +
      `Nothing is sent before an appointment with ${who}.`
    );
  }

  return `Nothing is sent before an appointment with ${who}.`;
}

function listOf(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
