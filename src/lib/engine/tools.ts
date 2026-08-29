import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatPence } from "@/lib/money";
import { quoteForBand, quoteForStudio, depositFor } from "@/lib/quote";
import { TATTOO_STYLES } from "@/lib/types";
import type { Artist, PriceBand, Studio, TattooStyle } from "@/lib/types";

export type ToolContext = {
  db: SupabaseClient;
  studio: Studio;
  artists: Artist[];
  bands: PriceBand[];
  conversationId: string;
  enquiryId: string;
  contactId: string;
};

const STYLE_VALUES = TATTOO_STYLES.map((s) => s.value);

export function toolDefinitions(bands: PriceBand[], artists: Artist[]): Anthropic.Tool[] {
  const bandLabels = bands.map((b) => b.size_label);
  const artistNames = artists.filter((a) => a.active).map((a) => a.name);

  return [
    {
      name: "save_enquiry",
      description:
        "Record what you have learned about this enquiry. Call it as soon as you learn " +
        "something, with only the fields you just learned. Calling it repeatedly is fine — " +
        "later values overwrite earlier ones.",
      input_schema: {
        type: "object",
        properties: {
          intent: {
            type: "string",
            enum: ["new_tattoo", "cover_up", "touch_up", "consultation", "question"],
            description: "What they are getting in touch about.",
          },
          description: {
            type: "string",
            description: "What they want tattooed, in their own words where possible.",
          },
          placement: { type: "string", description: "Where on the body." },
          size_band: {
            type: "string",
            enum: bandLabels,
            description: "The studio size band that best fits what they described.",
          },
          style: { type: "string", enum: STYLE_VALUES },
          artist_name: {
            type: "string",
            enum: artistNames,
            description: "Only if they asked for a specific artist.",
          },
          cover_up: {
            type: "boolean",
            description: "True if covering an existing tattoo or scarring.",
          },
          age_confirmed: {
            type: "boolean",
            description:
              "True only if they have confirmed they are 18 or over. If they say they " +
              "are under 18, do not set this — escalate instead.",
          },
          preferred_times: {
            type: "string",
            description: "Days and times that suit them, in their own words.",
          },
        },
        additionalProperties: false,
      },
    },
    {
      name: "save_contact",
      description:
        "Record who you are talking to. Save the name as soon as they give it, and the " +
        "phone or email as soon as you have it. Without a way to reach them the studio " +
        "cannot follow anything up.",
      input_schema: {
        type: "object",
        properties: {
          name: { type: "string", description: "First name is enough." },
          phone: { type: "string", description: "As they typed it. Do not reformat." },
          email: { type: "string" },
        },
        additionalProperties: false,
      },
    },
    {
      name: "quote_estimate",
      description:
        "Work out the price range for a size band. This is the ONLY way to produce a " +
        "price — never calculate one yourself. Returns a range, the deposit, and whether " +
        "a consultation is needed first.",
      input_schema: {
        type: "object",
        properties: {
          size_band: {
            type: "string",
            enum: bandLabels,
            description: "Which size band to quote.",
          },
          artist_name: {
            type: "string",
            enum: artistNames,
            description:
              "Only if they have chosen an artist. Leave out for a whole-studio range.",
          },
        },
        required: ["size_band"],
        additionalProperties: false,
      },
    },
    {
      name: "escalate_to_owner",
      description:
        "Hand the conversation to the studio owner and stop replying. Use for anything " +
        "medical, anyone under 18, complaints, requests for a human, or anything you were " +
        "not told how to answer. After calling this, tell the client the studio will pick " +
        "it up, and say nothing further.",
      input_schema: {
        type: "object",
        properties: {
          reason: {
            type: "string",
            enum: ["medical", "under_18", "complaint", "asked_for_human", "unknown_question", "other"],
          },
          summary: {
            type: "string",
            description: "One or two sentences for the owner explaining what is needed.",
          },
        },
        required: ["reason", "summary"],
        additionalProperties: false,
      },
    },
  ];
}

export type ToolOutcome = { result: string; escalated?: boolean };

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  switch (name) {
    case "save_enquiry":
      return saveEnquiry(input, ctx);
    case "save_contact":
      return saveContact(input, ctx);
    case "quote_estimate":
      return quoteEstimate(input, ctx);
    case "escalate_to_owner":
      return escalate(input, ctx);
    default:
      return { result: `Unknown tool: ${name}` };
  }
}

