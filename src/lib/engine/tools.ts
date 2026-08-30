import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatPence } from "@/lib/money";
import { quoteForBand, quoteForStudio, depositFor } from "@/lib/quote";
import { verticalPack } from "@/lib/verticals";
import { stripeConfigured } from "@/lib/payments/stripe";
import {
  availableSlots,
  createBooking,
  describeSlot,
  durationFor,
  bookingTypeFor,
  capabilitiesFor,
} from "@/lib/booking";
import type { Artist, PriceBand, ServiceOption, Studio } from "@/lib/types";

export type ToolContext = {
  db: SupabaseClient;
  studio: Studio;
  artists: Artist[];
  bands: PriceBand[];
  conversationId: string;
  enquiryId: string;
  contactId: string;
  options: ServiceOption[];
  /** Current enquiry state, so a tool can pick the right band and person. */
  enquirySizeBandId: string | null;
  enquiryArtistId: string | null;
  /** Deposit owed on the quote so far. */
  depositPence: number;
  /** Where the app is served from, for building payment return links. */
  origin: string;
  contactEmail: string | null;
};

export function toolDefinitions(
  bands: PriceBand[],
  artists: Artist[],
  options: ServiceOption[],
  studio: Studio,
): Anthropic.Tool[] {
  const bandLabels = bands.map((b) => b.size_label);
  const artistNames = artists.filter((a) => a.active).map((a) => a.name);
  const styleValues = options.filter((o) => o.kind === "style").map((o) => o.value);
  const intentValues = options.filter((o) => o.kind === "intent").map((o) => o.value);
  const pack = verticalPack(studio.vertical);
  const who = studio.vocabulary?.practitioner ?? pack.vocabulary.practitioner;

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
            enum: intentValues,
            description: "What they are getting in touch about.",
          },
          description: {
            type: "string",
            description: "What they want done, in their own words where possible.",
          },
          placement: { type: "string", description: "Where on the body, if relevant." },
          size_band: {
            type: "string",
            enum: bandLabels,
            description: "The studio size band that best fits what they described.",
          },
          style: { type: "string", enum: styleValues },
          artist_name: {
            type: "string",
            enum: artistNames,
            description: `Only if they asked for a specific ${who}.`,
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
            description: `Only if they have chosen a ${who}. Leave out for a whole-studio range.`,
          },
        },
        required: ["size_band"],
        additionalProperties: false,
      },
    },
    ...(capabilitiesFor(artists.find((a) => a.active) ?? artists[0]).readsAvailability
      ? [
          {
            name: "get_available_slots",
            description:
              "Real openings in the diary. The ONLY source of times — never invent or " +
              "guess a date. Call it before offering any appointment.",
            input_schema: {
              type: "object" as const,
              properties: {
                artist_name: {
                  type: "string",
                  enum: artistNames,
                  description: `Whose diary to look at. Defaults to the first available ${who}.`,
                },
              },
              additionalProperties: false,
            },
          },
        ]
      : []),
    ...(capabilitiesFor(artists.find((a) => a.active) ?? artists[0]).writesBookings
      ? [
          {
            name: "create_booking",
            description:
              "Take one of the times get_available_slots returned. Only call this once " +
              "they have picked a specific slot and you have their name and a phone or " +
              "email. The slot is held while they pay the deposit.",
            input_schema: {
              type: "object" as const,
              properties: {
                starts_at: {
                  type: "string",
                  description: "The exact starts_at value from get_available_slots.",
                },
                artist_name: { type: "string", enum: artistNames },
              },
              required: ["starts_at"],
              additionalProperties: false,
            },
          },
        ]
      : []),
    ...(stripeConfigured() && studio.deposit_mode !== "none"
      ? [
          {
            name: "send_deposit_link",
            description:
              "Produce the payment link for the deposit on a booking that has been made. " +
              "Before calling this you MUST have told them the deposit amount and read out " +
              "the cancellation policy. Only call it after create_booking has succeeded.",
            input_schema: {
              type: "object" as const,
              properties: {},
              additionalProperties: false,
            },
          },
        ]
      : []),
    {
      name: "escalate_to_owner",
      description:
        "Flag something for the studio owner. Anything medical, anyone under 18, a " +
        "complaint, or a request for a human hands the whole conversation over and you " +
        "stop replying. Any other question you cannot answer is only flagged — the owner " +
        "will come back on that one point, and you carry on helping with everything else.",
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
    case "get_available_slots":
      return getSlots(input, ctx);
    case "create_booking":
      return makeBooking(input, ctx);
    case "send_deposit_link":
      return sendDepositLink(ctx);
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

  const styleValues = ctx.options.filter((o) => o.kind === "style").map((o) => o.value);
  if (typeof input.style === "string" && styleValues.includes(input.style)) {
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
    if (!artist) return { result: `Nobody here called "${input.artist_name}".` };
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
    return { result: `Nobody here called "${input.artist_name}".` };
  }

  const quote = named
    ? quoteForBand(named, band)
    : quoteForStudio(ctx.artists, band);

  if (!quote) {
    return { result: "Nobody is taking bookings, so no quote can be given. Escalate." };
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
      ctx.studio.deposit_mode === "none" ? "" : `Deposit: ${formatPence(deposit)}.`,
      `Typically ${band.hours_low} to ${band.hours_high} hours.`,
      band.requires_consultation
        ? "This size needs a consultation before a session is booked."
        : "This size can be booked straight into a session.",
      "Give these numbers exactly as written. Say it is an estimate confirmed at the consultation.",
    ]
      .filter(Boolean)
      .join(" "),
  };
}

