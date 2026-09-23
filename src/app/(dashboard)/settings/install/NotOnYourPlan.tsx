import { CHANNEL_LABELS, type Channel } from "@/lib/types";

/**
 * A channel this business has not bought.
 *
 * channels_allowed has been enforced since the day it was written: a message
 * arriving on a channel a business is not signed up for is refused by the
 * engine, and a call to an unsold voice number is answered and ended politely.
 * None of that was ever said on the settings page, which offered the connect
 * button for everything regardless.
 *
 * So an owner could wire up Instagram they had not bought, watch it say
 * Connected, and then watch every message arriving on it go nowhere — with no
 * error, no bounce and nothing on any screen to explain it. Enforcement with no
 * matching interface does not read as "not sold", it reads as broken.
 *
 * It says what it costs them, not what it costs us: what the channel would do
 * for them if they had it. Somebody deciding whether to pay for texts wants to
 * know what texts would get them.
 */
export function NotOnYourPlan({ channel, business }: { channel: Channel; business: string }) {
  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        {/*
          * The same heading the real panel uses, not the short code.
          *
          * CHANNEL_LABELS gives "SMS", which is what the word is called in the
          * database. The panel a business sees when they do have it says "Text
          * messages and missed calls", and two names for one thing on the same
          * page is how somebody ends up asking for something they already have.
          */}
        <h2 className="section-title">{HEADING[channel] ?? CHANNEL_LABELS[channel]}</h2>
        <span className="stamp stamp-flat text-muted">Not on your plan</span>
      </div>

      <p className="hint mt-2 max-w-prose">{WHAT_IT_WOULD_DO[channel]}</p>

      {/*
        * "The salon", not "salon".
        *
        * words.business is the trade's own word — salon, garage, studio — and
        * it is a noun, not a name: dropping it in bare gave "salon is not
        * signed up for this", which reads as a missing word because it is one.
        */}
      <p className="hint mt-2">
        The {business} is not signed up for this, so there is nothing to connect yet, and
        anything arriving on it would not be answered. Ask us and we will add it.
      </p>
    </div>
  );
}

/** What the panel is called where a business does have it, so the two agree. */
const HEADING: Partial<Record<Channel, string>> = {
  sms: "Text messages and missed calls",
  voice: "Phone calls and the voicemail response",
  instagram: "Facebook and Instagram",
  messenger: "Facebook and Instagram",
};

/**
 * What each one buys them, in their terms.
 *
 * Deliberately not a feature list. A business weighing up whether to pay for
 * texts is asking what texts would get them, and the honest answer for that one
 * is the only channel that can reach somebody who has not written first.
 */
const WHAT_IT_WOULD_DO: Record<Channel, string> = {
  web: "The assistant on your own website, answering while you work.",
  sms: "The only channel that reaches somebody who has not written to you first. Reminders before an appointment, and a text straight back when you miss a call, both need it.",
  voice: "Somebody rings, your phone rings first, and if nobody picks up they are texted back — or they leave a message, which comes back to them as a text answering what they actually said. Nobody talks to a machine; that is the Receptionist, which is sold on its own.",
  email: "Your enquiry address forwarded in, so what arrives there is answered the same way everything else is.",
  instagram: "Messages to your Instagram answered in the same place as everything else, instead of in an app somebody has to remember to open.",
  whatsapp: "WhatsApp messages answered alongside the rest, on the number people already use.",
  messenger: "Messages to your Facebook page answered here rather than sitting unread.",
};
