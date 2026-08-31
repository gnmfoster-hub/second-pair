# Handled — what it is

*A briefing sheet. Paste this into any other prompt, doc or conversation that needs
to know what Handled is without reading the code.*

---

## One line

Handled is an AI receptionist for appointment businesses run by the person who does
the work — it answers enquiries, quotes, and books people in while the owner's hands
are busy.

## The problem it solves

A one-person electrician is under a floor. A tattooist has a needle in someone's arm.
A mobile hairdresser is mid-colour. In all three cases the phone goes and an Instagram
DM lands, and neither gets answered for four hours. By then the customer has messaged
two other people and booked whoever replied first.

These businesses do not lose work because they are bad at it. They lose it because the
person who does the work is the only person who can answer, and those are the same
hours. That gap is the entire product.

## Who it is for

The ideal customer is a business where **the person doing the work is also the person
taking the bookings**:

- one-person trades — electricians, plumbers, joiners, gardeners, mobile mechanics
- solo or small-team appointment businesses — tattooists, hairdressers (own chair or in
  a salon), beauticians, nail techs, barbers who take appointments, dog groomers,
  driving instructors, PTs, physios, therapists

Not for: businesses that already employ a receptionist, walk-in-only trade, or anything
where the booking is a shopping cart rather than a conversation.

## What it actually does

1. **Answers within a minute**, on the website chat, WhatsApp, and Instagram DMs, in
   the business's own tone of voice.
2. **Qualifies the enquiry** — asks the questions that business always asks, and no
   others. What the work is, where it is, when suits, and who it's for.
3. **Quotes a real price range** from the owner's own rates and services. Never
   invents a number, never goes below their minimum charge, always says it is an
   estimate confirmed in person.
4. **Books the appointment** into a proper diary, checking real availability, opening
   hours, notice periods and travel time between jobs.
5. **Takes a deposit** if the business wants one, through Stripe, and holds the slot
   until it is paid.
6. **Sends reminders** before the appointment, worded for that trade.
7. **Hands over to a human** the moment it should — a complaint, a medical question,
   someone under 18, or anyone who asks for a person.

Everything the assistant says comes from settings the owner controls, and the owner can
see and take over any conversation.

## Channels — where enquiries come from

**Working now**

- **Website widget.** One line of code on their site. A chat button in the corner,
  in its own frame so it cannot break their design.
- **A shareable link.** The same assistant on its own page. For the many one-person
  businesses with no website — goes in an Instagram bio or a Facebook page button.

**Built, waiting on the Meta app review**

- **WhatsApp.** The big one for most trades. Needs a number that is not already on
  the WhatsApp app.
- **Instagram DMs.** Requires the business's Instagram to be a Professional account
  linked to a Facebook Page.
- **Facebook Messenger.** Same app, same review, no extra work.

**Decided but not built**

- **SMS.** A Twilio number, about £1 a month plus a few pence per message. Half a
  day's work once deployed.
- **Email.** Enquiries forwarded to a Handled address and answered like any other.

**Phone calls — the honest position**

Not built, and it is a genuinely different product, not another channel.

A voice assistant needs telephony, speech-to-text, the existing engine, and
text-to-speech, all chained inside about 800 milliseconds or the caller feels the
lag and hangs up. All-in it costs roughly 8-15p a minute, so a five-minute call is
50-75p against 11p for an entire text enquiry — five to seven times the price, for a
worse experience if any link in the chain stutters.

**Missed-call-to-text is the better answer for this market.** The phone rings, nobody
picks up because they are under a floor, and the caller instantly gets a text: *"Sorry
we missed you — what do you need? I can get you booked in."* The assistant then handles
it in text, where it is already good. That captures the same lost enquiry at a fraction
of the cost, with none of the uncanny-valley risk, and it is a few days of work rather
than a rebuild. Real voice can come later if customers actually ask for it.

## The app

Handled installs from the browser as a **progressive web app** — no app store, no
review, no waiting. The owner opens the link on their phone, taps *Add to Home Screen*,
and it behaves like an app: its own icon, full screen, no browser chrome. Updates ship
the moment they are deployed.

Native App Store and Play Store versions are possible later. They are not needed to
launch, and they add review cycles and fees to every update.

## What it deliberately does not do

- **No accounting.** No invoicing, no bookkeeping, no tax. Out of scope on purpose.
- **No payment processing markup.** Deposits go through the business's own Stripe
  account and the business pays Stripe's normal rate. Handled takes nothing from it.
- **No pretending to be human.** Asked directly, it says it is an assistant answering
  for the business and that a human sees everything.

## The commercial model

Revenue is a **monthly subscription** for the assistant and the software. Card fees are
Stripe's and go to Stripe. The promise to the customer is that moving to Handled does
not cost them more than what they use now — the subscription buys the thing nobody else
sells them, which is somebody answering while they work.

## Positioning against Fresha, Booksy, Square

Those are diaries. They are good ones, and most of this market is already on one of
them and pays nothing for it.

**Handled's selling point is the AI agent, not diary features.** Matching Fresha is a
bonus that removes a reason to say no; it is not the reason to say yes. A diary does
not answer a message at nine on a Tuesday night. Handled is worth paying for because
it deals with enquiries during the hours the owner is working and cannot respond.

Handled can also read an existing Fresha, Booksy or Square diary through its iCal feed,
so a business can keep the diary it has and still have its enquiries answered.

## Multi-trade architecture

The engine is trade-neutral: qualify → quote → book → deposit → remind → escalate. What
changes per trade is a **vertical pack** — the vocabulary, the questions worth asking,
the service list, the reminder wording, and whether things like an 18+ check apply.

Adding a new trade is a config file, not a development project. Every business can then
edit everything the pack gave them.

34 trades ship today, grouped into six categories: trades and home (electrician,
plumber, gas engineer, joiner, decorator, plasterer, roofer, handyman, locksmith,
gardener, cleaner), hair and beauty (tattoo, salon, mobile hairdresser, barber,
beauty, nails, aesthetics, massage), health and wellbeing (physio, chiropractor,
personal trainer, counsellor, podiatrist), pets (dog groomer, dog walker), motoring
(mobile mechanic, garage, valeting, driving instructor), and everything else
(photographer, tutor, window cleaner, plus a blank one).

Trade differences already handled: hourly vs flat pricing, deposits required / optional
/ never, work at the premises vs at the customer's address, service areas by postcode,
travel time between jobs, and VAT-registered or not.

## How it is built

- Next.js 16 (App Router) and React 19, TypeScript, Tailwind v4
- Supabase — Postgres with row-level security, auth, and file storage
- Claude (Opus) for the conversation, with prompt caching to keep the cost per
  enquiry down to roughly 11p
- Stripe Checkout for deposits, confirmed only by signed webhook
- Deployed on Vercel

Money is integer pence everywhere. Pricing has one source of truth. The assistant can
never quote a figure the owner's own settings would not produce.

## Status

Working end to end: the conversation engine, quoting, the diary, deposits, reminders,
client records, the weekly report, the embeddable website widget, and a phone-ready
dashboard that installs from the browser. WhatsApp and
Instagram need the Meta app reviewed, which needs the app deployed to a public URL.

First customer: Living Canvas Tattoo. Second in the pipeline: a hair salon.

## Name

Working name **Handled**. Chosen because it is what the owner wants to feel about the
enquiry they did not have time to read: handled.
