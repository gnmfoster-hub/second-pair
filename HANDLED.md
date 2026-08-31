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

Packs today: tattoo studio, salon, and a general pack for any appointment business.

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
client records, the weekly report, and the embeddable website widget. WhatsApp and
Instagram need the Meta app reviewed, which needs the app deployed to a public URL.

First customer: Living Canvas Tattoo. Second in the pipeline: a hair salon.

## Name

Working name **Handled**. Chosen because it is what the owner wants to feel about the
enquiry they did not have time to read: handled.
