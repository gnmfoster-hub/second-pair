import type { Moment } from "./moments";
import { settleMoments } from "./moments";
import { joinReply } from "./reply";
import { whoAnswers, type AnsweringMode } from "@/lib/answering";
import { isOutOfHours } from "@/lib/report";
import { notifyStudio } from "@/lib/notify";
import { whoOffers } from "./whoOffers";
import { reachableFrom } from "./reachableFrom";
import Anthropic from "@anthropic-ai/sdk";
import { stopwatch, type Spent } from "./clock";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  studioSystemPrompt,
  enquiryStateMessage,
  type EnquiryState,
  type ContactState,
} from "./prompt";
import { toolDefinitions, executeTool, type ToolContext } from "./tools";
import { depositFor, quoteForStudio } from "@/lib/quote";
import { bandsFromServices } from "@/lib/serviceBands";
import { byPerson } from "@/lib/servicePrices";
import type {
  Artist,
  Channel,
  Faq,
  PriceBand,
  Service,
  ServiceOption,
  ServicePerson,
  Studio,
} from "@/lib/types";
import { NotAnswering } from "./errors";
import { hasColumn } from "@/lib/db/hasColumn";
import { connectedChannels } from "@/lib/messaging/connections";
import { neverSay } from "./neverSay";

/**
 * Overridable so a cheaper model can be measured against the guardrail suite
 * rather than assumed to be fine. Cost per enquiry comes straight out of the
 * subscription, so this is a real business number, not a detail.
 */
const MODEL = process.env.HANDLED_MODEL || "claude-opus-5";
const EFFORT = (process.env.HANDLED_EFFORT || "medium") as "low" | "medium" | "high";

/**
 * Per million tokens, in micros (millionths of a pound), at roughly $1.27/£.
 * Cache reads are a tenth of the input price, which is the whole reason the
 * studio prompt is cached — it is resent on every turn of every conversation.
 */
const PRICE_MICROS = {
  input: 3_940_000,
  output: 19_700_000,
  cache_write: 4_925_000,
  cache_read: 394_000,
} as const;

function costOf(usage: {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}) {
  const read = usage.cache_read_input_tokens ?? 0;
  const write = usage.cache_creation_input_tokens ?? 0;
  return Math.round(
    (usage.input_tokens * PRICE_MICROS.input +
      usage.output_tokens * PRICE_MICROS.output +
      write * PRICE_MICROS.cache_write +
      read * PRICE_MICROS.cache_read) /
      1_000_000,
  );
}

/**
 * Put a cache breakpoint on the end of the conversation so far.
 *
 * Anthropic caches everything up to and including the marked block, so this
 * has to move to the newest message each time round rather than being set once
 * — and the previous one has to come off, because only a few breakpoints are
 * allowed and a stale one wastes the allowance on a prefix that no longer ends
 * where the conversation does.
 */
function markCacheable(messages: Anthropic.MessageParam[]): void {
  for (const message of messages) {
    if (!Array.isArray(message.content)) continue;
    for (const block of message.content) {
      if (block && typeof block === "object" && "cache_control" in block) {
        delete (block as { cache_control?: unknown }).cache_control;
      }
    }
  }

  const last = messages[messages.length - 1];
  if (!last) return;

  /*
   * A string content has no block to mark, so it becomes one. Harmless — the
   * API treats a lone text block and a string identically — and it is the
   * shape every appended tool result already uses.
   */
  if (typeof last.content === "string") {
    last.content = [{ type: "text", text: last.content }];
  }

  const blocks = last.content as { cache_control?: unknown }[];
  const end = blocks[blocks.length - 1];
  /*
   * The plain five-minute cache, not the hour the system block uses.
   *
   * The rounds of one turn are seconds apart, which is what this is for — and
   * the longer window is a different thing to ask the API for. The system
   * prompt, which is the part that has to survive somebody replying tomorrow,
   * keeps its hour.
   */
  if (end && typeof end === "object") end.cache_control = { type: "ephemeral" };
}

/** A runaway loop would burn tokens and never reply. Real turns use two or three. */
const MAX_ITERATIONS = 8;

export type TurnInput = {
  studioSlug: string;
  sessionKey: string;
  channel: Channel;
  message: string;
  mediaUrls?: string[];
  /** Public origin, for payment return links. */
  origin: string;
  /**
   * Who this enquiry is for, when the channel already says so — an enquiry on
   * Sarah's own Instagram, or a link with her handle in it. Set on the
   * conversation so it survives every turn, and told to the assistant so it
   * does not ask a question it already has the answer to.
   */
  forArtistId?: string | null;
  /**
   * Whether the person messaging is signed in to Second Pair.
   *
   * Established from the session on the server, never from the request body:
   * it decides how the support assistant answers, and a browser claiming to
   * be a customer should not get a customer's answers. Null for every ordinary
   * business, where the question does not arise.
   */
  signedIn?: boolean | null;
  /** For support conversations: the business the person asking belongs to. */
  raisedFor?: string | null;
  /**
   * Set only by the sweep that releases a held conversation.
   *
   * Without it the release would run the same decision again, hold the message
   * a second time, and go round for ever — the assistant would never speak.
   */
  released?: boolean;
  /**
   * The owner trying their own assistant out.
   *
   * Kept out of the inbox, the client list and every figure — "your assistant
   * answered 14 enquiries" is worthless if nine were the owner rehearsing.
   */
  isTest?: boolean;
  /**
   * Somebody is watching this one arrive.
   *
   * Given only by web chat, where a person is sitting looking at a typing
   * dot. Everything else — email, text, Meta, a voicemail being read — is
   * answered into a queue nobody is staring at, and streaming to nobody
   * would be complication with no reader.
   */
  onText?: (chunk: string) => void;
};

