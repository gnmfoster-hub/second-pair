import type { SupabaseClient } from "@supabase/supabase-js";
import type { Studio } from "@/lib/types";
import { describeSlot } from "@/lib/booking";
import { renderReminder, forOneText } from "@/lib/reminderText";
import { deliver } from "@/lib/messaging/deliver";
import { routesFor } from "@/lib/messaging/reach";
import { connectedChannels, smsNumberFor, smsNumberForPerson } from "@/lib/messaging/connections";
import type { Channel } from "@/lib/types";
import { isOptedOut } from "@/lib/messaging/optOut";
import { whyNotSend } from "@/lib/whyNotSend";
import { planReminders } from "@/lib/reminderSchedule";
import { buildEmail } from "@/lib/messaging/emailTemplate";
import { avatarUrl } from "@/components/Avatar";

/**
 * Reminders.
 *
 * Scheduled when a booking is made, rendered when they are sent. Rendering late
 * means an edited template does not rewrite reminders that have already gone
 * out, and a moved appointment says the right time.
 *
 * Delivery is deliberately pluggable: whichever channel the client came in on
 * is the one they hear back on. Until a channel is connected, a reminder still
 * becomes due and surfaces in the dashboard for the owner to send by hand —
 * which is more useful than silently doing nothing.
 */

export type PendingReminder = {
  id: string;
  booking_id: string;
  due_at: string;
  body: string | null;
  channel: string | null;
};

/*
 * Filling a template lives in reminderText.ts, which imports nothing.
 *
 * This file reaches the database and the messaging layer, so node cannot load
 * it to test anything — and the filling is the part that actually reaches a
 * customer's phone, so it is the part most worth testing.
 */
export { renderReminder } from "@/lib/reminderText";

/** A template as it comes back, with only the parts this file reads. */
type Template = { id: string; hours_before: number; artist_id?: string | null };

/**
 * Whose reminders this booking gets.
 *
 * The business's, unless the person it is with keeps their own — a mobile
 * hairdresser reminding people the night before is not the same business as a
 * tattooist reminding them a week out about aftercare.
 *
 * Somebody who has asked for their own and written none gets none, and that is
 * deliberate rather than an oversight: falling back to the business's would
 * mean a person who turned this on to stop a message going out would watch it
 * go out anyway, which is worse than silence and much harder to explain.
 */
async function pickTemplates(
  db: SupabaseClient,
  all: Template[],
  artistId?: string | null,
): Promise<Template[]> {
  const shop = all.filter((t) => t.artist_id == null);
  if (!artistId) return shop;

  const { data: artist } = await db
    .from("artists")
    .select("*")
    .eq("id", artistId)
    .maybeSingle();

  // Undefined before the migration runs, which reads as "the business's".
  const own = (artist as { reminders_own?: boolean } | null)?.reminders_own === true;
  if (!own) return shop;

  return all.filter((t) => t.artist_id === artistId);
}

/**
 * Schedules a booking's reminders.
 *
 * Only ones that would still land in the future — booking something for
 * tomorrow should not fire a "two days before" reminder immediately, or at all.
 * The exception is the confirmation, which is a template set to zero hours
 * before and is due the moment the booking is made.
 */
