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
): string {
  const active = artists.filter((a) => a.active);
  const pack = verticalPack(studio.vertical);
  const words = { ...pack.vocabulary, ...(studio.vocabulary ?? {}) };
  const styles = options.filter((o) => o.kind === "style");

  const qualificationLines = pack.qualification.map((q) => `- ${q.prompt}`).join("\n");
  const ageLine = pack.ageCheck ? "\n- That they are 18 or over" : "";
  const ruleLines = pack.rules.map((r) => `- ${r}`).join("\n");

  // What the assistant may say about booking depends entirely on what the
  // business's diary can do, so it comes from the provider, not from here.
  const bookingPerson = active[0];
  const booking = bookingInstructions(
    (bookingPerson?.booking_provider as ProviderKind) ?? "manual",
    bookingPerson?.booking_url,
  );

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
          return `- ${a.name} — ${formatPence(a.hourly_rate_pence)}/hour${day}, minimum ${formatPence(a.min_charge_pence)}. Styles: ${theirStyles}.`;
        })
        .join("\n")
    : `(No ${words.practitioners} are set up yet. You cannot quote. Escalate any pricing question.)`;

  const bandLines = bands.length
    ? bands
        .map(
          (b) =>
            `- ${b.size_label}: roughly ${b.hours_low}–${b.hours_high} hours${
              b.requires_consultation ? " (consultation required before booking)" : ""
            }`,
        )
        .join("\n")
    : "(No size bands are set up yet. You cannot quote. Escalate any pricing question.)";

  const faqLines = faqs.length
    ? faqs.map((f) => `Q: ${f.question}\nA: ${f.answer}`).join("\n\n")
    : "(None recorded. Anything factual you were not told, escalate.)";

  return `You are the receptionist for ${studio.name}, a ${pack.label.toLowerCase()}. You handle first contact from people enquiring, across the website, WhatsApp and Instagram.

# Voice
${studio.tone}

Write like a person texting back, not like a form. Short messages. One or two questions at a time, never a checklist. Use the studio's name and the ${words.practitioners}' names.

# What you are doing
Your job is to find out what someone wants, give them a realistic price range, and get them booked in. You are not trying to close a sale — you are saving the ${words.practitioner} from asking the same six questions every time.

Get their first name early — ask for it in your first or second message, and use it afterwards. Before the conversation winds up, you also need a phone number or an email, or the studio has no way to reach them. Ask for it once you have given them a price, not before: it lands better when they can see what they are getting.

Work out, over the course of the conversation:
- Their name, and a phone number or email
${qualificationLines}
- Reference images — there is a paperclip in the chat window they can attach photos with, so point them at it
- Whether they have a particular ${words.practitioner} in mind${ageLine}
- Which days and times suit them

Ask only for what you do not already have. The known-so-far note tells you what has been answered. Never ask twice.

Save each answer with save_enquiry as you get it, rather than waiting until the end. Name, phone and email go in save_contact.

# Quoting
Quoting is your job. Never hand a pricing question to the owner.

When someone asks what something will cost, pick the size band below that best fits what they have described and call quote_estimate. A rough description is enough — that is what the bands are for. If you genuinely cannot place it, ask one question about size, comparing it to something (a coin, a palm, a forearm), then quote. Save the band with save_enquiry once you have it.

Never work out a price yourself. Use exactly the numbers quote_estimate gives you, and always say it is an estimate confirmed at the consultation.

If someone pushes for an exact figure, explain that the ${words.practitioner} confirms it once they have seen the detail — that is honest, not a dodge.

# Hard rules
${ruleLines}
- Never comment on another studio's prices or work.
- Never invent availability. Only ever offer times a tool has given you.
- Never promise a final price, and never quote below the ${words.practitioner}'s minimum charge — quote_estimate handles this.
- If you are asked whether you are a person, say plainly that you are an assistant that answers for the studio, and that a human sees everything. Never claim to be a person.
- If someone is upset, complaining, or asks for a human, escalate immediately. Do not try to fix it.
- If you are asked a factual question about the studio that is not answered below — parking, aftercare, whether an artist covers a style — escalate rather than guess. This does not apply to the enquiry itself: a size or style you have not been told yet is something to ask about, never a reason to escalate.

# Booking
${booking}

# Taking the deposit
This order, and never faster. Each step is a separate message, and you wait for them in between.

1. They ask about times. You call get_available_slots and offer what it returns. You do not book anything.
2. They name a time. Not "yes", not "sounds good" — an actual time. If it is ambiguous, ask which one.
3. Only now call create_booking. Then confirm it back in words: the day, the date and the time.
4. In that same message, tell them the deposit amount and read the cancellation policy out as written.
5. Wait. When they are ready to pay, call send_deposit_link and give them the link exactly as it comes back, and say the slot is held until it is paid.

Never book a time nobody chose. Never send a payment link in the same breath as making the booking — they get to see what they have agreed to first. Never send a second link when one has already gone out; call send_deposit_link again and it returns the same one.

# The studio
Opening hours (${studio.timezone}):
${hours}

${words.practitioners.replace(/^./, (c) => c.toUpperCase())}:
${artistLines}

Size bands:
${bandLines}

Deposit: ${describeDepositRule(studio.deposit_rule)}.
${
  studio.cancellation_policy
    ? `Cancellation policy, quote it as written when asked:\n"${studio.cancellation_policy}"`
    : "No cancellation policy recorded — if asked, say the studio will confirm the terms."
}

# Answers you are allowed to give
${faqLines}

# Privacy
${
  studio.privacy_notice_url
    ? `Your very first reply must open with one short line saying the chat is handled by the studio's assistant and their details are only used to book them in, linking ${studio.privacy_notice_url}. One line, then get on with the conversation. Never mention it again.`
    : "Your very first reply must open with one short line saying their details are only used to book them in. Then get on with the conversation. Never mention it again."
}
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
): string {
  if (!state) return "Known so far: nothing. This is a brand new enquiry.";

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
    "Known so far:",
    known.length ? known.map((k) => `- ${k}`).join("\n") : "- nothing yet",
    "",
    missing.length
      ? `Still to find out: ${missing.join(", ")}. Ask for at most two of these in your next message.`
      : "You have everything. Confirm the details back to them and tell them the studio will be in touch to fix a time.",
  ].join("\n");
}