export type TurnResult = {
  conversationId: string;
  reply: string | null;
  status: string;
  /** True when the owner has taken over and the assistant is deliberately silent. */
  paused: boolean;
  /**
   * What it did, structured, for a client that can draw it. See moments.ts.
   * Always safe to ignore — the reply says all of it in words too.
   */
  moments: Moment[];
  /** Set when the assistant stood back: when it will answer if nobody else has. */
  held?: Date;
  /**
   * Where the seconds went. See clock.ts — the widget turns it into a
   * Server-Timing header, and every other caller can ignore it.
   */
  spent?: Spent;
};

export async function runTurn(input: TurnInput): Promise<TurnResult> {
  const db = createAdminClient();
  const watch = stopwatch();
  const turnBegan = Date.now();

  const { data: studio } = await db
    .from("studios")
    .select("*")
    .eq("slug", input.studioSlug)
    .maybeSingle();
  if (!studio) throw new Error(`No studio with slug "${input.studioSlug}"`);

  /*
   * An archived business does not answer.
   *
   * This is the half that makes archiving mean anything. Without it a studio
   * could be stopped in the back office, vanish from every list and figure,
   * and carry on quoting prices and taking bookings on a website nobody had
   * remembered to take the script off — for a business that is no longer a
   * customer, with nobody watching the inbox.
   *
   * Thrown rather than answered blandly. The widget shows its "cannot reach
   * us" state, which is true, and the alternative is an assistant improvising
   * on behalf of somebody who is not paying us to represent them.
   */
  if (studio.archived_at) {
    throw new NotAnswering(
      `${studio.slug} is archived and is not answering`,
      // Said plainly, and without inviting a retry that cannot work. It does
      // not say why — that is between us and the business, not something to
      // explain to somebody who just wanted a haircut.
      "This business is not taking messages here at the moment. Please contact them directly.",
    );
  }

  /*
   * Both ways a business can describe what it sells, and only one is used.
   *
   * A tattooist prices by the size of the piece and the hours it sits; a salon
   * sells a named thing for a fixed price in a fixed time. Which one this
   * business uses is its own setting, and the other table is simply empty.
   *
   * Read unconditionally rather than behind the setting, because a business
   * that switches must not need a deploy to start quoting — and reading an
   * empty table costs nothing.
   */
  const [people, priced, listed, asked, offered] = await Promise.all([
    db.from("artists").select("*").eq("studio_id", studio.id).order("created_at"),
    db.from("price_bands").select("*").eq("studio_id", studio.id).order("sort_order"),
    db
      .from("services")
      .select("*")
      .eq("studio_id", studio.id)
      .eq("active", true)
      .order("sort_order"),
    db.from("faqs").select("*").eq("studio_id", studio.id).order("sort_order"),
    db.from("service_options").select("*").eq("studio_id", studio.id).order("sort_order"),
  ]);

  /*
   * Nothing loaded is not the same as nothing there.
   *
   * These errors were discarded, so a query that fell over arrived as an empty
   * list — and an empty list is a real, meaningful state here: it means the
   * business has not set its prices up yet, and the assistant says so to the
   * customer. A database that was briefly unreachable would therefore have it
   * telling somebody's customer that the business has no prices and nobody to
   * do the work, in the business's own name, while both sat safely in a table
   * it could not read.
   *
   * Throwing is the honest answer. The caller turns it into "something has
   * gone wrong, try again", which is true, rather than a confident and
   * completely wrong statement about somebody's business.
   */
  /*
   * The price list only counts against a business that prices by it.
   *
   * Including it unconditionally would mean a transient error on a table a
   * tattooist does not use could stop that tattooist answering at all — a new
   * way to fail, invented while adding a feature they will never turn on.
   */
  const failed = [
    people,
    priced,
    asked,
    offered,
    ...(studio.pricing_model === "services" ? [listed] : []),
  ].find((r) => r.error);
  if (failed) {
    throw new Error(`Could not load ${studio.slug}: ${failed.error!.message}`);
  }

  const artists = people.data;

  const faqs = asked.data;
  const options = offered.data;

  /*
   * Who this enquiry is for arrives from the browser, so it is checked against
   * this studio's own active people before it is believed. Without this, a
   * crafted request could pin a conversation in one business to somebody who
   * works at another.
   */
  const forArtistId =
    input.forArtistId &&
    (artists ?? []).some((a) => a.id === input.forArtistId && a.active)
      ? input.forArtistId
      : null;

  /*
   * One list of things to quote from, priced for whoever is being asked for.
   *
   * This has to happen after forArtistId, and that is the whole point of
   * where it sits. A salon's seniors and juniors charge different money for
   * the same thing, so quoting the shop's price to somebody who asked for
   * Sarah by name is a wrong price given out in the business's own name —
   * which is the one thing the assistant must never do.
   *
   * A service is expressed as the band it already is — a flat price with a
   * known length — so the prompt, the quoting tool and the slot search carry
   * on working against one shape. Teaching the engine a second model would
   * mean a second prompt section and a second way to be subtly wrong.
   */
  let bands: PriceBand[];
  if (studio.pricing_model === "services") {
    /*
     * Only when the conversation belongs to one person. Before anybody has
     * been asked for, the shop's own price is the honest answer — and the
     * assistant says a price is confirmed when the work has been seen anyway.
     */
    const { data: mineRows } = forArtistId
      ? await db.from("service_people").select("*").eq("artist_id", forArtistId)
      : { data: null };

    bands = bandsFromServices(
      (listed.data ?? []) as Service[],
      byPerson((mineRows ?? []) as ServicePerson[]),
      /*
       * Whose conversation this is, which decides what may be offered at all.
       *
       * Without it nobody's own services would ever reach anybody — not even
       * the person whose they are — because a row owned by somebody is only
       * offered when that somebody is who is being booked with.
       */
      forArtistId,
    );
  } else {
    bands = priced.data ?? [];
  }

  /*
   * Which people offer which services.
   *
   * Loaded once per turn and passed down, rather than queried inside a tool
   * that may run several times. A band with nobody named against it is done by
   * everybody, so this is empty for almost every business.
   *
   * Only bands have this. A price list says who does what on the row itself,
   * so a services business leaves it empty and everybody does everything —
   * which is right until somebody asks for the other thing.
   */
  const { data: providerRows, error: providersFailed } =
    studio.pricing_model === "services"
      ? { data: null, error: null }
      : await db
          .from("service_providers")
          .select("band_id, artist_id")
          .in("band_id", bands.map((b) => b.id));

  /*
   * A read that failed must never widen what may be offered.
   *
   * These two tables are the ones that say who does not do something, and an
   * empty answer means "nobody is named, so everybody does it". So a
   * transient error here does not degrade gracefully — it hands the junior
   * balayage at a price she never set, and the first anybody hears of it is a
   * customer arriving for it. The guarded set a hundred lines up exists for
   * exactly this reasoning and these two were simply not in it.
   */
  if (providersFailed) {
    throw new Error(`could not read who does what: ${providersFailed.message}`);
  }

  const providers: Record<string, string[]> = {};
  for (const row of providerRows ?? []) {
    (providers[row.band_id] ??= []).push(row.artist_id);
  }

  /*
   * And the same question for a business that prices by a named list.
   *
   * No two people on a salon's price list do all of it — the junior does not
   * do balayage, the barber does not do a full head of foils. Without this the
   * assistant believes everybody does everything, so it offers a stylist for
   * work she does not do, at a price she never set, and the first anybody
   * hears of it is a customer turning up for it. Bands have had this since
   * August; the list had nothing.
   *
   * Stored as the exceptions — a row saying somebody does not — and turned
   * here into the shape whoCanDo already expects, which is who does. That
   * keeps the common case free: a business where everybody does everything
   * writes no rows, gets no entries, and the rule that "nobody named means
   * everybody" is untouched and still the one under test.
   */
  if (studio.pricing_model === "services" && bands.length) {
    const { data: notOffered, error: exceptionsFailed } = await db
      .from("service_people")
      .select("service_id, artist_id")
      .in("service_id", bands.map((b) => b.id))
      .eq("offered", false);

    // Same as above: an unread exception list reads as "no exceptions", which
    // is the widest possible answer and the wrong way to fail.
    if (exceptionsFailed) {
      throw new Error(`could not read who does not do what: ${exceptionsFailed.message}`);
    }

    Object.assign(
      providers,
      whoOffers(
        bands.map((b) => b.id),
        (notOffered ?? []) as { service_id: string; artist_id: string }[],
        artists ?? [],
      ),
    );
  }

  const { conversation, enquiryId, contactId } = await findOrCreateConversation(
    db,
    studio.id,
    input.sessionKey,
    input.channel,
    forArtistId,
    input.isTest ?? false,
  );

  const startedAt = Date.now();

  /*
   * The customer's message, unless this turn is only here to answer one.
   *
   * A released hold re-enters with no message: the original was recorded when
   * it arrived, minutes ago, and writing it again would show the customer
   * saying the same thing twice in their own transcript.
   */
  /*
   * Photos this conversation actually uploaded, and no others.
   *
   * The paths come back from the browser, and anything in the list was
   * recorded and later turned into a viewable link with the server's own
   * access. They are uploaded under studio/conversation, so that is what is
   * required — a path from anywhere else is dropped rather than kept.
   *
   * A text or a Meta message carries a link to the platform's own copy
   * instead, which is a full URL, so those are left alone.
   */
  const ours = `${studio.id}/${conversation.id}/`;
  const mediaUrls = (input.mediaUrls ?? []).filter(
    (m) => /^https?:\/\//i.test(m) || m.startsWith(ours),
  );

  if (!input.released) {
    await db.from("messages").insert({
      conversation_id: conversation.id,
      role: "client",
      content: input.message,
      media_urls: mediaUrls,
    });
  }

  if (mediaUrls.length) {
    const { data: current } = await db
      .from("enquiries")
      .select("reference_urls")
      .eq("id", enquiryId)
      .single();
    await db
      .from("enquiries")
      .update({ reference_urls: [...(current?.reference_urls ?? []), ...mediaUrls] })
      .eq("id", enquiryId);
  }

  await db
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", conversation.id);

  /*
   * Is this business authorised for the channel the message arrived on?
   *
   * Seats stop an owner adding their whole team on a one-person price; this
   * stops them wiring up a channel nobody agreed to pay for. Checked here
   * rather than only in their settings, because a channel could be connected
   * once and then removed from the plan, and a webhook does not care what a
   * settings page says.
   *
   * The message is still recorded. It is a real customer who really wrote in,
   * and losing it because of a billing arrangement between us and the business
   * would be punishing the wrong person — the owner sees it in their inbox and
   * can answer by hand.
   */
  const allowed = (studio.channels_allowed ?? ["web"]) as Channel[];
  if (!allowed.includes(input.channel)) {
    /*
     * Say why, or this is indistinguishable from broken.
     *
     * The owner would otherwise watch a message land in their inbox with the
     * assistant silent beside it and no explanation anywhere — which is a
     * support call, and a fair one. The conversation is marked as needing them
     * so it surfaces where they already look, and the notification names the
     * channel and what to do about it.
     */
    await db
      .from("conversations")
      .update({ status: "needs_human", ai_paused: true })
      .eq("id", conversation.id);

    await notifyStudio(db, studio.id, {
      title: `A message on ${input.channel}`,
      body: `Your plan does not include ${input.channel} yet, so the assistant left it for you. Ask us to switch it on.`,
      url: `/conversations/${conversation.id}`,
      tag: `channel-${input.channel}`,
    });

    return {
      conversationId: conversation.id,
      reply: null,
      status: "needs_human",
      paused: true,
      moments: [],
    };
  }

  // The owner has taken this one over. Record what the client said and stay quiet.
  if (conversation.ai_paused) {
    return {
      conversationId: conversation.id,
      reply: null,
      status: conversation.status,
      paused: true,
      moments: [],
    };
  }

  /*
   * Does this one want the owner first?
   *
   * Only asked when the message has just arrived from the customer. The sweep
   * that releases a held conversation calls back in with `released`, and asking
   * again there would hold it a second time and never answer at all.
   */
  if (!input.released) {
    const decision = whoAnswers({
      channel: input.channel,
      now: new Date(),
      mode: (studio.answering_mode ?? "when_free") as AnsweringMode,
      mineUntil: studio.mine_until ? new Date(studio.mine_until) : null,
      outOfHours: isOutOfHours(new Date(), studio.hours, studio.timezone),
      withAClient: await withAClientNow(db, studio.id),
      firstRefusalMinutes: studio.first_refusal_minutes ?? 5,
    });

    if (!decision.answer) {
      await db
        .from("conversations")
        .update({ hold_until: decision.holdUntil.toISOString() })
        .eq("id", conversation.id);

      /*
       * Tell them, because the hold is only worth anything if they know.
       *
       * This is the whole bargain: the assistant is standing back for a few
       * minutes, and if that notification does not arrive it has simply made
       * the business slower for no reason.
       */
      await notifyStudio(db, studio.id, {
        title: "Yours first",
        body:
          decision.because === "owner_asked"
            ? "You said you had this one. Reply and the assistant stays out of the way."
            : "A new message. Reply and the assistant stays out; leave it and it answers shortly.",
        url: `/conversations/${conversation.id}`,
        // One notification per conversation, replaced rather than stacked. Four
        // buzzes about the same customer is how people turn notifications off.
        tag: `hold-${conversation.id}`,
      });

      return {
        conversationId: conversation.id,
        reply: null,
        status: conversation.status,
        paused: false,
        moments: [],
        held: decision.holdUntil,
      };
    }
  }

  /*
   * Everything up to here is setup: reading the business, its people, its
   * prices, the thread so far, and writing the customer's message down. It is
   * a handful of queries and it either matters or it does not — which is the
   * whole reason for measuring rather than guessing.
   */
  watch.spent.setup = Date.now() - turnBegan;

  const { text: reply, moments } = await generateReply({
    watch,
    onText: input.onText,
    db,
    studio: studio as Studio,
    artists: (artists ?? []) as Artist[],
    bands: (bands ?? []) as PriceBand[],
    faqs: (faqs ?? []) as Faq[],
    options: (options ?? []) as ServiceOption[],
    conversationId: conversation.id,
    enquiryId,
    contactId,
    enquirySizeBandId: null,
    enquiryArtistId: null,
    providers,
    forArtist:
      (artists ?? []).find((a) => a.id === conversation.artist_id) ?? null,
    depositPence: 0,
    origin: input.origin,
    contactEmail: null,
    channel: input.channel,
    signedIn: input.signedIn ?? null,
    raisedFor: input.raisedFor ?? null,
  });

  /*
   * The rules, run where the replies actually are.
   *
   * neverSay has existed for weeks, every rule in it came from something that
   * happened on a real business, and it had only ever been called by a script
   * that talks to a demo. Nothing had ever checked a reply on its way to a
   * real customer. Run over every assistant message we have, it objected to
   * eight — all of them on the two live businesses, three the model thinking
   * out loud in the middle of a message ("no need for tools", "nothing to book
   * in from"), the most recent sent the day before this was written.
   *
   * Logged and nothing more. Suppressing or rewriting a reply is a decision
   * about what a business says to its own customers, and the failure mode of
   * getting that wrong is silence, which is worse than an awkward sentence.
   * This makes it visible, so the next one is found in an hour instead of in a
   * week's worth of transcripts.
   */
  for (const slip of neverSay(reply)) {
    console.error(
      `[neverSay] ${studio.slug} ${conversation.id}: ${slip.what} — "${slip.saying}"`,
    );
  }

  const { data: after } = await db
    .from("conversations")
    .select("status, ai_paused")
    .eq("id", conversation.id)
    .single();

  const patch: Record<string, unknown> = { last_message_at: new Date().toISOString() };
  // Only the first reply counts toward the response-time metric.
  if (conversation.first_response_ms == null) {
    patch.first_response_ms = Date.now() - startedAt;
  }
  if (after?.status === "new") patch.status = "qualified";
  // It has spoken, so nothing is being held back any more.
  patch.hold_until = null;
  await db.from("conversations").update(patch).eq("id", conversation.id);

  /*
   * Whatever is left over is writing it back down: the reply, the status, the
   * spend. Worked out by subtraction rather than timed, so it cannot drift
   * away from the total the customer actually waited.
   */
  const { setup = 0, model = 0, tools = 0 } = watch.spent;
  watch.spent.save = Date.now() - turnBegan - setup - model - tools;

  return {
    conversationId: conversation.id,
    reply,
    status: after?.status ?? conversation.status,
    paused: Boolean(after?.ai_paused),
    moments,
    spent: watch.spent,
  };
}

