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
};

export async function runTurn(input: TurnInput): Promise<TurnResult> {
  const db = createAdminClient();

  const { data: studio } = await db
    .from("studios")
    .select("*")
    .eq("slug", input.studioSlug)
    .maybeSingle();
  if (!studio) throw new Error(`No studio with slug "${input.studioSlug}"`);

  const [{ data: artists }, { data: bands }, { data: faqs }, { data: options }] =
    await Promise.all([
      db.from("artists").select("*").eq("studio_id", studio.id).order("created_at"),
      db.from("price_bands").select("*").eq("studio_id", studio.id).order("sort_order"),
      db.from("faqs").select("*").eq("studio_id", studio.id).order("sort_order"),
      db.from("service_options").select("*").eq("studio_id", studio.id).order("sort_order"),
    ]);

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

  await db.from("messages").insert({
    conversation_id: conversation.id,
    role: "client",
    content: input.message,
    media_urls: input.mediaUrls ?? [],
  });

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

  // The owner has taken this one over. Record what the client said and stay quiet.
  if (conversation.ai_paused) {
    return {
      conversationId: conversation.id,
      reply: null,
      status: conversation.status,
      paused: true,
    };
  }

  const reply = await generateReply({
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
  await db.from("conversations").update(patch).eq("id", conversation.id);

  return {
    conversationId: conversation.id,
    reply,
    status: after?.status ?? conversation.status,
    paused: Boolean(after?.ai_paused),
  };
}

type ReplyContext = Omit<ToolContext, "db"> & {
  db: ToolContext["db"];
  faqs: Faq[];
};

async function generateReply(ctx: ReplyContext): Promise<string> {
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

  const tools = toolDefinitions(ctx.bands, ctx.artists, ctx.options, ctx.studio);
  const system = studioSystemPrompt(
    ctx.studio,
    ctx.artists,
    ctx.bands,
    ctx.faqs,
    ctx.options,
    ctx.providers ?? {},
    // Whose enquiry this is, so their own voice is used where they have one.
    ctx.forArtist ?? null,
  );

  let text = "";
  let escalated = false;
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
      return "Let me get someone from the studio to help with that — they'll come back to you shortly.";
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

  return text;
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
