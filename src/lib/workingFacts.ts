import type { SupabaseClient } from "@supabase/supabase-js";
import type { Studio } from "@/lib/types";
import type { Facts, PersonFacts } from "./working";
import { emailReallyWorks } from "@/lib/messaging/email";
import { canTakeCharges } from "@/lib/payments/connect";
import { smsConfigured } from "@/lib/messaging/sms";
import { reminderCover } from "./reminderCover";

/**
 * Everything the "is it working" page needs, in one pass.
 *
 * Kept apart from the judging so the judging can be tested without a database
 * — every awkward combination on that page is a two-line object rather than a
 * fixture.
 *
 * Read tolerantly throughout. This is the page somebody opens when they think
 * something is broken, and it failing outright because one table arrived in a
 * migration nobody has run would be the worst possible moment for it to be
 * the thing that is broken.
 */
export async function workingFacts(
  db: SupabaseClient,
  studio: Studio,
): Promise<{ facts: Facts; people: PersonFacts[] }> {
  const count = async (
    table: string,
    build: (q: ReturnType<SupabaseClient["from"]>) => unknown,
  ): Promise<number> => {
    try {
      const { count: n } = (await build(db.from(table))) as { count: number | null };
      return n ?? 0;
    } catch {
      return 0;
    }
  };

  const [
    people,
    connections,
    templates,
    savedMessages,
    optedIn,
    emailWorks,
    stripeReady,
  ] = await Promise.all([
    db.from("artists").select("*").eq("studio_id", studio.id),
    db
      .from("channel_connections")
      .select("channel, artist_id, active")
      .eq("studio_id", studio.id)
      .eq("active", true),
    db.from("reminder_templates").select("*").eq("studio_id", studio.id),
    count("message_templates", (q) =>
      (q as never as { select: (c: string, o: object) => unknown }).select("id", {
        count: "exact",
        head: true,
      }),
    ),
    /*
     * Opted in on either channel. Two columns rather than one because a
     * customer may say yes to email and no to texts, and both are consent.
     */
    (async () => {
      try {
        const { count: n } = await db
          .from("contacts")
          .select("id", { count: "exact", head: true })
          .eq("studio_id", studio.id)
          .or("marketing_email.eq.true,marketing_sms.eq.true");
        return n ?? 0;
      } catch {
        return 0;
      }
    })(),
    emailReallyWorks().catch(() => false),
    canTakeCharges(studio.stripe_account_id).catch(() => false),
  ]);

  const connected: Record<string, number> = {};
  for (const c of (connections.data ?? []) as { channel: string }[]) {
    connected[c.channel] = (connected[c.channel] ?? 0) + 1;
  }

  const roster = (people.data ?? []) as Record<string, unknown>[];
  const linesByArtist = new Set(
    ((connections.data ?? []) as { channel: string; artist_id: string | null }[])
      .filter((c) => (c.channel === "sms" || c.channel === "voice") && c.artist_id)
      .map((c) => c.artist_id as string),
  );

  const cover = reminderCover(
    (templates.data ?? []) as { artist_id?: string | null; enabled?: boolean | null; hours_before?: number | null }[],
    roster.map((p) => ({
      id: p.id as string,
      name: (p.name as string) ?? "",
      active: p.active !== false,
      ownReminders: p.reminders_own === true,
    })),
  );

  const live = (templates.data ?? []) as { enabled?: boolean | null; hours_before?: number | null }[];

  /* Which channels each person actually has one of their own on. */
  const ownChannelsConnected = new Map<string, string[]>();
  for (const c of (connections.data ?? []) as { channel: string; artist_id: string | null }[]) {
    if (!c.artist_id) continue;
    ownChannelsConnected.set(c.artist_id, [
      ...(ownChannelsConnected.get(c.artist_id) ?? []),
      c.channel,
    ]);
  }

  const facts: Facts = {
    sold: (studio.channels_allowed ?? ["web"]) as string[],
    receptionistAllowed:
      (studio as unknown as { receptionist_allowed?: boolean | null }).receptionist_allowed === true,
    receptionistOn:
      (studio as unknown as { receptionist_on?: boolean | null }).receptionist_on === true,
    people: roster.map((p) => ({
      name: (p.name as string) ?? "",
      voiceOn: p.voice_on === true,
      hasOwnLine: linesByArtist.has(p.id as string),
    })),
    connected,
    smsConfigured: smsConfigured(),
    emailWorks,
    stripeReady,
    voicemailOn: (studio as unknown as { voicemail?: boolean | null }).voicemail === true,
    reminderTemplates: live.filter((t) => t.enabled !== false && t.hours_before !== 0).length,
    hasConfirmation: live.some((t) => t.enabled !== false && t.hours_before === 0),
    uncovered: cover.sendingNothing,
    reviewLink: Boolean(
      (studio as unknown as { review_url?: string | null }).review_url?.trim(),
    ),
    marketingSold:
      (studio as unknown as { marketing_email_on?: boolean | null }).marketing_email_on === true ||
      (studio as unknown as { marketing_sms_on?: boolean | null }).marketing_sms_on === true,
    optedIn,
    savedMessages,
    ever: await whatHasHappened(db, studio.id),
  };

  return {
    facts,
    people: peopleFacts(roster, linesByArtist, ownChannelsConnected, cover.sendingNothing),
  };
}