/** Resolves which person's diary to use: the one asked for, or the first available. */
function pickArtist(input: Record<string, unknown>, ctx: ToolContext) {
  if (typeof input.artist_name === "string") {
    return ctx.artists.find(
      (a) => a.name.toLowerCase() === (input.artist_name as string).toLowerCase(),
    );
  }
  const enquiryArtist = ctx.artists.find((a) => a.id === ctx.enquiryArtistId);
  return enquiryArtist ?? ctx.artists.find((a) => a.active);
}

async function getSlots(
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const artist = pickArtist(input, ctx);
  if (!artist) return { result: "Nobody is taking bookings. Escalate." };

  const band = ctx.bands.find((b) => b.id === ctx.enquirySizeBandId);
  const type = bookingTypeFor(band);
  const minutes = durationFor(ctx.studio, band, type);

  let slots;
  try {
    slots = await availableSlots({
      db: ctx.db,
      studio: ctx.studio,
      artist,
      durationMinutes: minutes,
      limit: 4,
    });
  } catch (error) {
    // A diary we cannot read is not an empty diary. Say so rather than offering
    // times on top of real work.
    return {
      result:
        `The diary could not be reached (${(error as Error).message}). Do not offer any ` +
        "times. Ask which days suit them and say the studio will confirm.",
    };
  }

  if (slots.length === 0) {
    return {
      result:
        `Nothing free for ${artist.name} in the next three weeks for a ${minutes}-minute ` +
        `${type}. Ask which days suit them and say the studio will be in touch.`,
    };
  }

  const lines = slots
    .map((s) => `- ${describeSlot(s, ctx.studio.timezone)}  (starts_at: ${s.starts_at})`)
    .join("\n");

  return {
    result: [
      `${type === "consultation" ? "Consultation" : "Session"} with ${artist.name}, ${minutes} minutes.`,
      "Offer these and no others:",
      lines,
      "Give the times in words. Pass the exact starts_at back to create_booking.",
    ].join("\n"),
  };
}

