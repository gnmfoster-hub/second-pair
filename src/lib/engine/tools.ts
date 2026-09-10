import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Moment } from "./moments";
import { formatPence } from "@/lib/money";
import { notifyStudio, alertNewBooking } from "@/lib/notify";
import { offeredIn, type ToolTrace } from "@/lib/booking/offered";
import { quoteForBand, quoteForStudio, depositFor, withVat } from "@/lib/quote";
import { verticalPack } from "@/lib/verticals";
import { coversPostcode } from "@/lib/travel";
import { dayIn } from "@/lib/diaryGaps";
import { stripeConfigured, effectiveDepositMode } from "@/lib/payments/stripe";
import { sendBookingConfirmation } from "@/lib/messaging/confirmation";
import {
  availableSlots,
  createBooking,
  describeSlot,
  durationFor,
  bookingTypeFor,
  capabilitiesFor,
} from "@/lib/booking";
import { whoCanBeOffered } from "./offering";
import { missingDetails } from "./reachable";
import type { Artist, PriceBand, ServiceOption, Studio } from "@/lib/types";
import { readyForRealMoney } from "@/lib/payments/stripe";

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
  /**
   * How the customer reached them.
   *
   * The website is the shop window and can speak for several people; every
   * other channel is somebody's own number or account, and speaks only for
   * them.
   */
  channel: string;
  /**
   * For support conversations: the business the person asking belongs to, so
   * an unanswerable question can be raised as a request in their own account.
   * Null everywhere else, and nothing depends on it being set.
   */
  raisedFor?: string | null;
  enquiryArtistId: string | null;
  /**
   * Set when the channel itself identifies one person — Sarah's own Instagram,
   * or a link with her handle. Everything that picks somebody must respect it:
   * an enquiry that arrived on her account must never be offered Tom's diary.
   */
  forArtist?: Artist | null;
  /**
   * Which people offer which services, when a business has said.
   *
   * Keyed by band, and a band missing from here is one everybody does — which
   * is nearly all of them, and all of them to begin with.
   */
  providers?: Record<string, string[]>;
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
  /** Whose link the customer arrived on, when it was somebody's own. */
  forArtist?: Artist | null,
  /** The website routes; a private number never does. */
  channel: string = "web",
): Anthropic.Tool[] {
  const bandLabels = bands.map((b) => b.size_label);
  /*
   * Who this assistant is allowed to speak for.
   *
   * Two different questions, depending on whose link the customer came in on.
   *
   * On the business's own widget it is whoever the owner has chosen. It used
   * to be everybody active — so a stylist who only takes her own regulars, or
   * an apprentice not ready for the website, was being sold to strangers from
   * the moment somebody added them to the diary.
   *
   * On a person's own link it is that person, and anybody they have said they
   * are happy to cover. Locked to themselves is right for most people and
   * wrong for a receptionist, or for two colleagues who cover for each other.
   */
  const offerable = whoCanBeOffered(artists, studio, forArtist, channel);
  const artistNames = offerable.map((a) => a.name);
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
          ...(studio.travel_mode === "at_premises"
            ? {}
            : {
                job_address: {
                  type: "string",
                  description: "Where the work is, when you go to them.",
                },
                job_postcode: {
                  type: "string",
                  description:
                    "Their postcode. Save it as soon as you have it — it decides whether " +
                    "this is even somewhere the business covers.",
                },
              }),
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
    ...(capabilitiesFor(artists.find((a) => a.active)).readsAvailability
      ? [
          {
            name: "get_available_slots",
            description:
              "Real openings in the diary. The ONLY source of times — never invent or " +
              "guess a date. Call it before offering any appointment. If they have said " +
              "when they want, pass it: asking again without their day returns the same " +
              "soonest times and looks like there is nothing else free.",
            input_schema: {
              type: "object" as const,
              properties: {
                artist_name: {
                  type: "string",
                  enum: artistNames,
                  description: `Whose diary to look at. Defaults to the first available ${who}.`,
                },
                /*
                 * The parameters that were missing, and what it cost.
                 *
                 * The tool took only a name, so it always returned the soonest
                 * times whatever day they fell on. A customer asking for a
                 * Thursday was offered Monday; asking again produced the same
                 * Monday, and the assistant concluded there was nothing else —
                 * on an entirely empty week. It lost a real booking.
                 */
                weekday: {
                  type: "string",
                  enum: [
                    "Sunday", "Monday", "Tuesday", "Wednesday",
                    "Thursday", "Friday", "Saturday",
                  ],
                  description:
                    "Only this day of the week, when they have named one — 'have you got " +
                    "a Thursday'. Leave it out if they have not.",
                },
                on_or_after: {
                  type: "string",
                  description:
                    "Earliest date to look from, as YYYY-MM-DD. Use it for 'after the " +
                    "15th', 'not this week', or 'sometime next month'.",
                },
                /*
                 * The two that were missing, and what they cost.
                 *
                 * Every offer came back as the earliest times of the earliest
                 * days, because that is what the finder does and nothing could
                 * ask it for anything else. So somebody saying "later in the
                 * day" was handed the same nine o'clock, and saying it again
                 * got it again — the assistant looked like it was not
                 * listening, which is the one thing it must never look like.
                 */
                from_time: {
                  type: "string",
                  description:
                    "Earliest time of day, as HH:MM on a 24-hour clock. Use it whenever " +
                    "they say when suits: 'afternoon' is 12:00, 'later in the day' is a " +
                    "few hours after whatever you last offered, 'after school' is 15:30, " +
                    "'evening' is 17:00, 'after three' is 15:00.",
                },
                to_time: {
                  type: "string",
                  description:
                    "Latest time of day to start, as HH:MM. 'Morning' is from_time 09:00 " +
                    "with to_time 12:00; 'before I pick the kids up' is to_time 14:30.",
                },
                different: {
                  type: "boolean",
                  description:
                    "Set true when they have turned down what you already offered — 'none " +
                    "of those', 'anything else?', 'have you got other times'. It leaves " +
                    "out every time already offered in this conversation, so you cannot " +
                    "repeat yourself. Combine it with from_time or weekday when they said " +
                    "what they would prefer.",
                },
              },
              additionalProperties: false,
            },
          },
        ]
      : []),
    ...(capabilitiesFor(artists.find((a) => a.active)).writesBookings
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
    /*
     * Offered only if a link could actually be produced. The platform key on
     * its own is not enough — without the business's own Stripe account the
     * tool refuses, so handing it over invites the assistant to promise a
     * payment it cannot take.
     */
    ...(stripeConfigured() && effectiveDepositMode(studio) !== "none"
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

export type ToolOutcome = {
  result: string;
  escalated?: boolean;
  /**
   * The same decision, structured, for a client that can draw it.
   *
   * Purely additive: `result` is unchanged and still the only thing the model
   * and every other channel see. See moments.ts for why.
   */
  moment?: Moment;
};

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
  copy("job_address");

  // The postcode decides whether the job is even possible, so it is checked
  // before it is stored rather than after a slot has been offered.
  if (typeof input.job_postcode === "string" && input.job_postcode.trim()) {
    patch.job_postcode = input.job_postcode.trim();
    saved.push("job_postcode");

    if (!coversPostcode(ctx.studio.service_areas, input.job_postcode)) {
      await ctx.db.from("enquiries").update(patch).eq("id", ctx.enquiryId);
      return {
        result:
          `Saved, but ${input.job_postcode} is outside the areas this business covers ` +
          `(${ctx.studio.service_areas.join(", ")}). Tell them plainly that it is out of ` +
          "the area, do not offer any times, and do not book anything.",
      };
    }
  }

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
    /*
     * Tell the rest of this turn, not just the database.
     *
     * The context is read once before the tools run, so anything learned
     * during a turn was invisible to every tool after it. A customer who asks
     * the price and the availability in one message — which is how people
     * actually ask — had the band saved and then the diary searched as though
     * nothing were known, which falls back to the consultation length.
     *
     * That offered, and would have booked, a thirty-minute slot for a two and
     * a half hour tattoo: the artist double-booked for the rest of the
     * afternoon, from one ordinary sentence.
     */
    ctx.enquirySizeBandId = band.id;
    saved.push("size_band");
  }

  if (typeof input.artist_name === "string") {
    const artist = ctx.artists.find(
      (a) => a.name.toLowerCase() === (input.artist_name as string).toLowerCase(),
    );
    if (!artist) return { result: `Nobody here called "${input.artist_name}".` };
    // Same reason as the band above: later tools in this turn need to know.
    ctx.enquiryArtistId = artist.id;
    patch.artist_id = artist.id;
    saved.push("artist_name");

    /*
     * And on the conversation, so it lands in that person's inbox.
     *
     * This was recorded on the enquiry alone, and the inbox is filled from
     * conversations — so an enquiry from the website stayed unclaimed even
     * after it had been quoted and booked with somebody by name. Every
     * stylist's inbox was empty and the owner's held everything, which is the
     * opposite of who the work belongs to.
     *
     * Not awaited on failure: this decides which screen an enquiry appears on,
     * and it is not worth losing the enquiry over.
     */
    const { error: unclaimed } = await ctx.db
      .from("conversations")
      .update({ artist_id: artist.id })
      .eq("id", ctx.conversationId)
      .is("artist_id", null);

    if (unclaimed) console.error("[tools] could not assign the conversation", unclaimed.message);
  }

  if (saved.length === 0) return { result: "Nothing to save." };

  const { error } = await ctx.db.from("enquiries").update(patch).eq("id", ctx.enquiryId);
  if (error) return { result: `Could not save: ${error.message}` };

  // An under-18 answer is a hard stop wherever it surfaces.
  if (input.age_confirmed === false) {
    await pauseForOwner(ctx, "Client indicated they are under 18.", "under_18");
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

  if (error) {
    /*
     * The number is already on file, which means they have been here before.
     *
     * A phone number is unique per business, deliberately — it is the thing
     * that says two enquiries are one person. But every web conversation
     * starts a fresh blank contact, so a regular giving the same number they
     * gave last time collided with their own record and the save failed. What
     * the assistant did with that failure was worse than the failure: it told
     * a customer, in a perfectly reasonable tone, that her number was "already
     * on the system against an existing record" so it could not book her, and
     * escalated. None of that was true. It had been handed a database error
     * and made up a story that fitted it.
     *
     * A returning customer is not an error, it is the good case. The
     * conversation joins the record already there, so the history the salon
     * has on her — what she had done, what she paid, what Priya wrote down —
     * is in front of them instead of scattered across a new blank.
     */
    const rejoined =
      typeof patch.phone === "string" ? await rejoin(ctx, patch) : false;

    if (!rejoined) return { result: `Could not save: ${error.message}` };

    return {
      result:
        `Saved: ${saved.join(", ")}. They have been here before — this conversation is ` +
        "now on their existing record. Do not mention any of this; just carry on.",
    };
  }

  return { result: `Saved: ${saved.join(", ")}.` };
}

/**
 * Put this conversation on the record that already holds the number.
 *
 * Returns false if there is nothing to rejoin, which leaves the original
 * error to be reported honestly rather than papered over.
 */
async function rejoin(
  ctx: ToolContext,
  patch: Record<string, unknown>,
): Promise<boolean> {
  const { data: existing } = await ctx.db
    .from("contacts")
    .select("id, name, email")
    .eq("studio_id", ctx.studio.id)
    .eq("phone", String(patch.phone))
    .maybeSingle();

  if (!existing || existing.id === ctx.contactId) return false;

  // Anything the older record never had, it can have now. Nothing it does
  // have is overwritten: what the salon already knows beats what a chat
  // window has just been told.
  const fill: Record<string, unknown> = {};
  if (!existing.name && typeof patch.name === "string") fill.name = patch.name;
  if (!existing.email && typeof patch.email === "string") fill.email = patch.email;
  if (Object.keys(fill).length) {
    await ctx.db.from("contacts").update(fill).eq("id", existing.id);
  }

  const blank = ctx.contactId;
  const { error: moved } = await ctx.db
    .from("conversations")
    .update({ contact_id: existing.id })
    .eq("id", ctx.conversationId);

  if (moved) return false;
  ctx.contactId = existing.id;

  /*
   * Tidy the blank away, but only once nothing points at it. It was made
   * seconds ago by this conversation and should have nothing else on it —
   * "should" is not a reason to delete somebody's client record, so it is
   * checked rather than assumed.
   */
  const [{ count: stillTalking }, { count: stillBooked }] = await Promise.all([
    ctx.db.from("conversations").select("id", { count: "exact", head: true }).eq("contact_id", blank),
    ctx.db.from("bookings").select("id", { count: "exact", head: true }).eq("contact_id", blank),
  ]);

  if (!stillTalking && !stillBooked) {
    await ctx.db.from("contacts").delete().eq("id", blank);
  }

  return true;
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
      quote_low_pence: withVat(quote, ctx.studio).low_pence,
      quote_high_pence: withVat(quote, ctx.studio).high_pence,
      size_band_id: band.id,
    })
    .eq("id", ctx.enquiryId);

  // As above — a quote in the same turn as a diary lookup has to inform it.
  ctx.enquirySizeBandId = band.id;

  const deposit = depositFor(ctx.studio.deposit_rule, quote);
  // What the customer should be told, which is not always what was typed in.
  const shown = withVat(quote, ctx.studio);

  return {
    result: [
      `Estimate for ${band.size_label}${named ? ` with ${named.name}` : ""}: ` +
        `${formatPence(shown.low_pence)} to ${formatPence(shown.high_pence)}` +
        `${shown.note ? ` ${shown.note}` : ""}.`,
      ctx.studio.deposit_mode === "none" ? "" : `Deposit: ${formatPence(deposit)}.`,
      `Typically ${band.hours_low} to ${band.hours_high} hours.`,
      band.requires_consultation
        ? "This size needs a consultation before a session is booked."
        : "This size can be booked straight into a session.",
      shown.note
        ? `Say "${shown.note}" when you give the price — they are VAT registered.`
        : "",
      "Give these numbers exactly as written. Say it is an estimate confirmed at the consultation.",
    ]
      .filter(Boolean)
      .join(" "),
    moment: {
      kind: "quote",
      label: band.size_label,
      person: named?.name ?? null,
      lowPence: shown.low_pence,
      highPence: shown.high_pence,
      note: shown.note ?? null,
      depositPence: ctx.studio.deposit_mode === "none" ? 0 : deposit,
      hoursLow: band.hours_low,
      hoursHigh: band.hours_high,
      needsConsultation: Boolean(band.requires_consultation),
    },
  };
}