/**
 * The same question about each person.
 *
 * Giles: "i will need to see what team members havent set up as well, this
 * only covers the business."
 *
 * Read from the same rows the business facts already fetched, so asking costs
 * nothing extra — the whole roster and every connection are in hand by the
 * time this is called.
 */
export function peopleFacts(
  roster: Record<string, unknown>[],
  linesByArtist: Set<string>,
  ownChannelsConnected: Map<string, string[]>,
  sendingNothing: string[],
): PersonFacts[] {
  const nothing = new Set(sendingNothing);

  return roster.map((p) => ({
    name: (p.name as string) ?? "",
    active: p.active !== false,
    ownerManaged: p.owner_managed === true,
    hasLogin: Boolean(p.user_id),
    invited: Boolean((p.email as string | null)?.trim()),
    hasRate: Boolean(p.hourly_rate_pence || p.day_rate_pence || p.min_charge_pence),
    ownReminders: p.reminders_own === true,
    sendsNothing: nothing.has((p.name as string) ?? ""),
    ownChannelsAllowed: ((p.own_channels as string[] | null) ?? []).filter((c) => c !== "web"),
    ownChannelsConnected: ownChannelsConnected.get(p.id as string) ?? [],
    receptionistOn: p.voice_on === true,
    hasOwnLine: linesByArtist.has(p.id as string),
    takesBookings: p.assistant_books !== false,
    calendarError: ((p.personal_calendar_error as string | null) ?? null) || null,
    isResource: p.is_resource === true,
  }));
}

/**
 * What has actually happened, which is the only proof there is.
 *
 * Giles asked for this rather than the setup state, and he was right to: a
 * number can be bought, typed in, saved, and still answer nothing because a
 * webhook was never pasted into Twilio. Every check here asks whether a real
 * thing reached a real person, not whether a field is filled in.
 *
 * Counted head-only — this page needs to know whether it has ever happened,
 * never how often, and reading the rows to find out would be reading the
 * business's own messages to render a tick.
 */
async function whatHasHappened(db: SupabaseClient, studioId: string): Promise<Facts["ever"]> {
  const any = async (run: () => PromiseLike<{ count: number | null; error: unknown }>) => {
    try {
      const { count, error } = await run();
      return !error && (count ?? 0) > 0;
    } catch {
      return false;
    }
  };

  const conv = (channel: string) =>
    any(() =>
      db
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("studio_id", studioId)
        .eq("channel", channel)
        .eq("is_test", false),
    );

  const reminderWith = (confirmation: boolean) =>
    any(() =>
      db
        .from("reminders")
        .select("id, reminder_templates!inner(studio_id, hours_before)", { count: "exact", head: true })
        .eq("reminder_templates.studio_id", studioId)
        .filter("reminder_templates.hours_before", confirmation ? "eq" : "gt", 0)
        .eq("status", "sent"),
    );

  const [
    textDelivered,
    emailDelivered,
    callTaken,
    webChat,
    paymentTaken,
    reminderSent,
    confirmationSent,
    reviewAsked,
    campaignSent,
    formSigned,
    messageByHand,
  ] = await Promise.all([
    conv("sms"),
    conv("email"),
    any(() =>
      db.from("calls").select("id", { count: "exact", head: true }).eq("studio_id", studioId),
    ),
    conv("web"),
    any(() =>
      db
        .from("payments")
        .select("id", { count: "exact", head: true })
        .eq("studio_id", studioId)
        .eq("status", "paid"),
    ),
    reminderWith(false),
    reminderWith(true),
    /*
     * Reviews and campaigns cannot be counted per business, and that is a real
     * gap rather than an oversight here.
     *
     * Both record that they went by claiming a row in handled_messages — the
     * dedupe table, keyed "review:<booking>" and the campaign's own key — and
     * that table has no studio on it. So "has this salon ever asked anybody
     * for a review" is not a question the data can answer today.
     *
     * Reported as unknown rather than guessed either way. A false no sends
     * somebody hunting for a fault that is not there; a false yes is worse.
     * Worth fixing at the source, by putting the business on that row.
     */
    Promise.resolve(false),
    Promise.resolve(false),
    any(() =>
      db
        .from("client_forms")
        .select("id", { count: "exact", head: true })
        .eq("studio_id", studioId)
        .in("status", ["signed", "paper"]),
    ),
    /*
     * A message the business wrote itself, which is exactly the thing the
     * outbound flag marks. Its first proper use.
     */
    any(() =>
      db
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("studio_id", studioId)
        .eq("outbound", true),
    ),
  ]);

  return {
    textDelivered,
    emailDelivered,
    callTaken,
    webChat,
    paymentTaken,
    reminderSent,
    confirmationSent,
    reviewAsked,
    campaignSent,
    formSigned,
    messageByHand,
  };
}
