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

const MODEL = "claude-opus-5";

/** A runaway loop would burn tokens and never reply. Real turns use two or three. */
const MAX_ITERATIONS = 8;

export type TurnInput = {
  studioSlug: string;
  sessionKey: string;
  channel: Channel;
  message: string;
  mediaUrls?: string[];
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

  const { conversation, enquiryId, contactId } = await findOrCreateConversation(
    db,
    studio.id,
    input.sessionKey,
    input.channel,
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
    depositPence: 0,
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

  const tools = toolDefinitions(ctx.bands, ctx.artists, ctx.options, ctx.studio);
  const system = studioSystemPrompt(
    ctx.studio,
    ctx.artists,
    ctx.bands,
    ctx.faqs,
    ctx.options,
  );

  let text = "";
  let escalated = false;
  // Kept so a surprising reply can be traced back to what the model actually called.
  const toolTrace: { name: string; input: unknown; result: string }[] = [];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      output_config: { effort: "medium" },
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      tools,
      messages,
    });

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
  });

  return text;
}

async function findOrCreateConversation(
  db: ToolContext["db"],
  studioId: string,
  sessionKey: string,
  channel: Channel,
) {
  const { data: existing } = await db
    .from("conversations")
    .select("*")
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
    .insert({ studio_id: studioId, channel })
    .select("id")
    .single();

  const { data: conversation, error } = await db
    .from("conversations")
    .insert({
      studio_id: studioId,
      contact_id: contact!.id,
      channel,
      external_ref: sessionKey,
    })
    .select("*")
    .single();
  if (error) throw new Error(`Could not start conversation: ${error.message}`);

  const { data: enquiry } = await db
    .from("enquiries")
    .insert({ conversation_id: conversation.id })
    .select("id")
    .single();

  return { conversation, enquiryId: enquiry!.id, contactId: contact!.id };
}
