import type { Moment } from "./moments";
import { whoAnswers, type AnsweringMode } from "@/lib/answering";
import { isOutOfHours } from "@/lib/report";
import { notifyStudio } from "@/lib/notify";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  studioSystemPrompt,
  enquiryStateMessage,
  type EnquiryState,
  type ContactState,
} from "./prompt";
import { toolDefinitions, executeTool, type ToolContext } from "./tools";
import { depositFor, quoteForStudio } from "@/lib/quote";
import type { Artist, Channel, Faq, PriceBand, ServiceOption, Studio } from "@/lib/types";
import { NotAnswering } from "./errors";

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
};

export async function runTurn(input: TurnInput): Promise<TurnResult> {
  const db = createAdminClient();

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

  const [people, priced, asked, offered] = await Promise.all([
    db.from("artists").select("*").eq("studio_id", studio.id).order("created_at"),
    db.from("price_bands").select("*").eq("studio_id", studio.id).order("sort_order"),
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
  const failed = [people, priced, asked, offered].find((r) => r.error);
  if (failed) {
    throw new Error(`Could not load ${studio.slug}: ${failed.error!.message}`);
  }

  const artists = people.data;
  const bands = priced.data;
  const faqs = asked.data;
  const options = offered.data;

  /*
   * Which people offer which services.
   *
   * Loaded once per turn and passed down, rather than queried inside a tool
   * that may run several times. A band with nobody named against it is done by
   * everybody, so this is empty for almost every business.
   */
  const { data: providerRows } = await db
    .from("service_providers")
    .select("band_id, artist_id")
    .in("band_id", (bands ?? []).map((b) => b.id));

  const providers: Record<string, string[]> = {};
  for (const row of providerRows ?? []) {
    (providers[row.band_id] ??= []).push(row.artist_id);
  }

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
  if (!input.released) {
    await db.from("messages").insert({
      conversation_id: conversation.id,
      role: "client",
      content: input.message,
      media_urls: input.mediaUrls ?? [],
    });
  }

  if (input.mediaUrls?.length) {
    const { data: current } = await db
      .from("enquiries")
      .select("reference_urls")
      .eq("id", enquiryId)
      .single();
    await db
      .from("enquiries")
      .update({ reference_urls: [...(current?.reference_urls ?? []), ...input.mediaUrls] })
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

  const { text: reply, moments } = await generateReply({
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

  return {
    conversationId: conversation.id,
    reply,
    status: after?.status ?? conversation.status,
    paused: Boolean(after?.ai_paused),
    moments,
  };
}

type ReplyContext = Omit<ToolContext, "db"> & {
  db: ToolContext["db"];
  faqs: Faq[];
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
  const { data } = await db
    .from("bookings")
    .select("id")
    .eq("studio_id", studioId)
    .is("cancelled_at", null)
    .is("held_until", null)
    .lte("starts_at", now)
    .gt("ends_at", now)
    .limit(1);

  return Boolean(data?.length);
}

async function generateReply(
  ctx: ReplyContext,
): Promise<{ text: string; moments: Moment[] }> {
  const client = new Anthropic();

  const { data: history } = await ctx.db
    .from("messages")
    .select("role, content, media_urls")
    .eq("conversation_id", ctx.conversationId)
    .in("role", ["client", "assistant", "owner"])
    .order("created_at");

  const [{ data: enquiry }, { data: contact }] = await Promise.all([
    ctx.db.from("enquiries").select("*").eq("id", ctx.enquiryId).single(),
    ctx.db.from("contacts").select("name, phone, email").eq("id", ctx.contactId).single(),
  ]);

  const isFirstReply = !(history ?? []).some(
    (m) => m.role === "assistant" || m.role === "owner",
  );

  const messages: Anthropic.MessageParam[] = (history ?? []).map((m) => ({
    // An owner's own reply reads as the assistant's voice to the client.
    role: m.role === "client" ? "user" : "assistant",
    content: m.content || "(no text)",
  }));

  // Per-turn state as a mid-conversation system message: it stays out of the
  // cached prefix, and it cannot be mistaken for something the client typed.
  messages.push({
    role: "system",
    content: enquiryStateMessage(
      enquiry as EnquiryState | null,
      ctx.bands,
      ctx.artists,
      contact as ContactState | null,
      ctx.options,
      ctx.forArtist ?? null,
    ),
  } as Anthropic.MessageParam);

  // The tools need the enquiry's current state to pick the right band, person
  // and deposit without the model having to restate any of it.
  const band = ctx.bands.find((b) => b.id === enquiry?.size_band_id);
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

  ctx.enquirySizeBandId = enquiry?.size_band_id ?? null;
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
  );

  let text = "";
  let escalated = false;
  let moments: Moment[] = [];
  const spend = { input: 0, output: 0, cache_read: 0, cache_write: 0, cost_micros: 0 };
  // Kept so a surprising reply can be traced back to what the model actually called.
  const toolTrace: { name: string; input: unknown; result: string }[] = [];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await client.messages.create({
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
        text: "Let me get someone from the studio to help with that — they'll come back to you shortly.",
        moments: [{ kind: "handover", person: ctx.artists.find((a) => a.active)?.name ?? null }],
      };
    }

    text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    if (response.stop_reason !== "tool_use" || toolUses.length === 0) break;

    messages.push({ role: "assistant", content: response.content });

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const call of toolUses) {
      const outcome = await executeTool(
        call.name,
        call.input as Record<string, unknown>,
        ctx,
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

  // The privacy disclosure is a legal requirement, not a stylistic preference,
  // so it is not left to the model — which reliably drops it in favour of a
  // more natural-sounding opener. Only added if it did not say it itself.
  if (isFirstReply && text) {
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
      const notice = `Quick note: this chat is handled by ${ctx.studio.name}'s assistant, and your details are ${purpose}${url ? ` — ${url}` : "."}`;
      text = `${notice}

${text}`;
    }
  }

  if (!text) {
    text = escalated
      ? "Thanks — I've passed this to the studio and someone will come back to you shortly."
      : "Sorry, I didn't catch that. Could you say it another way?";
  }

  await ctx.db.from("messages").insert({
    conversation_id: ctx.conversationId,
    role: "assistant",
    content: text,
    tool_calls: toolTrace.length ? toolTrace : null,
    usage: spend,
  });

  return { text, moments };
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

    const { data: created } = await db
      .from("enquiries")
      .insert({ conversation_id: existing.id })
      .select("id")
      .single();
    return { conversation: existing, enquiryId: created!.id, contactId: existing.contact_id };
  }

  const { data: contact } = await db
    .from("contacts")
    .insert({ studio_id: studioId, channel, is_test: isTest })
    .select("id")
    .single();

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
  if (error) throw new Error(`Could not start conversation: ${error.message}`);

  const { data: enquiry } = await db
    .from("enquiries")
    .insert({ conversation_id: conversation.id, artist_id: forArtistId })
    .select("id")
    .single();

  return { conversation, enquiryId: enquiry!.id, contactId: contact!.id };
}
