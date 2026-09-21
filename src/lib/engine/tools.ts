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
import { samePhone } from "@/lib/channels/phoneNumbers";
import { minutesForClient } from "@/lib/serviceBands";
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
import {
  isRegularRule,
  howManyVisits,
  regularInstants,
  regularSummary,
  type RegularRule,
} from "@/lib/booking/regular";
import { blockedBy, stillToAsk, readFact, type FactValues } from "@/lib/tradeFacts";
import { whoCanBeOffered } from "./offering";
import { missingDetails } from "./reachable";
import type { Artist, OpeningHours, PriceBand, ServiceOption, Studio } from "@/lib/types";
import { readyForRealMoney } from "@/lib/payments/stripe";
import { formForBooking } from "@/lib/forms/forBooking";

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
        "something, with only the fields you just learned. Calling it repeatedly is fine: " +
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
              "are under 18, do not set this. Escalate instead.",
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
                    "Their postcode. Save it as soon as you have it, because it decides whether " +
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
          /*
           * Whatever they actually gave.
           *
           * This said "First name is enough", which was about not badgering
           * somebody for a surname they had not offered — a good intention,
           * read by the model as permission to throw one away. Told "I'm Dawn
           * Pethick, 07700 900978" the garage saved Dawn Pethick and the salon
           * saved Dawn, from the same sentence.
           *
           * The business keeps the poorer record for no reason: two Dawns are
           * then indistinguishable on the client list, and an export or an
           * invoice has half a name on it. Never worth asking for, never worth
           * discarding once said.
           */
          name: {
            type: "string",
            description:
              "Exactly what they gave: \"Dawn Pethick\" if they said that, \"Dawn\" if that is all they said. " +
              "Never ask for a surname, and never drop one they have already given.",
          },
          phone: { type: "string", description: "As they typed it. Do not reformat." },
          email: { type: "string" },
          /*
           * And the few things this trade keeps that nothing else does.
           *
           * Offered only where the pack defines them, and named rather than
           * left open, so the model cannot invent a field nobody reads. Dates
           * are stored as dates, so a vaccination can expire and an MOT can
           * fall due — which is the whole reason these are not free text.
           */
          ...(pack.facts.length
            ? {
                facts: {
                  type: "object" as const,
                  description:
                    "What this business keeps about a customer. Save each one as soon as they " +
                    "say it. Dates can be written however they said them.",
                  properties: Object.fromEntries(
                    pack.facts.map((f) => [
                      f.key,
                      {
                        type: f.type === "yesno" ? "boolean" : f.type === "number" ? "number" : "string",
                        description: f.label + (f.type === "date" ? " (a date)" : ""),
                      },
                    ]),
                  ),
                  additionalProperties: false,
                },
              }
            : {}),
        },
        additionalProperties: false,
      },
    },
    {
      name: "quote_estimate",
      description:
        "Work out the price range for a size band. This is the ONLY way to produce a " +
        "price. Never calculate one yourself. Returns a range, the deposit, and whether " +
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
              "Real openings in the diary. The ONLY source of times. Never invent or " +
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
                    "Only this day of the week, when they have named one: 'have you got " +
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
                    "Set true when they have turned down what you already offered: 'none " +
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
                another_visit: {
                  type: "boolean",
                  description:
                    "True only when they already have an appointment and have told you this is " +
                    "an extra one, not instead of it.",
                },
                /*
                 * A standing slot, for the trades that live on them.
                 *
                 * Only offered where it is the ordinary thing to want. See
                 * VerticalPack.regulars: a cleaner's customer expects the same
                 * morning every week and would rather not be asked twelve
                 * times; a barber's customer would find the question odd.
                 */
                ...(pack.regulars
                  ? {
                      repeats: {
                        type: "string",
                        enum: ["weekly", "fortnightly", "monthly"],
                        description:
                          "Only when they have asked for a regular slot in so many words: " +
                          "\"every week\", \"same time each fortnight\". Books the same time " +
                          "on each date. Leave it out for a one-off.",
                      },
                      visits: {
                        type: "number",
                        description:
                          "How many visits to put in, including the first. Between 2 and 12; " +
                          "6 if they have not said. Only used with repeats.",
                      },
                    }
                  : {}),
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
    ...(stripeConfigured() && effectiveDepositMode(studio, offerable) !== "none"
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
        "stop replying. Any other question you cannot answer is only flagged, and the owner " +
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
    Object.assign(patch, asksFor(ctx.studio, band.id));
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
    const artist = offeredNamed(ctx, input.artist_name as string);
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

/**
 * This trade's own facts, written onto the customer.
 *
 * Merged rather than replaced: somebody giving their MOT date today must not
 * lose the registration they gave in March. Anything unusable — a date nobody
 * could parse, a field this trade does not have — is dropped, because a
 * half-understood answer stored as though it were understood is worse than no
 * answer at all.
 *
 * This lived inside save_enquiry for a day, which is a function that has no
 * facts to save. The model was doing its part perfectly — it sent the breed,
 * the vaccination date and whether the dog was neutered, all from one sentence
 * — and they went into a branch that could never run. The tool then reported
 * "Saved: name, phone" and everything looked right. A misplaced block that
 * reports success is worse than one that throws.
 *
 * Returns what was written, for the tool to say out loud.
 */
async function saveFacts(
  ctx: ToolContext,
  given: Record<string, unknown> | null,
): Promise<{ saved: string[]; failed: string | null }> {
  const packFacts = verticalPack(ctx.studio.vertical).facts;
  if (!packFacts.length || !given || typeof given !== "object") return { saved: [], failed: null };

  const clean: FactValues = {};
  for (const fact of packFacts) {
    if (!(fact.key in given)) continue;
    const value = readFact(fact, given[fact.key]);
    if (value !== null) clean[fact.key] = value;
  }
  if (!Object.keys(clean).length) return { saved: [], failed: null };

  const { data: already } = await ctx.db
    .from("contacts")
    .select("trade_facts")
    .eq("id", ctx.contactId)
    .maybeSingle();

  const merged = { ...((already?.trade_facts as FactValues | null) ?? {}), ...clean };
  const { error } = await ctx.db
    .from("contacts")
    .update({ trade_facts: merged })
    .eq("id", ctx.contactId);

  /*
   * Said, not swallowed. The column arrives with a migration and a deploy that
   * lands first must still save a name and a number — but the assistant is
   * about to tell somebody their vaccination is on file, so if it is not, the
   * tool has to know.
   */
  if (error) return { saved: [], failed: error.message };

  return {
    saved: Object.keys(clean).map(
      (key) => packFacts.find((f) => f.key === key)?.label.toLowerCase() ?? key,
    ),
    failed: null,
  };
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
      /*
       * One shape for a number, so the same person is the same person.
       *
       * She types 07700 900312; the number she arrived on by text is stored as
       * +447700900312. Compared literally those are two different people, and
       * the salon ends up with two records for one regular — her history
       * split, and the twenty minutes her colour needs attached to the half of
       * her nobody is booking.
       *
       * Found on the demo the first time a whole conversation was run through
       * it, which produced a second Leila Osman within a minute.
       */
      patch[key] = key === "phone" ? samePhone(value) : value.trim();
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
      typeof patch.phone === "string" ? await rejoin(ctx, patch) : "no";

    /*
     * Their number, but not their name.
     *
     * A number on file is usually a regular giving the same number as last
     * time. It is not always: somebody mistypes a digit and lands on another
     * customer, and on a website a phone number proves nothing at all. Joining
     * regardless put this conversation on that person's record — the
     * assistant then had their name in front of it, and the confirmation went
     * to their email.
     *
     * So the rest is saved without the number, the two stay apart, and
     * nothing is said about somebody else existing. The business can merge
     * them later, which is the safe direction to be wrong in.
     */
    if (rejoined === "someone else") {
      const { phone: _phone, ...withoutNumber } = patch;
      if (Object.keys(withoutNumber).length) {
        await ctx.db.from("contacts").update(withoutNumber).eq("id", ctx.contactId);
      }
      return {
        result:
          `Saved: ${saved.filter((k) => k !== "phone").join(", ") || "nothing new"}. The number ` +
          "could not be saved against them. Carry on as normal, do not mention this, and do " +
          "not ask for the number again.",
      };
    }

    if (rejoined === "no") return { result: `Could not save: ${error.message}` };

    return {
      result:
        `Saved: ${saved.join(", ")}. They have been here before, so this conversation is ` +
        "now on their existing record. Do not mention any of this; just carry on.",
    };
  }

  /*
   * And the trade's own fields, after the contact is settled rather than
   * before — a returning customer's conversation is moved onto the record
   * they already had, and facts written to the blank first would go with it.
   */
  const facts = await saveFacts(ctx, (input.facts ?? null) as Record<string, unknown> | null);

  if (facts.failed) {
    return {
      result:
        `Saved: ${saved.join(", ")}. Could not save the extra details ` +
        `(${facts.failed}). Do not tell them those are on file.`,
    };
  }

  return { result: `Saved: ${[...saved, ...facts.saved].join(", ")}.` };
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
): Promise<"joined" | "someone else" | "no"> {
  const { data: existing } = await ctx.db
    .from("contacts")
    .select("id, name, email")
    .eq("studio_id", ctx.studio.id)
    .eq("phone", samePhone(String(patch.phone)))
    .maybeSingle();

  if (!existing || existing.id === ctx.contactId) return "no";

  /*
   * Only if the name agrees, or the record has none.
   *
   * First names, because people give "Sam" one time and "Samantha" the next,
   * and that is the same person — while "Sam" arriving on Priya's number is
   * not, however it happened.
   */
  const firstName = (value: unknown) =>
    String(value ?? "").trim().toLowerCase().split(/\s+/)[0] ?? "";
  const theirs = firstName(existing.name);
  const given = firstName(patch.name ?? "");
  if (theirs && given && theirs !== given && !theirs.startsWith(given) && !given.startsWith(theirs)) {
    return "someone else";
  }

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

  if (moved) return "no";
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

  return "joined";
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
      ? offeredNamed(ctx, input.artist_name as string)
      : undefined;

  if (input.artist_name && !named) {
    return { result: `Nobody here called "${input.artist_name}".` };
  }

  const forWhom = whoseWork(ctx, named);
  const theirBand = (await pricedFor(ctx, band, forWhom)) ?? band;

  const quote = forWhom
    ? quoteForBand(forWhom, theirBand)
    : quoteForStudio(ctx.artists, theirBand);

  if (!quote) {
    return { result: "Nobody is taking bookings, so no quote can be given. Escalate." };
  }

  await ctx.db
    .from("enquiries")
    .update({
      quote_low_pence: withVat(quote, ctx.studio).low_pence,
      quote_high_pence: withVat(quote, ctx.studio).high_pence,
      ...asksFor(ctx.studio, band.id),
    })
    .eq("id", ctx.enquiryId);

  // As above — a quote in the same turn as a diary lookup has to inform it.
  ctx.enquirySizeBandId = band.id;

  // What the customer should be told, which is not always what was typed in.
  const shown = withVat(quote, ctx.studio);
  /*
   * And the deposit off that same figure.
   *
   * It was worked out on the price before VAT while the range read out to the
   * customer included it — so a VAT-registered business quoting "£300 to £420
   * including VAT" asked for a deposit calculated on £250 to £350. A fifth
   * short, every time, and it only shows up when somebody reconciles a card
   * statement against an invoice.
   */
  const deposit = depositFor(ctx.studio.deposit_rule, { ...quote, ...shown });

  /*
   * A price of nothing is not a price.
   *
   * A business that has not put its rates in yet has bands with nought in
   * them, and this read that as "free" and told the assistant to give the
   * numbers exactly as written — so a brand new business, on the first day
   * anybody used it, quoted real customers "£0 to £0" and was told to say it
   * with confidence. Found on the empty demo, which is exactly the state every
   * business is in for its first hour.
   *
   * Nothing quoted at all is the honest answer, and it is also the useful one:
   * the assistant can still take the enquiry, still book a consultation, and
   * the owner gives the figure. Saying so plainly stops the model inventing a
   * number to fill the gap.
   */
  if (shown.low_pence <= 0 && shown.high_pence <= 0) {
    return {
      result: [
        `No price is set for ${band.size_label} yet, so there is no estimate to give.`,
        "Do NOT say a price, do not say it is free, and do not guess one.",
        `Tell them ${ctx.studio.name} will confirm the price, and carry on:`,
        "take the enquiry and offer times as normal.",
        `Typically ${band.hours_low} to ${band.hours_high} hours.`,
      ].join(" "),
    };
  }

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
        ? `Say "${shown.note}" when you give the price, because they are VAT registered.`
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
/**
 * Somebody by name, from the people this assistant may offer.
 *
 * Names were matched against everybody on the books — somebody who has left,
 * a person switched off, a stylist the owner has kept off the website. The
 * list of names the model is given is limited, but a name typed by a customer
 * ("can I have Chloe?") or slipped in by a message pretending to be an
 * instruction went straight past it and could book a person who is not
 * offered at all.
 */
function offeredNamed(ctx: ToolContext, name: string): Artist | undefined {
  const wanted = name.trim().toLowerCase();
  return whoCanBeOffered(ctx.artists, ctx.studio, ctx.forArtist ?? null, ctx.channel).find(
    (a) => a.name.toLowerCase() === wanted,
  );
}

function pickArtist(input: Record<string, unknown>, ctx: ToolContext) {
  // The channel decides, and nothing overrides it. An enquiry that arrived on
  // this person's own Instagram is theirs — the assistant must not hand it to
  // somebody else because the model felt like naming a different name. If the
  // client genuinely wants another person, the prompt escalates instead, and a
  // human routes it.
  if (ctx.forArtist) return ctx.forArtist;

  if (typeof input.artist_name === "string") {
    return offeredNamed(ctx, input.artist_name as string);
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

/**
 * This band, priced for the person who is going to do the work.
 *
 * The bands are built once a turn, before anybody has said who they want — so
 * they carry the shop's price, which is the right answer to "how much is a cut"
 * and the wrong one to "how much is a cut with Sarah".
 *
 * Found by asking the live demo both questions. Sarah charges £48 for a cut the
 * shop lists at £38, and the assistant quoted £38 either way. A customer told
 * £38 and charged £48 is a wrong price given out in the business's own name,
 * which is the one thing this must never do.
 *
 * Only for a business pricing by a named list. Bands already price per person,
 * through their hourly rate.
 */
async function pricedFor(
  ctx: ToolContext,
  band: PriceBand | undefined,
  artist: Artist | undefined,
): Promise<PriceBand | undefined> {
  if (!band || !artist || ctx.studio.pricing_model !== "services") return band;

  const { data } = await ctx.db
    .from("service_people")
    .select("price_pence, minutes")
    .eq("service_id", band.id)
    .eq("artist_id", artist.id)
    .maybeSingle();

  if (!data) return band;
  const price = data.price_pence as number | null;
  const minutes = data.minutes as number | null;
  if (price == null && minutes == null) return band;

  return {
    ...band,
    /*
     * Their own price collapses the range, the same way it does everywhere
     * else: a range describes work that varies, and somebody naming their own
     * number has answered the question the range was asking.
     */
    price_low_pence: price ?? band.price_low_pence,
    price_high_pence: price ?? band.price_high_pence,
    duration_minutes: minutes ?? band.duration_minutes,
  };
}

/**
 * Whose prices apply: the person asked for by name, or the one already on the
 * enquiry. Somebody who said "with Sarah" three messages ago should not be
 * quoted the shop's price because this message did not repeat her name.
 */
function whoseWork(ctx: ToolContext, named?: Artist): Artist | undefined {
  return named ?? ctx.artists.find((a) => a.id === ctx.enquiryArtistId);
}

/**
 * How long to set aside, once this client is taken into account.
 *
 * Thick hair that always takes twenty minutes longer; somebody who cannot sit
 * still; a regular who is reliably quicker than the book says. Recorded on the
 * client record by whoever learned it, and until now read by nobody — so the
 * diary went on booking the standard slot and running late all afternoon.
 *
 * Only for a business that prices by its list, because the row is keyed to a
 * service and bands are not services.
 *
 * Never mentioned to the client, and there is nothing here that could: it
 * returns a number of minutes. Nobody wants to be the appointment that needs
 * extra time.
 */
async function minutesFor(
  ctx: ToolContext,
  band: PriceBand | undefined,
  type: "consultation" | "session",
): Promise<number> {
  const base = durationFor(ctx.studio, band, type);

  // A consultation is a fixed short appointment, not the work itself, so what
  // the work takes for this person does not apply to it.
  if (type === "consultation" || !band || ctx.studio.pricing_model !== "services") {
    return base;
  }

  const { data } = await ctx.db
    .from("client_service_times")
    .select("minutes_delta")
    .eq("contact_id", ctx.contactId)
    .eq("service_id", band.id)
    .maybeSingle();

  return minutesForClient(base, data?.minutes_delta, ctx.studio.max_session_minutes);
}

/**
 * Which column an enquiry records what was asked for in.
 *
 * The two pricing models live in different tables, and the columns that point
 * at them both carry a foreign key — so a service id written to size_band_id
 * is not quietly wrong, it is rejected by the database. A business that priced
 * by its list could have quoted perfectly and then failed to save a single
 * enquiry, which is the worst possible half of a feature to ship.
 *
 * One function, used by both places that record it, so the two cannot drift.
 */
function asksFor(studio: Studio, bandId: string): Record<string, string> {
  return studio.pricing_model === "services"
    ? { service_id: bandId }
    : { size_band_id: bandId };
}

async function getSlots(
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const artist = pickArtist(input, ctx);
  if (!artist) return { result: "Nobody is taking bookings. Escalate." };

  /*
   * Priced and timed for whoever is doing it. A slot cut to the shop's
   * forty-five minutes when this person takes forty is the same fault as
   * quoting the shop's price when she charges her own — it just shows up as a
   * diary running late rather than as an argument about money.
   */
  const shopBand = ctx.bands.find((b) => b.id === ctx.enquirySizeBandId);
  const band = await pricedFor(ctx, shopBand, artist);
  const type = bookingTypeFor(band);
  const minutes = await minutesFor(ctx, band, type);

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
          "diary. It is only what they asked for. Say so, and offer to look wider: " +
          "call this again without that restriction and offer what comes back.",
      };
    }

    /*
     * A diary nobody has opened is not a diary that is full.
     *
     * A business between signing up and finishing set-up has no opening hours
     * on it, so every search comes back empty — and the assistant, told only
     * "nothing free", says what anybody would: fully booked for three weeks.
     * That is a lie, it is a lie the business never authorised, and it turns
     * their very first enquiries away at the door. Found on the empty demo,
     * which is the state every business is in for its first hour.
     *
     * Their own hours win where they keep them; otherwise the business's.
     */
    const theirs = (artist as { hours?: OpeningHours[] | null }).hours;
    const week = theirs?.length ? theirs : ctx.studio.hours ?? [];
    const everOpen = week.some((day) => !day.closed);

    if (!everOpen) {
      return {
        result:
          "There are no opening hours set on this business yet, so the diary cannot be " +
          "searched. Do NOT say they are busy or fully booked. That is not true and it " +
          "would turn a customer away. Say you cannot see the diary just now, ask which " +
          "days and times generally suit them, take the rest of their details as normal, " +
          "and say somebody will confirm.",
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

  /*
   * What this customer already has, so their own appointment is not read back
   * to them as somebody else having taken the slot.
   *
   * Found by running the booking check twice. A customer was offered Monday at
   * 8:00, took it, was told "you're booked in with Pete on Monday 21 September
   * at 8:00am" — and then said "yes please, book that in" one more time, the
   * way people do. The assistant looked at the diary again, found 8:00 gone,
   * and said: "the earliest Pete has on Monday 21st is 9:00am — if you'd
   * rather an 8:00am start, he's got Monday 28th."
   *
   * The slot it was reporting as taken was this customer's own booking, made
   * ninety seconds earlier. Somebody who believes that either loses their
   * appointment agreeing to the 28th, or rings the garage to sort out a mess
   * that does not exist. create_booking has had a guard for the same "yes"
   * twice since it was written; looking at the diary had none.
   */
  const { data: theirBookings, error: lookFailed } = await ctx.db
    .from("bookings")
    .select("starts_at")
    .eq("enquiry_id", ctx.enquiryId)
    .is("cancelled_at", null)
    .gt("starts_at", new Date().toISOString())
    .order("starts_at");

  /*
   * A refused read here returns no rows, which reads exactly like a customer
   * with nothing booked — and this whole guard quietly disappears, taking the
   * fault it was added for straight back out with it. Said out loud instead.
   */
  if (lookFailed) {
    console.error(
      `[get_available_slots] could not check what ${ctx.enquiryId} already has: ${lookFailed.message}`,
    );
  }

  const alreadyBooked = (theirBookings ?? []).map((b) =>
    describeSlot({ starts_at: b.starts_at as string, ends_at: b.starts_at as string }, ctx.studio.timezone),
  );

  const lines = slots
    .map((s) => `- ${describeSlot(s, ctx.studio.timezone)}  (starts_at: ${s.starts_at})`)
    .join("\n");

  return {
    result: [
      ...(alreadyBooked.length
        ? [
            `THEY ARE ALREADY BOOKED IN: ${alreadyBooked.join("; ")}. That appointment is ` +
              "theirs and it stands. The time it takes up is gone from the list below for " +
              "that reason. Never tell them it is unavailable, and never offer them a " +
              "different day for it. If they are only confirming, say the booking is made " +
              "and read it back. Offer the times below only if they have asked for another " +
              "appointment as well, or asked to change this one.",
          ]
        : []),
      `${type === "consultation" ? "Consultation" : "Session"} with ${artist.name}, ${minutes} minutes.`,
      "Offer these and no others:",
      lines,
      ...(allSeenBefore
        ? [
            "WARNING: every one of these has already been offered in this conversation. " +
              "If they have turned them down or asked for something else, do not read " +
              "these out again. Call this tool again with different: true, plus " +
              "from_time, to_time, weekday or on_or_after for whatever they told you. " +
              "Only repeat them if they asked you to remind them what the times were.",
          ]
        : []),
      "Offer them in one short sentence, not a bulleted list. A list of four dates is hard work in a text message, and in the chat widget each one is already a button "
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
        ? "These are the soonest, not the whole diary, and there is more free after them. End " +
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

  /*
   * Eighteen, where the law makes it a criminal offence rather than a policy.
   *
   * Tattooing somebody under eighteen is strict liability under the Tattooing
   * of Minors Act 1969, and injectables the same under the 2021 Act. Until now
   * the only stop was a model that happened to ask and happened to save the
   * answer: `pack.ageCheck` added a line to the prompt and nothing else read
   * it. A model that never asked booked the appointment.
   *
   * So the tool refuses. It is the one rule in here that cannot be left to
   * persuasion, because the person who carries the conviction is the owner.
   */
  if (verticalPack(ctx.studio.vertical).ageCheck) {
    const { data: enquiry } = await ctx.db
      .from("enquiries")
      .select("age_confirmed")
      .eq("id", ctx.enquiryId)
      .maybeSingle();

    if (enquiry?.age_confirmed !== true) {
      return {
        result:
          "Not booked. This trade cannot book anybody under 18 and you have not confirmed " +
          "their age yet. Ask them outright whether they are 18 or over, save the answer " +
          "with save_enquiry (age_confirmed), and then create_booking again. If they say " +
          "no, do not book: it is a criminal offence for the business.",
      };
    }
  }

  /*
   * And whatever this trade cannot book without.
   *
   * A groomer cannot take a dog whose vaccinations have run out — or one where
   * nobody knows, which is the same risk. The pack says which facts block, and
   * tradeFacts says why; this refuses and hands the assistant the words to ask
   * with, rather than booking and leaving the owner to notice on the day.
   */
  const packFacts = verticalPack(ctx.studio.vertical).facts;
  if (packFacts.some((f) => f.blocks)) {
    const { data: theirFacts, error: factsError } = await ctx.db
      .from("contacts")
      .select("trade_facts")
      .eq("id", ctx.contactId)
      .maybeSingle();

    /*
     * A failed read is not an empty answer, and here the difference is a
     * business that cannot take a booking.
     *
     * Until the migration runs the column does not exist, PostgREST refuses
     * the query, and reading that as "no vaccination recorded" refuses every
     * appointment a groomer tries to make. The same shape as the backup check
     * that passed on an empty bucket: an error quietly answering a question
     * nobody asked. When we cannot tell, we do not stand in the way.
     */
    const blocked = blockedBy(packFacts, {
      values: ((theirFacts?.trade_facts as FactValues | null) ?? {}) as FactValues,
      failed: Boolean(factsError),
    });

    if (blocked.length) {
      const asks = stillToAsk(packFacts, ((theirFacts?.trade_facts as FactValues | null) ?? {}) as FactValues);
      return {
        result:
          `Not booked. ${blocked.join("; ")}. Ask them` +
          (asks.length ? ` ${asks.join(", and ")}` : " about it") +
          ", save it with save_contact, then create_booking again. Do not book until it is sorted.",
      };
    }
  }

  const missing = missingDetails(who);
  if (missing) {
    return {
      result:
        `Not booked. You do not have ${missing} yet. If they have already told you, ` +
        "call save_contact with it now and then create_booking again, without asking " +
        `them twice. If they have not, ask for ${missing} first.`,
    };
  }

  /*
   * What they already have booked, from now on.
   *
   * This used to take the latest booking on the enquiry and, if it was at a
   * different time and not paid, cancel it — on the reasoning that an unpaid
   * booking is a hold and a new time is a change of mind. That was true when
   * every booking waited on a deposit. Now almost none do: a cleaner's regular
   * texting "can you also do the 20th?" had their confirmed 10th cancelled
   * without a word, and a past job that was done came off the takings.
   *
   * So only a live hold — waiting on a deposit, with time left — is replaced,
   * and only once the new slot has actually been taken. A confirmed booking is
   * never cancelled from here: the assistant asks whether this is an extra
   * visit, and a move goes to the owner.
   */
  const nowIso = new Date().toISOString();
  const { data: upcoming } = await ctx.db
    .from("bookings")
    .select("id, starts_at, deposit_status, held_until")
    .eq("enquiry_id", ctx.enquiryId)
    .is("cancelled_at", null)
    .gt("starts_at", nowIso)
    .order("starts_at");

  const already = (upcoming ?? []) as {
    id: string;
    starts_at: string;
    deposit_status: string;
    held_until: string | null;
  }[];

  // Saying "yes" twice to the same time.
  if (already.some((b) => Date.parse(b.starts_at) === when)) {
    return {
      result:
        "Already booked at that time, so nothing more to do. Confirm it back to them in " +
        "words as though it just went through. Do not mention this message.",
    };
  }

  const liveHold = already.find(
    (b) => b.deposit_status !== "paid" && b.held_until != null && b.held_until > nowIso,
  );
  const confirmed = already.filter((b) => b.id !== liveHold?.id);

  if (confirmed.length > 0 && input.another_visit !== true) {
    const list = confirmed
      .map((b) => describeSlot({ starts_at: b.starts_at, ends_at: b.starts_at }, ctx.studio.timezone))
      .join("; ");
    return {
      result:
        `Not booked yet. They already have ${list}. Ask whether this is an extra visit or ` +
        "instead of that one. Extra: call create_booking again with another_visit true. " +
        "Instead: do not book; escalate so the owner can move it.",
    };
  }

  /*
   * Priced and timed for whoever is doing it. A slot cut to the shop's
   * forty-five minutes when this person takes forty is the same fault as
   * quoting the shop's price when she charges her own — it just shows up as a
   * diary running late rather than as an argument about money.
   */
  const shopBand = ctx.bands.find((b) => b.id === ctx.enquirySizeBandId);
  const band = await pricedFor(ctx, shopBand, artist);
  const type = bookingTypeFor(band);
  const minutes = await minutesFor(ctx, band, type);

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

  // Not being able to look is not the same as it being free.
  if (!stillFree) {
    return {
      result:
        "Could not check the diary just now, so nothing was booked. Tell them you are " +
        "checking and try create_booking once more; if it fails again, escalate.",
    };
  }

  if (!stillFree.some((s) => Date.parse(s.starts_at) === when)) {
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
  // Into whoever is doing it, on a business that pays each person.
  const canTakeMoney = readyForRealMoney(ctx.studio, artist);
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
   * The rest of a standing slot — every Tuesday at five, the second Friday
   * morning of the month.
   *
   * Put in after the first one has actually landed, so a customer never ends
   * up with visits two to six of an appointment that was refused. Each date is
   * checked against the live diary on its own: the business may be shut that
   * week, or the slot may already be somebody else's, and a date that cannot
   * be done is skipped and named rather than quietly dropped.
   */
  const rule = isRegularRule(input.repeats) ? input.repeats : null;
  const wantsRegular = rule != null && verticalPack(ctx.studio.vertical).regulars;
  let series: { rule: RegularRule; made: string[]; skipped: string[] } | null = null;

  if (wantsRegular && rule && !takesDeposit && result.bookingId) {
    series = await bookTheRest({
      ctx,
      artist,
      rule,
      visits: howManyVisits(input.visits),
      firstIso: startsAt,
      firstId: result.bookingId,
      minutes,
      type,
    });
  }

  // The new time is theirs, so the hold they are moving from can go.
  if (liveHold) {
    await ctx.db
      .from("bookings")
      .update({ cancelled_at: new Date().toISOString() })
      .eq("id", liveHold.id)
      .is("cancelled_at", null);
  }

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

  /*
   * A form the service needs signed first — a patch test before colour, a
   * consent before a tattoo. Made now and given to the assistant to put in the
   * reply it is already writing, on the channel the customer is using.
   */
  const { data: bookedFor } = await ctx.db.from("enquiries").select("service_id").eq("id", ctx.enquiryId).maybeSingle();
  const form = result.bookingId
    ? await formForBooking(ctx.db, {
        studioId: ctx.studio.id,
        contactId: ctx.contactId,
        bookingId: result.bookingId,
        serviceId: (bookedFor?.service_id as string | null) ?? null,
        title: null,
        origin: ctx.origin,
        /* Whose chair it is, so their own requirement applies as well as the
           business's. See lib/forms/required. */
        artistId: artist.id,
      })
    : null;

  return {
    result:
      `Booked: ${type} with ${artist.name}, ${said}. Confirm it back to them in words.` +
      (takesDeposit
        ? " The slot is held for an hour while the deposit is paid."
        : " It is confirmed. There is no deposit to take, so do not mention one.") +
      (series
        ? " " +
          regularSummary({
            rule: series.rule,
            made: series.made,
            skipped: series.skipped,
            timezone: ctx.studio.timezone,
          }) +
          (series.made.length > 1
            ? ` The dates are: ${series.made
                .map((iso) => describeSlot({ starts_at: iso, ends_at: iso }, ctx.studio.timezone))
                .join("; ")}.`
            : "")
        : wantsRegular && takesDeposit
          ? " They asked for a regular slot: only this first one is booked, because it is waiting on a deposit. Say you will set the rest up as soon as the deposit is paid."
          : "") +
      (form
        ? ` This appointment needs the "${form.name}" form filled in and signed beforehand. Give them this link, and say it takes a couple of minutes on their phone: ${form.url}`
        : ""),
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

/**
 * Visits two onwards of a standing slot.
 *
 * Each date is offered to the same availability query that produced the first
 * one, so a bank holiday, a week the business is shut, or a slot taken in the
 * meantime is skipped rather than forced in. Nothing here can undo the first
 * booking: the worst case is one appointment and an honest sentence about the
 * rest.
 */
async function bookTheRest(args: {
  ctx: ToolContext;
  artist: Artist;
  rule: RegularRule;
  visits: number;
  firstIso: string;
  firstId: string;
  minutes: number;
  type: "consultation" | "session";
}): Promise<{ rule: RegularRule; made: string[]; skipped: string[] }> {
  const { ctx, artist, rule, visits, firstIso, firstId, minutes, type } = args;

  const wanted = regularInstants(firstIso, rule, visits, ctx.studio.timezone);
  const made = [firstIso];
  const skipped: string[] = [];

  for (const iso of wanted.slice(1)) {
    const free = await availableSlots({
      db: ctx.db,
      studio: ctx.studio,
      artist,
      durationMinutes: minutes,
      onOrAfter: dayIn(iso, ctx.studio.timezone),
      limit: 40,
    }).catch(() => null);

    if (!free || !free.some((s) => Date.parse(s.starts_at) === Date.parse(iso))) {
      skipped.push(iso);
      continue;
    }

    const at = await createBooking({
      db: ctx.db,
      studio: ctx.studio,
      artist,
      enquiryId: ctx.enquiryId,
      slot: {
        starts_at: iso,
        ends_at: new Date(Date.parse(iso) + minutes * 60_000).toISOString(),
      },
      type,
      // The deposit, if there is one, is taken once on the first visit. Nobody
      // pays six deposits to book six cleans.
      depositPence: 0,
      holdMinutes: null,
      repeats: rule,
      repeatParentId: firstId,
    });

    if (at.ok) made.push(iso);
    else skipped.push(iso);
  }

  /*
   * The first one is part of the series too.
   *
   * It is made before the rest, so it cannot carry the rule at the time — and
   * a diary where visits two to six say "weekly" and the first says nothing is
   * a series that appears to start a week late. Set afterwards, and only once
   * something actually followed it: a lone booking marked weekly would be a
   * repeat with nothing repeating.
   */
  if (made.length > 1) {
    await ctx.db.from("bookings").update({ repeats: rule }).eq("id", firstId);
  }

  /*
   * One message to the business about the series, not six. The first booking
   * already tells them somebody has booked; this says what else went in.
   */
  if (made.length > 1) {
    const from = describeSlot(
      { starts_at: firstIso, ends_at: firstIso },
      ctx.studio.timezone,
    );
    void notifyStudio(ctx.db, ctx.studio.id, {
      title: "A regular slot has been booked",
      body: `${made.length} visits with ${artist.name}, ${rule} from ${from}.`,
      url: "/diary",
      tag: `regular-${firstId}`,
      email: {
        subject: `${made.length} regular visits booked with ${artist.name}`,
        text:
          `${made.length} visits, ${rule}, starting ${from}.\n\n` +
          made
            .map((iso) => describeSlot({ starts_at: iso, ends_at: iso }, ctx.studio.timezone))
            .join("\n") +
          (skipped.length > 0
            ? `\n\nThese dates could not be booked and were skipped, because the diary was full or you were shut:\n` +
              skipped
                .map((iso) => describeSlot({ starts_at: iso, ends_at: iso }, ctx.studio.timezone))
                .join("\n")
            : ""),
      },
    }).catch(() => {});
  }

  return { rule, made, skipped };
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
  const doingIt = ctx.artists.find((a) => a.id === booking.artist_id) ?? null;
  if (!readyForRealMoney(ctx.studio, doingIt)) {
    return {
      result:
        "This business cannot take payments yet, so there is no link to send. The " +
        "booking stands as it is. Tell them they are booked in and that nothing is " +
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

  /*
   * Flag it without going silent — and know whether the flag actually landed.
   *
   * This is the safety valve: every question the assistant cannot answer, and
   * every cancellation and change a customer asks for, leaves through here.
   * Both writes threw their answer away, which is the fault that emptied every
   * inbox on every business earlier this month — one status value the database
   * had not been told about and the whole write is refused, silently.
   *
   * The cost here is worse than an empty screen. The customer is told a person
   * has it. The conversation is never marked as needing one. Nobody looks, and
   * a garage keeps a bay free on a Monday morning for a car that was cancelled
   * days ago. Telling somebody their message is with a human when it is not is
   * the one thing this tool exists to never do.
   */
  const { error: flagFailed } = await ctx.db
    .from("conversations")
    .update({ status: "needs_human" })
    .eq("id", ctx.conversationId);

  const { error: noteFailed } = await ctx.db.from("messages").insert({
    conversation_id: ctx.conversationId,
    role: "system",
    content: `Question for the owner: ${summary}`,
  });

  if (flagFailed || noteFailed) {
    console.error(
      `[escalate] could not hand over conversation ${ctx.conversationId}: ` +
        `${flagFailed?.message ?? ""} ${noteFailed?.message ?? ""}`.trim(),
    );
  }

  /*
   * The flag is the part that matters. The note is a line in a thread somebody
   * is already looking at; the flag is what makes them look at all. So a failed
   * note is worth logging and carrying on, and a failed flag means this did not
   * happen and the customer must not be told that it did.
   */
  if (flagFailed) {
    return {
      result:
        "COULD NOT pass this to the owner. It has not reached anybody. Do not say it " +
        "has been passed on, flagged, raised, or that somebody will come back to them: " +
        "none of that is true and they would stop chasing it. Tell them you cannot get " +
        "a message through to the business just now and ask them to ring instead. Then " +
        "carry on helping with everything else as normal.",
    };
  }

  if (filed) {
    return {
      result:
        "Raised as a request with a person, and it is on their Help page where they can " +
        "follow it. Tell them it has been raised and that somebody will come back to " +
        "them there, then carry on helping with everything else as normal. It is with " +
        "them now: do not raise this same question again later in the conversation.",
    };
  }

  /*
   * Handed over, and nothing else. Said plainly because it was not.
   *
   * This wording was written for a question the assistant could not answer,
   * and it is also the only thing said back when a customer asks for something
   * to be *done* — cancel this, move that. Escalating changes nothing in the
   * diary. A person does.
   *
   * Asked to cancel an MOT, the assistant escalated correctly and then told
   * the customer: "Done — that's cancelled. Monday 8am is off the diary and
   * nobody will be expecting the Golf." None of that had happened. The
   * appointment was still there, and a customer who believes it simply does
   * not turn up — so the bay sits empty, or the garage rings to ask where the
   * car is. It had nothing telling it otherwise and filled the gap itself.
   */
  return {
    result:
      "Handed to the owner. NOTHING HAS CHANGED. No appointment has been cancelled, " +
      "moved or altered by this, and none will be until a person does it. Say it is with " +
      "the business and somebody will confirm. Never say it is done, sorted, cancelled, " +
      "moved, or off the diary: none of that is true yet, and they will act on it, which means not " +
      "turning up to an appointment that is still in the book. Then carry on helping with " +
      "everything else as normal. It is with them now: do not raise this same thing again " +
      "later in the conversation.",
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
