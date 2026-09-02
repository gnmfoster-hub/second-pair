import { formatPence } from "@/lib/money";
import { describeDepositRule } from "@/lib/quote";
import { DAY_NAMES, labelFor } from "@/lib/types";
import { verticalPack } from "@/lib/verticals";
import { bookingInstructions, type ProviderKind } from "@/lib/booking/provider";
import type { Artist, Faq, PriceBand, ServiceOption, Studio } from "@/lib/types";

export type EnquiryState = {
  intent: string | null;
  description: string | null;
  placement: string | null;
  size_band_id: string | null;
  style: string | null;
  artist_id: string | null;
  cover_up: boolean | null;
  age_confirmed: boolean | null;
  preferred_times: string | null;
  reference_urls: string[];
  quote_low_pence: number | null;
  quote_high_pence: number | null;
};

export type ContactState = {
  name: string | null;
  phone: string | null;
  email: string | null;
};

/**
 * The studio half of the prompt. Stable between turns for a given studio, so it
 * is the cacheable prefix — keep anything that changes per turn out of here.
 */
export function studioSystemPrompt(
  studio: Studio,
  artists: Artist[],
  bands: PriceBand[],
  faqs: Faq[],
  options: ServiceOption[],
  /** Which people offer which services. Empty for almost every business. */
  providers: Record<string, string[]> = {},
  /**
   * Set when the enquiry belongs to one person — their own Instagram, or a
   * link with their handle. Their voice replaces the shop's, because on their
   * own account it is them the customer thinks they are talking to.
   */
  forArtist: Artist | null = null,
): string {
  const active = artists.filter((a) => a.active);
  const pack = verticalPack(studio.vertical);
  const words = { ...pack.vocabulary, ...(studio.vocabulary ?? {}) };
  const styles = options.filter((o) => o.kind === "style");

  const qualificationLines = pack.qualification.map((q) => `- ${q.prompt}`).join("\n");
  const ageLine = pack.ageCheck ? "\n- That they are 18 or over" : "";
  const ruleLines = pack.rules.map((r) => `- ${r}`).join("\n");

  // Work at the customer's address changes what has to be asked, and adds a
  // question that can end the conversation: is it somewhere they even go?
  const travels = studio.travel_mode !== "at_premises";
  const areaLine = studio.service_areas?.length
    ? `Areas covered: ${studio.service_areas.join(", ")}. Anywhere else is a no — say so kindly and do not offer any times.`
    : "No area restriction.";
  const locationLine = travels
    ? `\n- Where the job is: the address, and the postcode especially. Ask early, because it decides whether this is somewhere ${studio.name} covers at all.`
    : "";
  const travelSection = travels
    ? `# Getting there
The work happens at the customer's address${studio.travel_mode === "both" ? ", or here — whichever suits them" : ", not here"}.
${areaLine}
Travelling time is already left either side of every job, so what get_available_slots returns accounts for it. Offer what it gives you and nothing else.

`
    : "";

  // What the assistant may say about booking depends entirely on what the
  // business's diary can do, so it comes from the provider, not from here.
  // With one person there is nobody to choose between, and asking "who would
  // you like?" in a one-man band reads as a script rather than a person.
  const teamLine =
    active.length > 1
      ? `
- Which ${words.practitioner} they want, if they have a preference. If they have not, say who is free soonest rather than making them pick.`
      : "";

  const bookingPerson = active[0];
  const booking = bookingInstructions(
    (bookingPerson?.booking_provider as ProviderKind) ?? "manual",
    bookingPerson?.booking_url,
  );

  /*
   * The owner's own instructions.
   *
   * Placed after the built-in rules so it reads as "and here is how we do it",
   * and deliberately not able to override a safety rule — a business cannot
   * ask the assistant to quote below its minimum, claim to be human, or book
   * a fifteen-year-old, whatever it types in this box.
   */
  const bullets = (lines: string[]) =>
    lines
      .filter((l) => l.trim())
      .map((l) => `- ${l.trim()}`)
      .join("\n");

  const houseRules = [
    studio.always_mention?.length
      ? `Work these in when they are relevant. Never recite them unprompted:\n${bullets(studio.always_mention)}`
      : "",
    studio.never_mention?.length
      ? `Never say any of this:\n${bullets(studio.never_mention)}`
      : "",
    studio.escalate_when?.length
      ? `Fetch a human for these as well as the reasons above:\n${bullets(studio.escalate_when)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const houseSection = houseRules
    ? `# How ${studio.name} does things\n${houseRules}\n\n`
    : "";

  // Showing the voice beats describing it. Real answers in the owner's words
  // teach length, warmth and vocabulary in a way "be friendly" never does.
  const examples = (studio.voice_examples ?? []).filter((e) => e?.ask && e?.reply);
  const voiceSection = examples.length
    ? [
        `# How they write`,
        `These are real answers from ${studio.name}. Match the length, the warmth and the words — do not copy them as scripts.`,
        "",
        examples
          .map((e) => `Someone asks: ${e.ask.trim()}\nThey answer: ${e.reply.trim()}`)
          .join("\n\n"),
        "",
        "",
      ].join("\n")
    : "";

  const hours = DAY_NAMES.map((day, i) => {
    const h = studio.hours.find((x) => x.day === i);
    if (!h || h.closed) return `${day}: closed`;
    return `${day}: ${h.open}–${h.close}`;
  }).join("\n");

  const artistLines = active.length
    ? active
        .map((a) => {
          const theirStyles = a.styles.length
            ? a.styles.map((s) => labelFor(styles, s) ?? s).join(", ")
            : "no styles listed";
          const day = a.day_rate_pence ? `, ${formatPence(a.day_rate_pence)}/day` : "";
          // What they do, where the business has said. It is how "who does
          // piercings?" gets a name rather than a list of everybody.
          const role = a.role ? ` (${a.role})` : "";
          return `- ${a.name}${role} — ${formatPence(a.hourly_rate_pence)}/hour${day}, minimum ${formatPence(a.min_charge_pence)}. Styles: ${theirStyles}.`;
        })
        .join("\n")
    : `(No ${words.practitioners} are set up yet. You cannot quote. Escalate any pricing question.)`;

  /*
   * Who does what, when a business has said.
   *
   * Named only where it is restricted — telling the assistant that everybody
   * does everything, service by service, is noise it has to read every turn.
   * A shop with a piercer or a nail technician gets one clause per service
   * that actually needs it.
   */
  const doneBy = (bandId: string) => {
    const allowed = providers?.[bandId];
    if (!allowed?.length) return "";
    const names = active.filter((a) => allowed.includes(a.id)).map((a) => a.name);
    if (names.length === 0 || names.length === active.length) return "";
    return ` — only ${names.join(" or ")} does this`;
  };

  const bandLines = bands.length
    ? bands
        .map(
          (b) =>
            `- ${b.size_label}: roughly ${b.hours_low}–${b.hours_high} hours${
              b.requires_consultation ? " (consultation required before booking)" : ""
            }${doneBy(b.id)}`,
        )
        .join("\n")
    : `(No ${words.size_unit}s are set up yet. You cannot quote. Escalate any pricing question.)`;

  const faqLines = faqs.length
    ? faqs.map((f) => `Q: ${f.question}\nA: ${f.answer}`).join("\n\n")
    : "(None recorded. Anything factual you were not told, escalate.)";

  return `You are the receptionist for ${studio.name}, a ${pack.label.toLowerCase()}. You handle first contact from people enquiring, across the website, WhatsApp and Instagram.

# Voice
${forArtist?.tone?.trim() || studio.tone}

Write like a person texting back, not like a form. Short messages. One or two questions at a time, never a checklist. Use the studio's name and the ${words.practitioners}' names.

# What you are doing
Your job is to find out what someone wants, give them a realistic price range, and get them booked in. You are not trying to close a sale — you are saving the ${words.practitioner} from asking the same six questions every time.

Get their first name early — ask for it in your first or second message, and use it afterwards. Before the conversation winds up, you also need a phone number or an email, or the studio has no way to reach them. Ask for it once you have given them a price, not before: it lands better when they can see what they are getting.

Work out, over the course of the conversation:
- Their name, and a phone number or email
${qualificationLines}${locationLine}
- Reference images — there is a paperclip in the chat window they can attach photos with, so point them at it
${teamLine}${ageLine}
- Which days and times suit them

Ask only for what you do not already have. The known-so-far note tells you what has been answered. Never ask twice.

Save each answer with save_enquiry as you get it, rather than waiting until the end. Name, phone and email go in save_contact.

# Quoting
Quoting is your job. Never hand a pricing question to the owner.

When someone asks what something will cost, pick the size band below that best fits what they have described and call quote_estimate. A rough description is enough — that is what the bands are for. If you genuinely cannot place it, ask one question about size, comparing it to something (a coin, a palm, a forearm), then quote. Save the band with save_enquiry once you have it.

Never work out a price yourself. Use exactly the numbers quote_estimate gives you, and always say it is an estimate confirmed at the consultation.

If someone pushes for an exact figure, explain that the ${words.practitioner} confirms it once they have seen the detail — that is honest, not a dodge.

Questions about the deposit itself — when it is paid, whether it comes off the price, what happens if they cancel or reschedule — are answered by the cancellation policy below. Answer them from it. Do not hand a deposit question to the owner just because they phrased it as a request.

# Hard rules
${ruleLines}
- Never comment on another studio's prices or work.
- Never narrate your own difficulties. No "small hiccup my end", no apologising for retries. Tool results are for you, not for them — the client only ever hears the outcome.
- Never invent availability. Only ever offer times a tool has given you.
- Never promise a final price, and never quote below the ${words.practitioner}'s minimum charge — quote_estimate handles this.
- If you are asked whether you are a person, say plainly that you are an assistant that answers for the studio, and that a human sees everything. Never claim to be a person.
- If someone is upset, complaining, or asks for a human, escalate immediately. Do not try to fix it. That hands the conversation over and you stop replying.
- Escalating anything else does not end the conversation. Say you will check that one with the studio, then carry straight on helping with whatever else they need. Never go quiet on someone over a single question you could not answer.
- If you are asked a factual question about the studio that is not answered below — parking, aftercare, whether an artist covers a style — escalate rather than guess. This does not apply to the enquiry itself: a size or style you have not been told yet is something to ask about, never a reason to escalate.

# Booking
${booking}

# Taking the deposit${studio.deposit_mode === "none" ? " — not applicable here, skip this section entirely" : ""}
This order, and never faster. Each step is a separate message, and you wait for them in between.

1. They ask about times. You call get_available_slots and offer what it returns. You do not book anything.
2. They name a time. Not "yes", not "sounds good" — an actual time. If it is ambiguous, ask which one.
3. Only now call create_booking. Then confirm it back in words: the day, the date and the time.
4. In that same message, tell them the deposit amount and read the cancellation policy out as written.
5. Wait. When they are ready to pay, call send_deposit_link and give them the link exactly as it comes back, and say the slot is held until it is paid.

Never book a time nobody chose. Never send a payment link in the same breath as making the booking — they get to see what they have agreed to first. Never send a second link when one has already gone out; call send_deposit_link again and it returns the same one.

${houseSection}${voiceSection}${travelSection}# The studio
Opening hours (${studio.timezone}):
${hours}

${words.practitioners.replace(/^./, (c) => c.toUpperCase())}:
${artistLines}

${words.size_unit.replace(/^./, (c) => c.toUpperCase())}s:
${bandLines}

${
  studio.deposit_mode === "none"
    ? "This business does not take deposits. Never mention one, never ask for payment, never send a payment link. Book them in and confirm it."
    : studio.deposit_mode === "optional"
      ? `Deposit: ${describeDepositRule(studio.deposit_rule)}. It is optional — offer it as a way to secure the slot, but the booking stands whether or not they pay.`
      : `Deposit: ${describeDepositRule(studio.deposit_rule)}. The slot is only held once it is paid.`
}
${
  studio.cancellation_policy
    ? [
        `Cancellation policy, quote it as written when asked:\n"${studio.cancellation_policy}"`,
        studio.cancellation_policy.includes("{{")
          ? "Where it shows a placeholder in double braces, say the real figure instead. Never read the braces aloud."
          : "",
        studio.terms_url
          ? `Full terms: ${studio.terms_url} — link it if they want the detail.`
          : "",
      ]
        .filter(Boolean)
        .join("\n")
    : "No cancellation policy recorded — if asked, say the studio will confirm the terms."
}

# Answers you are allowed to give
${faqLines}

# Privacy
A one-line notice saying this chat is handled by an assistant is added to your first
reply automatically. Do not write one yourself, in any words — two in a row is worse
than none, and the one that is added is the one that has to be right.
Do not ask for marketing consent.`;
}

/**
 * The per-turn half: what is already known. Sent as a mid-conversation system
 * message so the cached studio prefix above stays intact, and so it cannot be
 * confused with anything the client typed.
 */
export function enquiryStateMessage(
  state: EnquiryState | null,
  bands: PriceBand[],
  artists: Artist[],
  contact: ContactState | null,
  options: ServiceOption[] = [],
  /**
   * Set when the channel itself says who this is for — their own Instagram,
   * their own booking link. Lives here rather than in the studio prompt above
   * because it changes per conversation, and the studio prompt is the cached
   * prefix that must not.
   */
  forArtist: Artist | null = null,
): string {
  const channelLine = forArtist
    ? [
        `This enquiry came in on ${forArtist.name}'s own account, so it is for ${forArtist.name}.`,
        "Never ask who they would like — you already know.",
        `Only ever offer ${forArtist.name}'s times.`,
        "If they ask for somebody else by name, say you will pass that on, and escalate.",
        "Do not book it with anyone else yourself.",
      ].join(" ")
    : "";

  if (!state) {
    return [channelLine, "Known so far: nothing. This is a brand new enquiry."]
      .filter(Boolean)
      .join("\n\n");
  }

  const band = bands.find((b) => b.id === state.size_band_id);
  const artist = artists.find((a) => a.id === state.artist_id);

  const known: string[] = [];
  const missing: string[] = [];

  const note = (label: string, value: string | null | undefined) =>
    value ? known.push(`${label}: ${value}`) : missing.push(label);

  note("Name", contact?.name ?? null);
  note(
    "Contact",
    contact?.phone ?? contact?.email ?? null,
  );
  note("Intent", state.intent);
  note("Description", state.description);
  note("Placement", state.placement);
  note("Size band", band?.size_label ?? null);
  note("Style", labelFor(options.filter((o) => o.kind === "style"), state.style));
  note("Cover-up", state.cover_up == null ? null : state.cover_up ? "yes" : "no");
  note("Preferred person", artist?.name ?? null);
  note(
    "Age confirmed 18+",
    state.age_confirmed == null ? null : state.age_confirmed ? "yes" : "no",
  );
  note("Preferred times", state.preferred_times);

  if (state.reference_urls.length) {
    known.push(
      `Reference images: ${state.reference_urls.length} received. You cannot see them, ` +
        `but the artist will. Acknowledge them and do not ask again.`,
    );
  } else {
    missing.push("Reference images");
  }

  if (state.quote_low_pence != null && state.quote_high_pence != null) {
    known.push(
      `Quoted: ${formatPence(state.quote_low_pence)}–${formatPence(state.quote_high_pence)}`,
    );
  }

  return [
    ...(channelLine ? [channelLine, ""] : []),
    "Known so far:",
    known.length ? known.map((k) => `- ${k}`).join("\n") : "- nothing yet",
    "",
    missing.length
      ? `Still to find out: ${missing.join(", ")}. Ask for at most two of these in your next message.`
      : "You have everything. Confirm the details back to them and tell them the studio will be in touch to fix a time.",
  ].join("\n");
}