export async function scheduleReminders(
  db: SupabaseClient,
  studioId: string,
  bookingId: string,
  startsAt: string,
  /**
   * Whose booking it is, so their own reminders can be used instead.
   *
   * Optional because plenty of callers do not have it and the business's are
   * the right answer for almost everybody.
   */
  artistId?: string | null,
): Promise<number> {
  /*
   * Everything the business has, read whole.
   *
   * select("*") rather than naming artist_id, so this keeps working before the
   * migration that adds the column as well as after — PostgREST rejects an
   * entire query for one column it does not know, and the thing that would
   * stop working here is every reminder for every business.
   */
  const { data: all } = await db
    .from("reminder_templates")
    .select("*")
    .eq("studio_id", studioId)
    .eq("enabled", true);

  const templates = await pickTemplates(db, all ?? [], artistId);

  if (!templates?.length) return 0;

  const now = Date.now();

  /*
   * The rules themselves live in reminderSchedule.ts, which touches nothing.
   *
   * What is due and when is the part that can be quietly wrong — a
   * confirmation dated to the appointment, or eaten by the rule that drops
   * reminders whose moment has passed — and this file reaches the database and
   * the messaging layer, so no test can load it. Pure and tested there;
   * written and sent here.
   */
  const plan = planReminders(templates, startsAt, now);

  const row = (r: { template_id: string; due_at: string }) => ({
    booking_id: bookingId,
    template_id: r.template_id,
    due_at: r.due_at,
    /*
     * Waiting again, whatever it was before.
     *
     * Moving a booking drops its reminders (skipped) and schedules them
     * again, and the upsert updated the time but not the status — so every
     * dragged appointment kept its reminders as skipped and never got one.
     * One already sent for the old time is due again for the new one too.
     */
    status: "pending",
    sent_at: null,
  });

  const confirmations = plan.confirmations.map(row);
  const timed = plan.timed.map(row);

  let written = 0;

  if (timed.length) {
    // Unique on (booking_id, template_id), so re-scheduling a moved booking
    // updates rather than duplicating.
    const { error } = await db
      .from("reminders")
      .upsert(timed, { onConflict: "booking_id,template_id" });
    if (!error) written += timed.length;
  }

  if (confirmations.length) {
    /*
     * Left alone if there is already one, rather than updated.
     *
     * Every other reminder is deliberately re-armed when a booking moves,
     * because the whole point of "the night before" is that it follows the
     * appointment. A confirmation is the opposite: it confirms the act of
     * booking, which happened once. Upserting it the ordinary way would put
     * a sent row back to pending and thank somebody for booking every time
     * their appointment was dragged across the diary.
     *
     * A moved appointment does want saying — but that is a different message
     * with different words, and inventing it here under the confirmation's
     * template would send the wrong one. Noted for Giles rather than guessed.
     */
    /*
     * Asked for the rows back, so "one was written" can be told from "there
     * was already one". Only a new one is sent; without this, re-scheduling a
     * moved booking would send the confirmation again every time.
     */
    const { data: inserted, error } = await db
      .from("reminders")
      .upsert(confirmations, { onConflict: "booking_id,template_id", ignoreDuplicates: true })
      .select("id");

    if (!error) written += confirmations.length;

    if (inserted?.length) await sendConfirmation(db, studioId, bookingId);
  }

  return written;
}

/**
 * Sends this booking's confirmation now, rather than waiting for the sweep.
 *
 * The sweep runs once a day. Everything else it carries is meant for a
 * particular hour days away, so once a day is right for those and useless for
 * the one message whose whole point is that it arrives while the customer is
 * still holding their phone.
 *
 * It sends through sendDueReminders rather than beside it, narrowed to this
 * booking. That is the whole reason the confirmation is a reminder at all:
 * rendering, the choice of channel, the opt-out, claiming the row so it cannot
 * go twice, writing it into the thread, and what to do when there is nowhere
 * to send it are already written, tested and used every day. A second path
 * would be a second set of all those decisions, and the second one is the one
 * that goes wrong quietly.
 *
 * Never throws. A confirmation that could not be sent must not fail the
 * booking — the customer has the slot either way, the row stays pending, and
 * the morning sweep tries again.
 */
async function sendConfirmation(db: SupabaseClient, studioId: string, bookingId: string) {
  try {
    const { data: studio } = await db
      .from("studios")
      .select("*")
      .eq("id", studioId)
      .maybeSingle();

    if (!studio) return;

    await sendDueReminders(db, studio as Studio, new Date(), { bookingId });
  } catch (e) {
    console.error(
      `[reminders] could not confirm booking ${bookingId}: ${(e as Error)?.message ?? e}`,
    );
  }
}