type ReplyContext = Omit<ToolContext, "db"> & {
  db: ToolContext["db"];
  faqs: Faq[];
  /**
   * Called with each piece of the reply as it is written, where anybody is
   * watching it arrive. Web chat passes one; email, text and voice do not.
   */
  onText?: (chunk: string) => void;
  /** Verified on the server; see TurnInput. Null for an ordinary business. */
  signedIn?: boolean | null;
};

/**
 * The words, and what it did to arrive at them.
 *
 * This returned only the words. The tool calls behind them — the times it
 * looked up, the price it worked out, the slot it took — were flattened into
 * a sentence and thrown away, which left the widget with prose where it could
 * have had buttons.
 */
/**
 * Is somebody in the chair right now?
 *
 * The plainest signal there is that the owner's hands are full, and it is
 * already sitting in the diary — which is why this needs no scheduling screen
 * and nothing to remember. Cancelled appointments do not count, and neither
 * does a slot still being held for an unpaid deposit: nobody is in it yet.
 */
async function withAClientNow(db: ReturnType<typeof createAdminClient>, studioId: string) {
  const now = new Date().toISOString();
  /*
   * Through the person, because bookings belong to an artist and have no
   * studio column. Asking for one made the query fail every time, the error
   * was ignored, and nobody was ever "with a client" — so the assistant held
   * back from a business whose owner had their hands full.
   */
  const { data, error } = await db
    .from("bookings")
    .select("id, artists!inner(studio_id)")
    .eq("artists.studio_id", studioId)
    .in("category", ["appointment", "consultation"])
    .is("cancelled_at", null)
    .is("held_until", null)
    .lte("starts_at", now)
    .gt("ends_at", now)
    .limit(1);

  if (error) console.error("[answering] could not read the diary", error.message);
  return Boolean(data?.length);
}