async function makeBooking(
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const artist = pickArtist(input, ctx);
  if (!artist) return { result: "Nobody is taking bookings. Escalate." };

  const startsAt = String(input.starts_at ?? "");
  const when = Date.parse(startsAt);
  if (!Number.isFinite(when)) {
    return { result: "That is not a time from get_available_slots. Call it again." };
  }

  // One live booking per enquiry. Without this, a client saying "yes" twice
  // leaves two slots held and two payment links in the wild.
  const { data: existing } = await ctx.db
    .from("bookings")
    .select("id, starts_at, deposit_status")
    .eq("enquiry_id", ctx.enquiryId)
    .is("cancelled_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    if (Date.parse(existing.starts_at) === when) {
      return {
        result:
          "Already booked at that time — nothing more to do. Confirm it back to them in " +
          "words as though it just went through. Do not mention this message.",
      };
    }
    if (existing.deposit_status === "paid") {
      return {
        result:
          "They already have a paid booking at another time. Do not book a second — " +
          "escalate so the owner can move it.",
      };
    }
    // An unpaid hold at a different time is them changing their mind.
    await ctx.db
      .from("bookings")
      .update({ cancelled_at: new Date().toISOString() })
      .eq("id", existing.id);
  }

  const band = ctx.bands.find((b) => b.id === ctx.enquirySizeBandId);
  const type = bookingTypeFor(band);
  const minutes = durationFor(ctx.studio, band, type);

  // Re-check against the live diary: the slot may have gone since it was offered.
  const stillFree = await availableSlots({
    db: ctx.db,
    studio: ctx.studio,
    artist,
    durationMinutes: minutes,
    limit: 40,
  }).catch(() => null);

  if (stillFree && !stillFree.some((s) => Date.parse(s.starts_at) === when)) {
    return {
      result:
        "That time is no longer free. Apologise, call get_available_slots again and " +
        "offer what comes back.",
    };
  }

  const takesDeposit = ctx.studio.deposit_mode !== "none";

  const result = await createBooking({
    db: ctx.db,
    studio: ctx.studio,
    artist,
    enquiryId: ctx.enquiryId,
    slot: { starts_at: startsAt, ends_at: new Date(when + minutes * 60_000).toISOString() },
    type,
    depositPence: takesDeposit ? ctx.depositPence : 0,
    // Without a deposit there is nothing to wait for, so the slot is confirmed
    // outright rather than held and swept away an hour later.
    holdMinutes: takesDeposit ? 60 : null,
  });

  if (!result.ok) return { result: result.message };

  await ctx.db
    .from("conversations")
    .update({ status: "booked" })
    .eq("id", ctx.conversationId);

  const said = describeSlot(
    { starts_at: startsAt, ends_at: startsAt },
    ctx.studio.timezone,
  );

  return {
    result:
      `Booked: ${type} with ${artist.name}, ${said}. Confirm it back to them in words.` +
      (takesDeposit
        ? " The slot is held for an hour while the deposit is paid."
        : " It is confirmed — there is no deposit to take, so do not mention one."),
  };
}

async function sendDepositLink(ctx: ToolContext): Promise<ToolOutcome> {
  const { data: booking } = await ctx.db
    .from("bookings")
    .select("*")
    .eq("enquiry_id", ctx.enquiryId)
    .is("cancelled_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!booking) {
    return { result: "Nothing is booked yet. Book a time first, then send the link." };
  }
  if (booking.deposit_status === "paid") {
    return { result: "The deposit is already paid. Tell them they are all set." };
  }
  if (booking.deposit_amount_pence <= 0) {
    return { result: "No deposit is due on this booking. Do not send a link." };
  }

  const artist = ctx.artists.find((a) => a.id === booking.artist_id);
  const when = describeSlot(
    { starts_at: booking.starts_at, ends_at: booking.ends_at },
    ctx.studio.timezone,
  );

  // A short link of our own rather than Stripe's, which runs to several hundred
  // characters and reads like something you should not click. It forwards, and
  // mints a fresh Stripe session if the old one has expired.
  const link = `${ctx.origin}/pay/${booking.id}`;

  await ctx.db
    .from("bookings")
    .update({ deposit_status: "link_sent" })
    .eq("id", booking.id);

  return {
    result:
      `Payment link for ${formatPence(booking.deposit_amount_pence)}: ${link}
` +
      "Give them that link exactly as written, on its own line. Say the slot is held " +
      "until it is paid.",
  };
}

/**
 * Reasons the assistant must stop talking altogether. Everything else is a
 * question for the owner, not a reason to abandon the client — silencing the
 * whole conversation over one unanswerable question leaves them with no way to
 * carry on, and swallows anything they say next.
 */
const HANDS_OVER = new Set(["medical", "under_18", "complaint", "asked_for_human"]);

async function escalate(
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const reason = String(input.reason ?? "other");
  const summary = String(input.summary ?? "");

  if (HANDS_OVER.has(reason)) {
    await pauseForOwner(ctx, summary);
    return {
      result:
        "The owner has been notified and is taking over. Tell the client someone from the " +
        "studio will come back to them, then stop replying.",
      escalated: true,
    };
  }

  // Flag it without going silent.
  await ctx.db
    .from("conversations")
    .update({ status: "needs_human" })
    .eq("id", ctx.conversationId);

  await ctx.db.from("messages").insert({
    conversation_id: ctx.conversationId,
    role: "system",
    content: `Question for the owner: ${summary}`,
  });

  return {
    result:
      "Flagged for the owner. Tell them you will check that one with the studio and come " +
      "back to them — then carry on helping with everything else as normal.",
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