async function saveEnquiry(
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const patch: Record<string, unknown> = {};
  const saved: string[] = [];

  const copy = (key: string, column = key) => {
    if (input[key] !== undefined && input[key] !== null) {
      patch[column] = input[key];
      saved.push(key);
    }
  };

  copy("intent");
  copy("description");
  copy("placement");
  copy("cover_up");
  copy("age_confirmed");
  copy("preferred_times");

  if (typeof input.style === "string" && STYLE_VALUES.includes(input.style as TattooStyle)) {
    patch.style = input.style;
    saved.push("style");
  }

  if (typeof input.size_band === "string") {
    const band = ctx.bands.find(
      (b) => b.size_label.toLowerCase() === (input.size_band as string).toLowerCase(),
    );
    if (!band) return { result: `No size band called "${input.size_band}".` };
    patch.size_band_id = band.id;
    saved.push("size_band");
  }

  if (typeof input.artist_name === "string") {
    const artist = ctx.artists.find(
      (a) => a.name.toLowerCase() === (input.artist_name as string).toLowerCase(),
    );
    if (!artist) return { result: `No artist called "${input.artist_name}".` };
    patch.artist_id = artist.id;
    saved.push("artist_name");
  }

  if (saved.length === 0) return { result: "Nothing to save." };

  const { error } = await ctx.db.from("enquiries").update(patch).eq("id", ctx.enquiryId);
  if (error) return { result: `Could not save: ${error.message}` };

  // An under-18 answer is a hard stop wherever it surfaces.
  if (input.age_confirmed === false) {
    await pauseForOwner(ctx, "Client indicated they are under 18.");
    return {
      result:
        "Saved. This client is not 18 or over, so the conversation has been handed to the " +
        "owner. Tell them the studio will be in touch and stop.",
      escalated: true,
    };
  }

  return { result: `Saved: ${saved.join(", ")}.` };
}

async function saveContact(
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const patch: Record<string, unknown> = {};
  const saved: string[] = [];

  for (const key of ["name", "phone", "email"] as const) {
    const value = input[key];
    if (typeof value === "string" && value.trim()) {
      patch[key] = value.trim();
      saved.push(key);
    }
  }

  if (saved.length === 0) return { result: "Nothing to save." };

  const { error } = await ctx.db.from("contacts").update(patch).eq("id", ctx.contactId);
  if (error) return { result: `Could not save: ${error.message}` };

  return { result: `Saved: ${saved.join(", ")}.` };
}

async function quoteEstimate(
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const band = ctx.bands.find(
    (b) => b.size_label.toLowerCase() === String(input.size_band).toLowerCase(),
  );
  if (!band) return { result: `No size band called "${input.size_band}".` };

  const named =
    typeof input.artist_name === "string"
      ? ctx.artists.find(
          (a) => a.name.toLowerCase() === (input.artist_name as string).toLowerCase(),
        )
      : undefined;

  if (input.artist_name && !named) {
    return { result: `No artist called "${input.artist_name}".` };
  }

  const quote = named
    ? quoteForBand(named, band)
    : quoteForStudio(ctx.artists, band);

  if (!quote) {
    return { result: "No artists are taking bookings, so no quote can be given. Escalate." };
  }

  await ctx.db
    .from("enquiries")
    .update({
      quote_low_pence: quote.low_pence,
      quote_high_pence: quote.high_pence,
      size_band_id: band.id,
    })
    .eq("id", ctx.enquiryId);

  const deposit = depositFor(ctx.studio.deposit_rule, quote);

  return {
    result: [
      `Estimate for ${band.size_label}${named ? ` with ${named.name}` : ""}: ` +
        `${formatPence(quote.low_pence)} to ${formatPence(quote.high_pence)}.`,
      `Deposit: ${formatPence(deposit)}.`,
      `Typically ${band.hours_low} to ${band.hours_high} hours.`,
      band.requires_consultation
        ? "This size needs a consultation before a session is booked."
        : "This size can be booked straight into a session.",
      "Give these numbers exactly as written. Say it is an estimate confirmed at the consultation.",
    ].join(" "),
  };
}

async function escalate(
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  await pauseForOwner(ctx, String(input.summary ?? ""));
  return {
    result:
      "The owner has been notified and will take over. Tell the client someone from the " +
      "studio will come back to them, then stop replying.",
    escalated: true,
  };
}

/** Flips the conversation to needs_human and stops the assistant answering. */
async function pauseForOwner(ctx: ToolContext, summary: string) {
  await ctx.db
    .from("conversations")
    .update({ status: "needs_human", ai_paused: true })
    .eq("id", ctx.conversationId);

  await ctx.db.from("messages").insert({
    conversation_id: ctx.conversationId,
    role: "system",
    content: `Escalated to owner: ${summary}`,
  });
}