/**
 * Cancels anything still pending for a booking, e.g. when it is cancelled.
 *
 * Said out loud when it fails. It threw its answer away, which is the family
 * of fault that has bitten this codebase repeatedly — and here it is not
 * customer-facing, because the sender re-reads cancelled_at before sending, so
 * a row left pending against a cancelled booking is skipped there instead.
 * That makes this a log rather than a throw: the caller has already done the
 * part that matters, and failing the whole action over tidying-up would be
 * worse than the untidiness.
 */
export async function dropReminders(db: SupabaseClient, bookingId: string) {
  const { error } = await db
    .from("reminders")
    .update({ status: "skipped" })
    .eq("booking_id", bookingId)
    .eq("status", "pending");

  if (error) {
    console.error(`[reminders] could not drop those for booking ${bookingId}: ${error.message}`);
  }
}

type DueRow = {
  id: string;
  due_at: string;
  template_id: string | null;
  bookings: {
    id: string;
    starts_at: string;
    cancelled_at: string | null;
    artists: { id: string; name: string; studio_id: string } | null;
    /** Set when somebody typed this into the diary rather than the assistant booking it. */
    contacts: Person | null;
    enquiries: {
      conversations: {
        id: string;
        channel: Channel;
        external_ref: string | null;
        last_inbound_at: string | null;
        ai_paused: boolean;
        contacts: Person | null;
      } | null;
    } | null;
  } | null;
};

type Person = {
  name: string | null;
  phone: string | null;
  email: string | null;
};

export type SendResult = {
  due: number;
  sent: number;
  skipped: number;
  failed: number;
  /** Ready to send but with nowhere to send it — the owner does these by hand. */
  waiting: { id: string; body: string; who: string; when: string }[];
};

/**
 * Renders and delivers everything now due.
 *
 * Safe to call repeatedly: each reminder is one row, moved off `pending` the
 * moment it is handled, so a cron firing twice cannot send twice.
 */
/**
 * Reminders claimed by a run that never came back.
 *
 * The claim marks a row "sent" before anything is sent — deliberately, because
 * that is what stops two overlapping sweeps sending the same reminder twice.
 * Everything after it runs in a try, so a throw writes the row back as failed.
 * What that cannot catch is the process itself dying: a lambda killed
 * mid-send leaves a row saying sent, off `pending` for ever, that nobody
 * received. The first anybody knows is an empty chair.
 *
 * It needs no column to find. `sent_at` is written only once something has
 * actually arrived, so "sent with no sent_at, and due a while ago" is exactly
 * a claim nobody finished — the review said this wanted a claimed-at column,
 * and it turned out the row already said it.
 *
 * Put back to pending once. If it strands a second time the row says so and
 * is failed instead, because something is wrong with that reminder rather than
 * with the run, and a loop that retries for ever is a worse fault than the one
 * it is fixing.
 *
 * The risk taken deliberately: a send that went out and died before recording
 * will be sent again. A duplicate reminder is an awkward text; a missing one
 * is somebody not turning up.
 */
const STRANDED_AFTER_MS = 15 * 60 * 1000;
const RECOVERED = "put back after an interrupted send";

async function recoverStranded(db: SupabaseClient, studio: Studio, now: Date): Promise<void> {
  const { data: stuck } = await db
    .from("reminders")
    .select("id, error, bookings!inner(starts_at, cancelled_at, artists!inner(studio_id))")
    .eq("status", "sent")
    .is("sent_at", null)
    .eq("bookings.artists.studio_id", studio.id)
    .lte("due_at", new Date(now.getTime() - STRANDED_AFTER_MS).toISOString())
    .limit(100);

  for (const row of (stuck ?? []) as unknown as {
    id: string;
    error: string | null;
    bookings: { starts_at: string; cancelled_at: string | null };
  }[]) {
    /* No use reminding anybody about an appointment that has been and gone. */
    const past = new Date(row.bookings.starts_at) <= now;
    const gone = Boolean(row.bookings.cancelled_at);

    if (past || gone || row.error === RECOVERED) {
      await db
        .from("reminders")
        .update({
          status: "failed",
          error: past || gone ? "the send was interrupted and the time has passed" : "interrupted twice",
        })
        .eq("id", row.id);
      continue;
    }

    await db
      .from("reminders")
      .update({ status: "pending", error: RECOVERED })
      .eq("id", row.id)
      .eq("status", "sent")
      .is("sent_at", null);
  }
}