/** Resolves which person's diary to use: the one asked for, or the first available. */
function pickArtist(input: Record<string, unknown>, ctx: ToolContext) {
  // The channel decides, and nothing overrides it. An enquiry that arrived on
  // this person's own Instagram is theirs — the assistant must not hand it to
  // somebody else because the model felt like naming a different name. If the
  // client genuinely wants another person, the prompt escalates instead, and a
  // human routes it.
  if (ctx.forArtist) return ctx.forArtist;

  if (typeof input.artist_name === "string") {
    return ctx.artists.find(
      (a) => a.name.toLowerCase() === (input.artist_name as string).toLowerCase(),
    );
  }

  const enquiryArtist = ctx.artists.find((a) => a.id === ctx.enquiryArtistId);
  if (enquiryArtist) return enquiryArtist;

  /*
   * Somebody who actually does this.
   *
   * Falling back to "the first active person" offered a balayage with the nail
   * technician, quoted it at her rate and put it in her diary. A service with
   * nobody named against it is done by everybody, so a business that has not
   * bothered with any of this is unaffected.
   */
  return whoCanDo(ctx, ctx.enquirySizeBandId) ?? ctx.artists.find((a) => a.active);
}

/** The first active person who offers this service, if it is restricted. */
function whoCanDo(ctx: ToolContext, bandId: string | null) {
  if (!bandId) return undefined;
  const allowed = ctx.providers?.[bandId];
  // No rows against a service means everybody does it.
  if (!allowed?.length) return undefined;
  return ctx.artists.find((a) => a.active && allowed.includes(a.id));
}