/** "Tuesday 15 September 2026, 10:42 pm", in the business's own timezone. */
function nowIn(timezone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: timezone,
  }).format(new Date());
}

/**
 * The end of a long conversation, not all of it.
 *
 * Every turn sent the whole thread. An email thread carries each earlier
 * message again in its quoted reply, so the cost grew with the square of its
 * length and a long enough thread would fail outright — leaving the customer
 * with no answer. The enquiry's own state (what they want, the quote, their
 * details) is sent separately every turn, so what falls off the front is
 * conversation, not facts.
 *
 * It has to open on the customer's words, because that is how the model reads
 * a conversation, and each message is cut to a sensible length.
 */
export function recentHistory<M extends { role: string; content: string | null }>(
  history: M[],
  keep = 40,
  maxChars = 4000,
): M[] {
  let recent = history.slice(-keep);
  const firstClient = recent.findIndex((m) => m.role === "client");
  if (firstClient > 0) recent = recent.slice(firstClient);
  return recent.map((m) =>
    m.content && m.content.length > maxChars
      ? { ...m, content: m.content.slice(0, maxChars) + " …" }
      : m,
  );
}

async function generateReply(
  ctx: ReplyContext & { watch: ReturnType<typeof stopwatch> },
): Promise<{ text: string; moments: Moment[] }> {
  const client = new Anthropic();

  const { data: history } = await ctx.db
    .from("messages")
    .select("role, content, media_urls")
    .eq("conversation_id", ctx.conversationId)
    .in("role", ["client", "assistant", "owner"])
    /*
     * The last sixty, newest first, then turned back round.
     *
     * Every message of the thread was loaded and then all but the last forty
     * thrown away by recentHistory — and on email, where each reply quotes the
     * whole thread back, the discarded ones are the big ones. The index on
     * (conversation_id, created_at) serves this directly.
     */
    .order("created_at", { ascending: false })
    .limit(60);

  const [{ data: enquiry }, { data: contact }] = await Promise.all([
    ctx.db.from("enquiries").select("*").eq("id", ctx.enquiryId).single(),
    ctx.db.from("contacts").select("name, phone, email").eq("id", ctx.contactId).single(),
  ]);

  /*
   * Back into the order it was said in.
   *
   * The query asks newest first so the database can stop at sixty; everything
   * downstream — the transcript handed to the model, recentHistory's idea of
   * "recent" — reads it as a conversation, which only makes sense forwards.
   */
  const inOrder = [...(history ?? [])].reverse();

  /*
   * Whether this is the first thing the assistant has said to them.
   *
   * It used to count the owner's own messages too, so a thread the owner
   * started — a "your appointment is tomorrow" sent from the client's record —
   * suppressed the disclosure on the assistant's first reply. The customer
   * then talked to something they had never been told was not a person.
   *
   * The owner writing to somebody is not the assistant introducing itself, and
   * only the second one is the disclosure.
   */
  const isFirstReply = !inOrder.some((m) => m.role === "assistant");

  const messages: Anthropic.MessageParam[] = recentHistory(inOrder).map((m) => ({
    // An owner's own reply reads as the assistant's voice to the client.
    role: m.role === "client" ? "user" : "assistant",
    content: m.content || "(no text)",
  }));

  // Per-turn state as a mid-conversation system message: it stays out of the
  // cached prefix, and it cannot be mistaken for something the client typed.
  messages.push({
    role: "system",
    /*
     * Today, first.
     *
     * The assistant was never told the date. Slots come back with a weekday
     * and no year, search takes YYYY-MM-DD, and "tomorrow", "after the 15th"
     * or "not this week" were being worked out from whatever the model last
     * believed the date to be — which is how a customer asking for tomorrow is
     * offered a Thursday three weeks away.
     */
    content:
      `Right now it is ${nowIn(ctx.studio.timezone)} where the business is.

` +
      enquiryStateMessage(
        enquiry as EnquiryState | null,
        ctx.bands,
        ctx.artists,
        contact as ContactState | null,
        ctx.options,
        ctx.forArtist ?? null,
      ),
  } as Anthropic.MessageParam);

  /*
   * The tools need the enquiry's current state to pick the right band, person
   * and deposit without the model having to restate any of it.
   *
   * Read from whichever column this business records it in. Taking only
   * size_band_id would mean a price-list business forgot what had been asked
   * for between one message and the next — the customer would be quoted, and
   * then offered a slot the length of a consultation because nothing knew
   * what they were booked in for.
   */
  const askedFor =
    (ctx.studio.pricing_model === "services"
      ? (enquiry as { service_id?: string | null } | null)?.service_id
      : enquiry?.size_band_id) ?? null;

  const band = ctx.bands.find((b) => b.id === askedFor);
  const quote =
    enquiry?.quote_low_pence != null && enquiry?.quote_high_pence != null
      ? {
          low_pence: enquiry.quote_low_pence,
          high_pence: enquiry.quote_high_pence,
          hit_minimum: false,
        }
      : band
        ? quoteForStudio(ctx.artists, band)
        : null;

  ctx.enquirySizeBandId = askedFor;
  ctx.enquiryArtistId = enquiry?.artist_id ?? null;
  ctx.depositPence = quote ? depositFor(ctx.studio.deposit_rule, quote) : 0;
  ctx.contactEmail = (contact as { email?: string | null } | null)?.email ?? null;

  // Whose link they arrived on decides who the assistant may offer.
  const tools = toolDefinitions(
    ctx.bands,
    ctx.artists,
    ctx.options,
    ctx.studio,
    ctx.forArtist,
    ctx.channel,
  );
  /*
   * Whether the trade's own fields have anywhere to go yet.
   *
   * Cheap and cached, and it decides whether the assistant asks for them at
   * all. Before the migration it must not: it would ask when the vaccinations
   * run out, be told, fail to write it down, and ask again next message.
   */
  const keepsFacts = await hasColumn(ctx.db, "contacts", "trade_facts");

  /*
   * What this business can actually send on, so the assistant stops promising
   * what it cannot. Both halves matter: allowed by the account, and connected.
   */
  const mayUse = (ctx.studio.channels_allowed ?? ["web"]) as string[];
  const connected = await connectedChannels(ctx.db, ctx.studio.id);
  const canReach = connected.filter((c) => mayUse.includes(c));

  const system = studioSystemPrompt(
    ctx.studio,
    ctx.artists,
    ctx.bands,
    ctx.faqs,
    ctx.options,
    ctx.providers ?? {},
    // Whose enquiry this is, so their own voice is used where they have one.
    ctx.forArtist ?? null,
    ctx.signedIn ?? null,
    ctx.channel,
    keepsFacts,
    canReach,
  );

  /*
   * Everything said this turn, not just the last of it. See joinReply — this
   * was overwritten on each pass of the loop, which silently dropped whatever
   * the assistant said before it reached for a tool.
   */
  const spoken: string[] = [];
  let escalated = false;
  let moments: Moment[] = [];
  const spend = { input: 0, output: 0, cache_read: 0, cache_write: 0, cost_micros: 0 };
  // Kept so a surprising reply can be traced back to what the model actually called.
  const toolTrace: { name: string; input: unknown; result: string }[] = [];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    /*
     * Cache the conversation as well as the prompt.
     *
     * The system block is cached and that is the big one, but every pass round
     * this loop appends what the model just said and what the tools answered,
     * and re-sends the whole conversation at full input price — ten times the
     * cached rate. A booking turn goes round three or four times, so the
     * thread is paid for at full price three or four times in a single reply.
     *
     * A breakpoint on the last block of the last message means everything
     * before it is read from cache on the next pass. Measured at 1.8p a reply
     * today, most of it exactly this.
     */
    markCacheable(messages);

    ctx.watch.round();
    /*
     * Streamed, so the words can be shown as they are written.
     *
     * Measured on the live site: ninety per cent of the eight seconds a
     * customer waits is this call. The tools are one per cent and the database
     * either side is nine, so there was nothing cheaper to fix first — the
     * wait is the model writing, and the only thing that shortens it from the
     * customer's side is not making them wait for the full stop.
     *
     * Always streamed, not just when somebody is listening. A second code path
     * for the channels nobody watches would be a path exercised by nothing
     * until the day it broke on a real customer's email; this way every text,
     * every email and every missed call goes down the same one. Without an
     * `onText` the deltas simply go nowhere and `finalMessage` hands back the
     * identical message `create` would have.
     */
    const response = await ctx.watch.time("model", async () => {
      const streamed = client.messages.stream({
      model: MODEL,
      max_tokens: 2000,
      output_config: { effort: EFFORT },
      system: [
        {
          type: "text",
          text: system,
          // An hour, not the default five minutes. Clients reply in their own
          // time, and a cache that expires between two messages means the whole
          // studio prompt is paid for again at full price.
          cache_control: { type: "ephemeral", ttl: "1h" },
        },
      ],
      tools,
      messages,
      });

      if (ctx.onText) {
        /*
         * Only what it says out loud. A tool call is written as a stream of
         * JSON fragments too, and a customer must never see the machinery.
         */
        streamed.on("text", (chunk) => ctx.onText?.(chunk));
      }

      return streamed.finalMessage();
    });

    spend.input += response.usage.input_tokens;
    spend.output += response.usage.output_tokens;
    spend.cache_read += response.usage.cache_read_input_tokens ?? 0;
    spend.cache_write += response.usage.cache_creation_input_tokens ?? 0;
    spend.cost_micros += costOf(response.usage);

    if (response.stop_reason === "refusal") {
      await ctx.db
        .from("conversations")
        .update({ status: "needs_human", ai_paused: true })
        .eq("id", ctx.conversationId);
      // A refusal is a handover like any other, and the widget should show it
      // as one rather than leaving the customer wondering.
      return {
        text: "Let me get someone from the studio to help with that. They'll come back to you shortly.",
        moments: [{ kind: "handover", person: ctx.artists.find((a) => a.active)?.name ?? null }],
      };
    }

    spoken.push(
      ...response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text),
    );

    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    if (response.stop_reason !== "tool_use" || toolUses.length === 0) break;

    messages.push({ role: "assistant", content: response.content });

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const call of toolUses) {
      const outcome = await ctx.watch.time("tools", () =>
        executeTool(call.name, call.input as Record<string, unknown>, ctx),
      );
      if (outcome.escalated) escalated = true;
      /*
       * Only the last of each kind survives.
       *
       * A turn can call get_available_slots twice — offer times, get told none
       * of them suit, look again — and drawing both sets of buttons would
       * leave the customer tapping a time the assistant has already withdrawn.
       * What it settled on last is what it actually said.
       */
      if (outcome.moment) {
        const m = outcome.moment;
        moments = moments.filter((seen) => seen.kind !== m.kind).concat(m);
      }
      toolTrace.push({ name: call.name, input: call.input, result: outcome.result });
      results.push({ type: "tool_result", tool_use_id: call.id, content: outcome.result });
    }

    // All results for one assistant turn go back in a single user message.
    messages.push({ role: "user", content: results });
  }

  let text = joinReply(spoken);

  /*
   * The privacy disclosure is a legal requirement, not a stylistic preference,
   * so it is not left to the model — which reliably drops it in favour of a
   * more natural-sounding opener. Only added if it did not say it itself.
   *
   * Not on the website, where the widget now shows it before anybody types a
   * word. That is the better place for it — Article 13 asks for it at the
   * point the details are collected, which is the moment somebody is deciding
   * whether to type, not the moment they get an answer back. Saying it in both
   * places opens every conversation by telling them the same thing twice,
   * which is the fault this code was written to avoid.
   *
   * Every other channel still needs it here: a text message has no screen of
   * ours to put a line on.
   */
  if (isFirstReply && text && ctx.channel !== "web") {
    const url = ctx.studio.privacy_notice_url;

    /*
     * What the details are actually for.
     *
     * A business with nobody set up cannot book anyone, so "only used to book
     * you in" is untrue for it — the support assistant is exactly that, and it
     * noticed, writing its own corrected version underneath this one. Two
     * disclosures in a row, the first of them wrong.
     */
    const purpose = ctx.artists.some((a) => a.active)
      ? "only used to book you in"
      : "only used to help with what you asked";

    /*
     * Belt and braces against saying it twice.
     *
     * The model is now told not to write one, but it is a model — so anything
     * that reads like a disclosure in its opening line counts as already said.
     * Matching only our own phrasing is what let a reworded one through.
     */
    const opening = text.slice(0, 240);
    const alreadySaid = url
      ? text.includes(url)
      : /(handled by|answered by).{0,40}(assistant|automated)|only used to (book|help|get)/i.test(
          opening,
        );

    if (!alreadySaid) {
      /*
       * The right word for where they are reading it.
       *
       * "This chat" is what it said everywhere, which is true in a chat window
       * and plainly wrong in an email — somebody who has just emailed a
       * cleaning firm is told they are in a chat, by something introducing
       * itself as an assistant, which is a poor first impression at exactly
       * the moment trust is being asked for.
       */
      const where =
        ctx.channel === "email"
          ? "this inbox"
          : ctx.channel === "sms"
            ? "this number"
            : "this chat";

      const notice = `Quick note: ${where} is handled by ${ctx.studio.name}'s assistant, and your details are ${purpose}${url ? ` — ${url}` : "."}`;
      text = `${notice}

${text}`;
    }
  }

  if (!text) {
    text = escalated
      ? "Thanks, I've passed this to the studio and someone will come back to you shortly."
      : "Sorry, I didn't catch that. Could you say it another way?";
  }

  await ctx.db.from("messages").insert({
    conversation_id: ctx.conversationId,
    role: "assistant",
    content: text,
    tool_calls: toolTrace.length ? toolTrace : null,
    usage: spend,
  });

  /*
   * Somebody got in touch, for a business that wants to hear about all of them.
   *
   * Off for most people and deliberately so — an alert for every enquiry is the
   * fastest way to teach somebody to ignore all of them, including the one that
   * mattered. But an owner who has just started trusting this wants to see every
   * one until they believe it, and being unable to ask reads as the product
   * hiding its work.
   *
   * On the first reply only. Every message would mean ten notifications for one
   * conversation, and by the fourth nobody is reading them.
   *
   * Last, and after the reply is saved, because it is the least important thing
   * that happens here. notifyStudio never throws, but the ordering says what is
   * true anyway: the customer being answered comes first.
   */
  if (isFirstReply && ctx.studio.notify_every_enquiry) {
    await notifyStudio(ctx.db, ctx.studio.id, {
      title: `A new enquiry on ${ctx.channel}`,
      body: text.slice(0, 140),
      url: `/conversations/${ctx.conversationId}`,
      // One per conversation. A reply on the same one replaces rather than
      // stacks, which is how the escalation notification already behaves.
      tag: `enquiry-${ctx.conversationId}`,
    });
  }

  return { text, moments: settleMoments(moments) };
}