export async function sendDueReminders(
  db: SupabaseClient,
  studio: Studio,
  now = new Date(),
  /**
   * One booking's, for sending a confirmation the moment it is made.
   *
   * The daily sweep passes nothing and behaves exactly as it always has.
   */
  only?: { bookingId: string },
): Promise<SendResult> {
  /*
   * Only the sweep tidies up after interrupted runs.
   *
   * Recovery reads a hundred rows across the whole business and is the right
   * thing to do once a day. Doing it on every booking would put that work in
   * front of a customer waiting for a time slot, to fix something that has
   * nothing to do with the booking they are making.
   */
  if (!only) await recoverStranded(db, studio, now);

  const query = db
    .from("reminders")
    .select(
      "id, due_at, template_id, " +
        "bookings!inner(id, starts_at, cancelled_at, " +
        "artists!inner(id, name, studio_id), contacts(name, phone, email), " +
        "enquiries(conversations(id, channel, external_ref, last_inbound_at, " +
        "ai_paused, contacts(name, phone, email))))",
    )
    .eq("status", "pending")
    .lte("due_at", now.toISOString())
    /*
     * This business's, in the database rather than afterwards.
     *
     * The query took the first 200 pending reminders on the whole platform, in
     * no order, and then kept this business's. Reminders with nowhere to go
     * stay pending for ever, so once there were enough of them anywhere, a
     * business's genuinely due reminders could simply never be fetched.
     */
    .eq("bookings.artists.studio_id", studio.id)
    .order("due_at")
    .limit(200);

  const { data, error } = await (only ? query.eq("booking_id", only.bookingId) : query);

  /*
   * "Nothing due" and "could not look" are not the same answer.
   *
   * The error was not even read, so anything that breaks this embed — a
   * renamed relationship, a dropped column in the select list, a change to the
   * policies — comes back as an empty list and reports a quiet evening. The
   * identical fault stopped every held conversation being answered for a
   * fortnight, on a query three files away.
   */
  if (error) throw new Error(`could not read what is due: ${error.message}`);

  const rows = ((data ?? []) as unknown as DueRow[]).filter(
    (r) => r.bookings?.artists?.studio_id === studio.id,
  );

  const result: SendResult = { due: rows.length, sent: 0, skipped: 0, failed: 0, waiting: [] };
  if (!rows.length) return result;

  /*
   * Only the ones still switched on.
   *
   * Scheduling filters on `enabled` too, but that happens when the booking is
   * made. Switching a reminder off has to stop the ones already queued behind
   * it, or an owner who turns off a reminder because it is wrong watches it go
   * out for another three weeks to everybody already in the diary.
   */
  const { data: templates } = await db
    .from("reminder_templates")
    .select("id, body, hours_before")
    .eq("studio_id", studio.id)
    .eq("enabled", true);
  const bodyFor = new Map((templates ?? []).map((t) => [t.id, t.body]));
  /*
   * Which of them is the confirmation, so the email can be titled properly.
   *
   * "Your appointment with X" on the message that confirms the booking reads
   * like a reminder arriving seconds after somebody booked, which is how it
   * would look in an inbox. Everything else about the send is identical.
   */
  const confirms = new Set(
    (templates ?? [])
      .filter((t) => (t as { hours_before?: number }).hours_before === 0)
      .map((t) => t.id),
  );

  // Looked up once for the whole batch rather than per reminder.
  const connected = await connectedChannels(db, studio.id);
  const smsFrom = await smsNumberFor(db, studio.id);

  /*
   * A reminder about Aisha's appointment goes out from Aisha's number.
   *
   * The business's line is right for anything the business sends on its own
   * account and wrong for this: the customer would get a text from a number
   * they have never seen, and reply to the salon about an appointment the
   * salon cannot see. Nobody has their own number yet, so today every one of
   * these falls through to the same number it used before.
   *
   * Cached per person for the batch. A salon reminding forty people about six
   * stylists should ask six questions, not forty.
   */
  const numberFor = new Map<string, string | null>();
  const sendingAs = async (artistId: string | null | undefined): Promise<string | null> => {
    if (!artistId) return smsFrom;
    if (!numberFor.has(artistId)) {
      numberFor.set(artistId, await smsNumberForPerson(db, studio.id, artistId));
    }
    return numberFor.get(artistId) ?? smsFrom;
  };

  for (const row of rows) {
    const booking = row.bookings;
    const conversation = booking?.enquiries?.conversations;

    /*
     * Whether this one should go out at all — cancelled, already happened, or
     * the reminder behind it deleted.
     *
     * In whyNotSend rather than here, because cancelling an appointment now
     * leans on it: cancelDiaryEntry marks the booking cancelled and then drops
     * its reminders, and the drop is allowed to fail precisely because this
     * runs again at send time. That makes it the net under the whole
     * cancellation path, and it wants a test rather than a condition buried in
     * this loop. The reason is written to the row, so "cancelled" can be told
     * apart from "we could not reach them".
     */
    const template = row.template_id ? bodyFor.get(row.template_id) : null;
    const notSending = whyNotSend(booking, Boolean(template), now);
    // booking and template are named again so the rest of the loop knows they
    // are there; whyNotSend has already returned a reason for either being
    // missing, so the row still says why.
    if (notSending || !booking || !template) {
      await db
        .from("reminders")
        .update({ status: "skipped", error: notSending })
        .eq("id", row.id);
      result.skipped++;
      continue;
    }

    // Who it is for: from the conversation where there is one, and from the
    // booking itself where somebody typed it into the diary.
    const person = conversation?.contacts ?? booking.contacts ?? null;

    const body = renderReminder(template, {
      name: person?.name,
      practitioner: booking.artists?.name,
      business: studio.name,
      when: describeSlot(
        { starts_at: booking.starts_at, ends_at: booking.starts_at },
        studio.timezone,
      ),
    });

    /*
     * Where this one can actually go.
     *
     * The same rules the rest of the product uses, which matters most here:
     * a reminder goes out the evening before, and Meta shuts twenty-four hours
     * after the customer's last message. So the channel they arrived on is
     * usually closed by the time we want it, and the honest answer is to fall
     * back to a text rather than to try and fail.
     *
     * routesFor already orders open routes first, so picking the first open one
     * gets that fallback without any special case for it.
     */
    const route = routesFor({
      conversations: conversation
        ? [
            {
              id: conversation.id,
              channel: conversation.channel,
              external_ref: conversation.external_ref,
              last_inbound_at: conversation.last_inbound_at,
            },
          ]
        : [],
      phone: person?.phone ?? null,
      email: person?.email ?? null,
      connected,
    }).find((r) => r.open);

    // Somebody who texted STOP is not texted a reminder.
    if (route?.channel === "sms" && (await isOptedOut(db, studio.id, route.to))) {
      await db
        .from("reminders")
        .update({ status: "skipped", error: "They texted STOP." })
        .eq("id", row.id);
      result.skipped++;
      continue;
    }

    if (route) {
      /*
       * Claimed before it is sent.
       *
       * The status only changed after delivery, so two sweeps overlapping —
       * the five-minute run and the daily one, or two delayed runs arriving
       * together — could both read it as pending and both send it. Whichever
       * takes the row sends; the other finds nothing to take.
       */
      const { data: mine } = await db
        .from("reminders")
        .update({ status: "sent" })
        .eq("id", row.id)
        .eq("status", "pending")
        .select("id");
      if (!mine?.length) continue;

      /*
       * From here the row says "sent" before anything has been sent.
       *
       * That is deliberate — it is how two instances cannot send the same
       * reminder twice — but it means anything that throws between here and
       * the correction below leaves a reminder recorded as delivered that
       * nobody received, off `pending` for ever so no sweep will retry it.
       *
       * So everything after the claim runs inside a try, and a throw puts the
       * row back to failed with the reason on it. A lambda killed mid-send can
       * still strand one; that needs a claimed-at column and is on the list.
       */
      try {

      /*
       * Written into the thread as well as sent.
       *
       * On the website that IS the delivery — they read it when they come back.
       * Everywhere else it is the record, so "was he reminded?" has an answer
       * weeks later without going to the phone company for it.
       */
      if (conversation) {
        await db.from("messages").insert({
          conversation_id: conversation.id,
          role: "assistant",
          content: body,
        });
      }

      /*
       * On a text, one text.
       *
       * The same reminder goes out on whichever channel is open, and the
       * trade's preparation advice pushes it past a hundred and sixty
       * characters — so every one of those is charged as two. Email and the
       * website carry the whole thing for nothing, and the phone gets who is
       * coming and when, which is the part somebody reads walking down the
       * street. See forOneText: it cuts between sentences or not at all.
       */
      const forThisChannel = route.channel === "sms" ? forOneText(body) : body;

      /*
       * An email that looks like the business sent it.
       *
       * Everything here went out as plain text, which arrives and threads and
       * never renders wrong — and beside the confirmation a salon gets from
       * anybody else reads as a system notice. The same wording, wrapped: the
       * business's name and picture at the top, their cancellation policy in
       * their own words, and Second Pair once at the bottom in small grey.
       *
       * buildEmail is the function the settings preview draws, so what an
       * owner is shown is what leaves. Plain text still goes with it, for the
       * people who read mail that way and for spam filters.
       */
      const html =
        route.channel === "email"
          ? buildEmail({
              business: studio.name,
              body: forThisChannel,
              photoUrl: avatarUrl(
                (studio as unknown as { photo_path?: string | null }).photo_path,
              ),
              policy:
                (studio as unknown as { cancellation_policy?: string | null })
                  .cancellation_policy ?? null,
            })
          : undefined;

      const sent = await deliver({
        channel: route.channel,
        to: route.to,
        body: forThisChannel,
        html,
        /*
         * A reminder about an appointment they booked is a service message,
         * so STOP does not silence it here — the sweep already skips anybody
         * who has opted out, a few lines above, which is the right place for
         * that decision because it also stops the row being claimed.
         */
        db,
        studioId: studio.id,
        transactional: true,
        lastInboundAt: route.lastInboundAt,
        from: route.channel === "sms" ? await sendingAs(booking.artists?.id) : undefined,
        subject:
          row.template_id && confirms.has(row.template_id)
            ? `Your booking with ${studio.name} is confirmed`
            : `Your appointment with ${studio.name}`,
        fromName: studio.name,
        replyTo: studio.email ?? undefined,
      });

      const arrived = sent.status === "sent" || sent.status === "delivered" ||
        sent.status === "not_needed";

      await db
        .from("reminders")
        .update({
          status: arrived ? "sent" : "failed",
          // What actually went, not what was composed — so a question about
          // what somebody was told has the right answer.
          body: forThisChannel,
          channel: route.channel,
          error: sent.error ?? null,
          sent_at: arrived ? new Date().toISOString() : null,
        })
        .eq("id", row.id);

        if (arrived) result.sent++;
        else result.failed++;
      } catch (e) {
        const why = (e as Error)?.message ?? "the send threw";
        await db
          .from("reminders")
          .update({ status: "failed", error: why.slice(0, 300), sent_at: null })
          .eq("id", row.id);
        result.failed++;
      }
      continue;
    }

    /*
     * Nowhere to send it. Left pending and surfaced to the owner rather than
     * quietly marked done.
     *
     * Usually means one of two things: no channel is connected yet, or they
     * came in on WhatsApp and the window has shut with no number on file to
     * text instead.
     */
    result.waiting.push({
      id: row.id,
      body,
      who: person?.name ?? "a client",
      when: describeSlot(
        { starts_at: booking.starts_at, ends_at: booking.starts_at },
        studio.timezone,
      ),
    });
  }

  return result;
}