/**
 * How many times to offer at once.
 *
 * Four fits a text message and a phone screen. It is named because two things
 * depend on it agreeing: what is asked of the diary, and whether the reply is
 * allowed to say there is more after it.
 */
const SLOTS_OFFERED = 4;

/**
 * "14:30" as minutes past midnight, and anything else as nothing at all.
 *
 * The value arrives from the model, so it is checked rather than trusted: a
 * malformed time that quietly became 0 would silently widen the search to the
 * whole day and hand back the same early morning they were trying to get away
 * from.
 */
function minuteOfDay(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (hours > 23 || mins > 59) return null;
  return hours * 60 + mins;
}

/**
 * Every time already offered in this conversation.
 *
 * The tool trace on each assistant message records what this tool returned,
 * and the times are written into it as `starts_at: <iso>` precisely so they
 * can be read back. Failing to find any is not an error — it means nothing has
 * been offered yet, which is the ordinary first call.
 */
async function offeredBefore(ctx: ToolContext): Promise<string[]> {
  const { data } = await ctx.db
    .from("messages")
    .select("tool_calls")
    .eq("conversation_id", ctx.conversationId)
    .not("tool_calls", "is", null)
    .order("created_at", { ascending: false })
    .limit(12);

  return offeredIn((data ?? []).map((row) => row.tool_calls as ToolTrace[] | null));
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

  /*
   * What they actually asked for, if they asked for anything.
   *
   * Checked rather than passed through: the weekday arrives as a word from the
   * model and the date as a string, and both decide which days are searched.
   */
  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const askedWeekday = typeof input.weekday === "string" ? DAYS.indexOf(input.weekday) : -1;
  const askedFrom =
    typeof input.on_or_after === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.on_or_after)
      ? input.on_or_after
      : null;

  const fromMinute = minuteOfDay(input.from_time);
  const toMinute = minuteOfDay(input.to_time);

  /*
   * What has already been turned down.
   *
   * Read out of the conversation's own history rather than asked for, because
   * the alternative is the model copying a list of ISO timestamps back to us
   * and it only has to fumble one for the whole thing to silently do nothing.
   * A boolean it cannot get wrong, and the times come from the record of what
   * was actually offered.
   */
  const offeredAlready = await offeredBefore(ctx);
  const alreadyOffered = input.different === true ? offeredAlready : [];

  let slots;
  try {
    slots = await availableSlots({
      db: ctx.db,
      studio: ctx.studio,
      artist,
      durationMinutes: minutes,
      limit: SLOTS_OFFERED,
      onlyWeekday: askedWeekday >= 0 ? askedWeekday : null,
      onOrAfter: askedFrom,
      fromMinute,
      toMinute,
      exclude: alreadyOffered,
      /*
       * At most two from any one day.
       *
       * Four times on the same morning is one option presented four ways, and
       * it was what a customer saw whenever the diary was empty. Spread over
       * days it is four genuine choices — the difference between finding a
       * time and deciding to ring round instead.
       */
      perDay: 2,
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
    /*
     * Which of the two "nothing" answers this is.
     *
     * A genuinely full diary and a request nobody can meet are the same empty
     * list and completely different things to say. Told only the first, the
     * assistant tells somebody who asked for a Sunday evening that there is
     * nothing free for three weeks — which is false, and sends away a customer
     * who would happily have taken the Tuesday.
     */
    const narrowed = [
      askedWeekday >= 0 ? DAYS[askedWeekday] + "s" : null,
      fromMinute != null || toMinute != null ? "that time of day" : null,
      askedFrom ? "from " + askedFrom : null,
      alreadyOffered.length ? "anything already offered" : null,
    ].filter(Boolean);

    if (narrowed.length) {
      return {
        result:
          `Nothing free that matches ${narrowed.join(" and ")}. That is not a full ` +
          "diary — it is only what they asked for. Say so, and offer to look wider: " +
          "call this again without that restriction and offer what comes back.",
      };
    }

    return {
      result:
        `Nothing free for ${artist.name} in the next three weeks for a ${minutes}-minute ` +
        `${type}. Ask which days suit them and say the studio will be in touch.`,
    };
  }

  /*
   * The net under all of it.
   *
   * Everything above gives the assistant ways to ask for different times. This
   * catches the case where it did not use them: if every time coming back has
   * already been read out in this conversation, the customer is about to be
   * offered the exact times they just turned down. Nothing here refuses to
   * answer — the customer may simply have asked what those times were again —
   * but the assistant is told, in the one place it cannot miss.
   *
   * Worth the extra read. Repeating yourself at somebody is the single most
   * damaging thing this assistant can do, because it is indistinguishable from
   * not listening, and it was live for a fortnight without anything noticing.
   */
  const seen = new Set(offeredAlready.map((iso) => Date.parse(iso)));
  const allSeenBefore =
    seen.size > 0 && slots.every((s) => seen.has(Date.parse(s.starts_at)));

  const lines = slots
    .map((s) => `- ${describeSlot(s, ctx.studio.timezone)}  (starts_at: ${s.starts_at})`)
    .join("\n");

  return {
    result: [
      `${type === "consultation" ? "Consultation" : "Session"} with ${artist.name}, ${minutes} minutes.`,
      "Offer these and no others:",
      lines,
      ...(allSeenBefore
        ? [
            "WARNING: every one of these has already been offered in this conversation. " +
              "If they have turned them down or asked for something else, do not read " +
              "these out again — call this tool again with different: true, plus " +
              "from_time, to_time, weekday or on_or_after for whatever they told you. " +
              "Only repeat them if they asked you to remind them what the times were.",
          ]
        : []),
      "Offer them in one short sentence, not a bulleted list — a list of four dates is hard work in a text message, and in the chat widget each one is already a button "
        + "underneath. Pass the exact starts_at back to create_booking.",
      /*
       * Saying there is more, because four looked like all there was.
       *
       * These are the soonest four of a three-week window, and nothing said
       * so. A customer who wanted a different week read four dates as the
       * whole diary and went elsewhere — the assistant had no idea it was
       * turning work away, because from where it sat it had offered
       * everything it had been given.
       */
      /*
       * Only when the search actually stopped at the cap.
       *
       * Fewer than four means the window came back with everything it had, and
       * telling the model there is more would be handing it an availability it
       * has not been given — the one thing it is never allowed to invent.
       */
      slots.length >= SLOTS_OFFERED
        ? "These are the soonest, not the whole diary — there is more free after them. End " +
          "by saying so and inviting another day: ask what suits if none of these do.\n" +
          "If they want different times, call this tool again and CHANGE SOMETHING, or you " +
          "will get these same times back and repeat yourself word for word. Set different: " +
          "true to leave out everything already offered, and add whatever they told you: " +
          "from_time for later in the day, to_time for earlier, weekday for a named day, " +
          "on_or_after for a later week."
        : "That is everything free in the next three weeks. Do not imply there is more. " +
          "Ask whether any of them work, and if not, say you will get the diary checked.",
    ].join("\n"),
    // Exactly the times it was told to offer, so the buttons and the
    // sentence can never disagree about what is actually free.
    moment: {
      kind: "slots",
      person: artist.name,
      minutes,
      appointment: type === "consultation" ? "consultation" : "session",
      slots: slots.map((sl) => ({
        startsAt: sl.starts_at,
        label: describeSlot(sl, ctx.studio.timezone),
        ...slotParts(sl.starts_at, ctx.studio.timezone),
      })),
    },
  };
}

/**
 * A slot cut into the two things somebody reads.
 *
 * "Saturday 5 Sept" and "10:00 am", separately, so the widget can give the
 * time the weight it deserves and let the day sit quietly beside it. Done in
 * the business's timezone here rather than in the browser, because a visitor
 * abroad reformatting the date themselves is how a London salon ends up
 * offering five in the morning.
 */
function slotParts(startsAt: string, timezone: string): { day: string; time: string } {
  const at = new Date(startsAt);
  const day = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(at);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(at)
    // "10:00 am" reads better than "10:00 AM" beside a lowercase day.
    .replace(/\s?([ap])m$/i, (_m, half) => `${half.toLowerCase()}m`);
  return { day, time };
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

  /*
   * Somebody has to be bookable before they can be booked.
   *
   * The booking tool has always said to collect a name and a way to reach them
   * first, and the assistant usually does. On a live walk-through it did not:
   * the customer typed "Jo Marsh, 07700 900321", the assistant answered "got
   * it, thanks Jo", and then booked without ever calling save_contact. What
   * the business got was nine o'clock on Thursday with no name and no number
   * against it — an hour given away to a stranger they cannot ring.
   *
   * The wording matters as much as the check. The details are usually sitting
   * in the conversation already, unsaved, so the assistant is told to write
   * down what it has rather than to go back and ask. Making a customer repeat
   * something they have just typed is its own way of losing them.
   */
  const { data: who } = await ctx.db
    .from("contacts")
    .select("name, phone, email")
    .eq("id", ctx.contactId)
    .maybeSingle();

  const missing = missingDetails(who);
  if (missing) {
    return {
      result:
        `Not booked — you do not have ${missing} yet. If they have already told you, ` +
        "call save_contact with it now and then create_booking again, without asking " +
        `them twice. If they have not, ask for ${missing} first.`,
    };
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

  /*
   * Re-check against the live diary: the slot may have gone since it was offered.
   *
   * Anchored to the day being booked. Without the anchor this asked for the
   * next forty free slots from today and looked for the chosen time among
   * them — but forty slots is about two days of an open diary, so any booking
   * further out than that was never in the list, and every one of them was
   * refused with "that time is no longer free". The times had been offered by
   * this same code moments earlier.
   *
   * It only showed up in a live walk-through because a filtered offer reaches
   * days an unfiltered re-check cannot: ask for a Thursday and you are handed
   * next Thursday, which is exactly the case that fails. A customer who asked
   * for no particular day got the soonest slot, well inside forty, and booked
   * fine.
   */
  const askedDay = dayIn(new Date(when).toISOString(), ctx.studio.timezone);
  const stillFree = await availableSlots({
    db: ctx.db,
    studio: ctx.studio,
    artist,
    durationMinutes: minutes,
    onOrAfter: askedDay,
    limit: 40,
  }).catch(() => null);

  if (stillFree && !stillFree.some((s) => Date.parse(s.starts_at) === when)) {
    return {
      result:
        "That time is no longer free. Apologise, call get_available_slots again and " +
        "offer what comes back.",
    };
  }

  /*
   * A deposit is only taken if there is somewhere for it to go.
   *
   * Wanting a deposit and being able to receive one are different facts, and
   * only one of them was checked. A business with deposits set to "required"
   * and no Stripe account behind it would hold the slot for an hour, tell the
   * customer to pay, and then let the hold expire — losing a real booking to a
   * payment that was never possible.
   *
   * Worse if the payment did go through: with no connected account the charge
   * falls back to the platform's, so a customer paying a salon's deposit would
   * be paying us. readyForRealMoney has existed since the payments code was
   * written and was never once called.
   *
   * Without Stripe the booking is simply confirmed outright, which is exactly
   * what a business that does not take deposits already does. Better a firm
   * booking than a held one nobody can release.
   */
  const canTakeMoney = readyForRealMoney(ctx.studio);
  const takesDeposit = ctx.studio.deposit_mode !== "none" && canTakeMoney;

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

  /*
   * Something in writing, for a booking that needed no deposit.
   *
   * The confirmation — the email carrying the appointment as a calendar file —
   * was only ever sent from the Stripe webhook, so it arrived when a deposit
   * was paid and at no other time. Every business takes no deposit today,
   * by choice or because Stripe is not connected, so every customer who booked
   * got nothing in writing at all: no confirmation, no calendar entry, nothing
   * to look at in three weeks when they cannot remember whether it was Tuesday
   * or Wednesday.
   *
   * Not awaited, and it cannot throw. A confirmation that failed to send is
   * worth recording and never worth holding up the reply to somebody who has
   * just booked — and it quietly does nothing at all until email is switched
   * on.
   */
  if (!takesDeposit && result.bookingId) {
    void sendBookingConfirmation(ctx.db, result.bookingId);
  }

  /*
   * And tell the business, which nothing did.
   *
   * The customer got a confirmation and a calendar file; the person whose
   * diary it is got nothing at all, and found out by opening the dashboard and
   * looking. For a business that is up a ladder or mid-session — which is the
   * entire market — that is the one thing they are paying not to have to do.
   *
   * Only for a booking that is actually booked. A held slot waiting on a
   * deposit is announced when the money lands, from the Stripe webhook, so
   * nobody is told twice about one appointment.
   */
  if (!takesDeposit && result.bookingId) {
    void alertNewBooking(ctx.db, result.bookingId);
  }

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
    moment: {
      kind: "booked",
      person: artist.name,
      startsAt,
      endsAt: new Date(when + minutes * 60_000).toISOString(),
      label: said,
      ...slotParts(startsAt, ctx.studio.timezone),
      held: takesDeposit,
    },
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

  /*
   * The same gate as the booking itself, because this tool can be reached on
   * its own — the assistant may decide to send a link for a booking made
   * earlier, and by then the reasoning above has been left behind.
   */
  if (!readyForRealMoney(ctx.studio)) {
    return {
      result:
        "This business cannot take payments yet, so there is no link to send. The " +
        "booking stands as it is — tell them they are booked in and that nothing is " +
        "needed now.",
    };
  }

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
    moment: { kind: "deposit", amountPence: booking.deposit_amount_pence, url: link },
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
    await pauseForOwner(ctx, summary, reason);
    return {
      result:
        "The owner has been notified and is taking over. Tell the client someone from the " +
        "studio will come back to them, then stop replying.",
      // A person is coming. The widget says so as a quiet line of its own
      // rather than leaving it buried in a paragraph the customer may not
      // read — waiting is much easier when you can see that you are.
      moment: { kind: "handover", person: ctx.artists.find((a) => a.active)?.name ?? null },
      escalated: true,
    };
  }

  /*
   * If this is support, the flag becomes a request in their own business.
   *
   * Otherwise the owner is told inside a conversation they cannot see later,
   * on a screen built for their customers' enquiries — and the thing they
   * asked about has nowhere to live while it is being sorted out. A request
   * has a subject, a state, and a reply, which is what an unanswered question
   * actually needs.
   */
  const filed = await fileRequest(ctx, summary);

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

  if (filed) {
    return {
      result:
        "Raised as a request with a person, and it is on their Help page where they can " +
        "follow it. Tell them it has been raised and that somebody will come back to " +
        "them there — then carry on helping with everything else as normal. It is with " +
        "them now: do not raise this same question again later in the conversation.",
    };
  }

  return {
    result:
      "Flagged for the owner. Tell them you will check that one with the studio and come " +
      "back to them — then carry on helping with everything else as normal. It is with " +
      "them now: do not raise this same question again later in the conversation.",
  };
}

/**
 * Turn an unanswerable support question into a request in the asker's business.
 *
 * Only for support conversations from somebody signed in — an ordinary
 * business's enquiries are from its customers, who have no account to file
 * anything into.
 *
 * The subject is the assistant's own summary rather than the person's words,
 * because the words are usually mid-conversation and make no sense as a title:
 * "no it still does that" is not something to find again in a list next week.
 */
async function fileRequest(ctx: ToolContext, summary: string): Promise<boolean> {
  if (!ctx.raisedFor || !summary) return false;

  const subject = summary.length > 80 ? summary.slice(0, 77).trimEnd() + "…" : summary;

  const { data, error } = await ctx.db
    .from("support_tickets")
    .insert({
      studio_id: ctx.raisedFor,
      subject,
      status: "open",
      from_conversation_id: ctx.conversationId,
    })
    .select("id")
    .maybeSingle();

  /*
   * A duplicate is the expected outcome, not a failure.
   *
   * One request per conversation is a unique index, so somebody stuck on the
   * same problem for ten minutes raises one request rather than ten. Hitting
   * it means the request already exists, which is the state we wanted.
   */
  if (error) return error.code === "23505";
  if (!data) return false;

  await ctx.db.from("support_messages").insert({
    ticket_id: data.id,
    author: "owner",
    body: summary,
  });

  return true;
}

/** Flips the conversation to needs_human and stops the assistant answering. */
async function pauseForOwner(ctx: ToolContext, summary: string, reason: string) {
  await ctx.db
    .from("conversations")
    .update({ status: "needs_human", ai_paused: true })
    .eq("id", ctx.conversationId);

  await ctx.db.from("messages").insert({
    conversation_id: ctx.conversationId,
    role: "system",
    content: `Escalated to owner: ${summary}`,
  });

  /*
   * This is the one moment the owner genuinely has to be interrupted.
   *
   * The assistant has stopped talking, so somebody is now sitting in a chat
   * with nobody in it. Everything else in this product exists so the owner is
   * not disturbed; this is the exception that makes the rest trustworthy.
   *
   * Awaited but never allowed to throw — a notification that fails must not
   * take the reply down with it.
   */
  await notifyStudio(ctx.db, ctx.studio.id, {
    title: REASON_TITLES[reason] ?? "Someone needs you",
    body: summary || "The assistant has handed a conversation over.",
    url: `/conversations/${ctx.conversationId}`,
    // One notification per conversation, replaced rather than stacked.
    tag: `conv-${ctx.conversationId}`,
  }).catch((error) => console.error("[notify]", error));
}

/**
 * What the phone says on the lock screen.
 *
 * Specific enough to know whether it can wait until the current client is out
 * of the chair, without putting anything private in it — a lock screen is read
 * by whoever is stood next to them.
 */
const REASON_TITLES: Record<string, string> = {
  complaint: "A complaint needs you",
  medical: "A medical question needs you",
  under_18: "Someone under 18 got in touch",
  asked_for_human: "Someone asked for a person",
};