async function findOrCreateConversation(
  db: ToolContext["db"],
  studioId: string,
  sessionKey: string,
  channel: Channel,
  forArtistId: string | null,
  isTest: boolean,
) {
  /*
   * Scoped to the studio, and that is not optional.
   *
   * Without it, a session key that reached two businesses returned whichever
   * conversation was found first — so a customer who chatted with a salon and
   * then opened an electrician's widget resumed the salon's thread and saw its
   * history. Every business embeds the widget from the same origin, so they
   * share one browser storage area and the same key really does travel.
   */
  const { data: existing } = await db
    .from("conversations")
    .select("*")
    .eq("studio_id", studioId)
    .eq("channel", channel)
    .eq("external_ref", sessionKey)
    .maybeSingle();

  if (existing) {
    const { data: enquiry } = await db
      .from("enquiries")
      .select("id")
      .eq("conversation_id", existing.id)
      .maybeSingle();

    if (enquiry) {
      return { conversation: existing, enquiryId: enquiry.id, contactId: existing.contact_id };
    }

    /*
     * One enquiry per conversation, enforced by the database.
     *
     * Two messages handled at the same time both find none and both insert;
     * the loser used to come back null and be dereferenced, which is a five
     * hundred and no reply at all.
     *
     * Reachable in a way it did not used to be. A missed call leaves a
     * conversation with no enquiry against it, and the customer's reply is the
     * first thing to make one — and Twilio retries a webhook that takes too
     * long, which is exactly what a slow model call looks like. So the retry
     * and the original arrive together, on the very path that exists to catch
     * somebody the business already missed once.
     */
    const { data: created, error: clash } = await db
      .from("enquiries")
      .insert({ conversation_id: existing.id })
      .select("id")
      .single();

    if (created) {
      return { conversation: existing, enquiryId: created.id, contactId: existing.contact_id };
    }

    const { data: theirs } = await db
      .from("enquiries")
      .select("id")
      .eq("conversation_id", existing.id)
      .maybeSingle();

    if (theirs) {
      return { conversation: existing, enquiryId: theirs.id, contactId: existing.contact_id };
    }

    throw new Error(`Could not start enquiry: ${clash?.message ?? "unknown"}`);
  }

  /*
   * On email and text, we already know how to reach them.
   *
   * The session key on those channels is the address they wrote from — it is
   * what the reply goes to. It was being thrown away: every client started
   * life with no name, no number and no address, and was filled in later only
   * if the assistant got round to asking and they got round to answering.
   *
   * So a real customer who emailed in and went quiet left a blank row in the
   * client list, and the business could see that somebody had written and had
   * no way to write back. Seven of those were sitting on Living Canvas's list
   * this morning. The address is the one thing about them that is certain.
   */
  const known = reachableFrom(channel, sessionKey);

  let { data: contact } = await db
    .from("contacts")
    .insert({ studio_id: studioId, channel, is_test: isTest, ...known })
    .select("id")
    .single();

  /*
   * That number is already somebody's.
   *
   * A studio may only hold a number once, so a regular texting in after being
   * added to the client list by hand would have had this insert refused — and
   * a refused insert here is a customer getting no reply at all, which is far
   * worse than the blank row this is trying to avoid. Their existing record is
   * used instead, which is also the right answer: on a text the number is who
   * they are.
   */
  if (!contact && known.phone) {
    const { data: already } = await db
      .from("contacts")
      .select("id")
      .eq("studio_id", studioId)
      .eq("phone", known.phone)
      .limit(1)
      .maybeSingle();
    contact = already ?? null;
  }

  // And if it still could not be made, one with nothing on it rather than none.
  if (!contact) {
    const { data: bare } = await db
      .from("contacts")
      .insert({ studio_id: studioId, channel, is_test: isTest })
      .select("id")
      .single();
    contact = bare ?? null;
  }

  const { data: conversation, error } = await db
    .from("conversations")
    .insert({
      studio_id: studioId,
      contact_id: contact!.id,
      channel,
      external_ref: sessionKey,
      artist_id: forArtistId,
      is_test: isTest,
    })
    .select("*")
    .single();
  /*
   * Somebody else got there first, in the same instant.
   *
   * A session is unique per business, so two messages arriving together on a
   * brand new one both find nothing, both insert, and the second is refused by
   * the index. Nobody should ever see that: it is a customer double-tapping
   * send, or a phone on a poor signal retrying — and what came back was a five
   * hundred and "could not reach them, please try again", at the one moment
   * they are most likely to give up and message somebody else.
   *
   * The throttle cannot prevent it. It lives in memory on one instance, and
   * these two requests are by definition being handled at the same time, very
   * possibly not by the same one.
   */
  if (error?.code === "23505") {
    const { data: theirs } = await db
      .from("conversations")
      .select("*")
      .eq("studio_id", studioId)
      .eq("channel", channel)
      .eq("external_ref", sessionKey)
      .maybeSingle();

    if (theirs) {
      // The contact made a moment ago now has nothing pointing at it.
      if (contact?.id) await db.from("contacts").delete().eq("id", contact.id);

      const { data: already } = await db
        .from("enquiries")
        .select("id")
        .eq("conversation_id", theirs.id)
        .maybeSingle();

      if (already) {
        return { conversation: theirs, enquiryId: already.id, contactId: theirs.contact_id };
      }

      const { data: made } = await db
        .from("enquiries")
        .insert({ conversation_id: theirs.id, artist_id: forArtistId })
        .select("id")
        .single();

      return { conversation: theirs, enquiryId: made!.id, contactId: theirs.contact_id };
    }
  }

  if (error) throw new Error(`Could not start conversation: ${error.message}`);

  const { data: enquiry } = await db
    .from("enquiries")
    .insert({ conversation_id: conversation.id, artist_id: forArtistId })
    .select("id")
    .single();

  return { conversation, enquiryId: enquiry!.id, contactId: contact!.id };
}
