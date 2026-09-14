# Second Pair

An assistant that answers enquiries and books appointments for small UK trades.
Live for three businesses: a tattoo studio, a cleaning company and a demo salon.

## Status

Live at [www.second-pair.com](https://www.second-pair.com). The whole loop runs:
a stranger writes in on the website widget, by text or by email; the assistant
qualifies, quotes from that business's own prices, offers real times against the
real diary, books, takes a deposit and sends a confirmation with the appointment
attached — and fetches a human the moment it should.

Around it: the diary, the client record, the inbox, the till, payment links,
reminders, the weekly report, staff logins with their own hours and rates, and a
setup checklist that says what the assistant cannot do yet and why.

Not done: Meta channels are built and waiting on App Review, and deposit
receipts have no email yet.

## Setup

1. Create a project at [supabase.com](https://supabase.com). Region: London (eu-west-2).
2. `npx supabase login`, then `npx supabase link --project-ref <ref>`.
3. `npx supabase db push` to apply `supabase/migrations/`.
4. Copy `.env.example` to `.env.local` and work down it. Each block says what
   breaks without it; Supabase's three are the only ones needed to boot.
5. `npm install && npm run dev`

Without the CLI, paste the migration files into the SQL editor in filename
order instead.

**Sign-up is invitation-only, on purpose.** There is no form that creates a
business — every one is set up in `/admin` by somebody who has spoken to the
owner, and staff join by invitation link. `/onboarding` exists to say so to
anybody who signs in without a business, which is almost always an invitation
that did not finish.

Supabase sends magic-link emails from a shared server that is heavily rate
limited and lands in spam. For real use, point it at your own sender under
Authentication → SMTP. Until you do, the front door is the thing that breaks.

## Layout

```
supabase/migrations/   schema, RLS policies, storage bucket
src/lib/               money, quoting, readiness, types, supabase clients
src/lib/engine/        the conversation engine and its tools
src/app/(dashboard)/   diary, inbox, clients, settings — behind auth
src/app/api/           webhooks: Stripe, Twilio, Meta, email, cron
src/app/admin/         the back office where businesses are created
src/middleware.ts      session refresh and the auth gate
```

## Conventions

- **Money is integer pence.** `src/lib/money.ts` holds the only conversions.
  Null and zero are different answers and neither stands in for the other.
- **Quotes come from `src/lib/quote.ts`, nowhere else.** It enforces the
  guardrail that a quote never falls below a person's minimum charge. The
  engine calls it, so the dashboard preview and the assistant cannot disagree.
- **`createAdminClient()` bypasses RLS.** Webhooks and the engine only. Never
  in a page.
- Every tenant-scoped table has an RLS policy keyed on `studio_members`.
- **Read whole rows: `select("*")`.** PostgREST rejects an entire query over
  one column it does not know, and hands back null — which reads exactly like
  "this business has none of those". Naming columns means a page breaks between
  a deploy and its migration instead of degrading.
- **Write through `hasColumn`.** The capability probe in `src/lib/db/hasColumn.ts`,
  so a write skips a column the database has not got yet rather than failing
  whole.
- **Testable logic goes in a file with no `@/` imports.** The node test runner
  cannot resolve the alias, so anything worth testing without a database —
  `whoTakes`, `depositReadiness`, `freeSlots`, `lapsed` — lives on its own.
- **RLS tests run as a member of staff, never as the owner.** Policies are
  OR'd, so an owner policy masks a staff one and the test passes on the
  strength of the wrong rule.

## Decisions worth knowing

- `studio_members` is not in the original spec. RLS needs something to key on,
  and it is also how a business adds a second user later.
- Day rates apply at 6+ hours and the client gets whichever of hourly and day
  rate is cheaper, which is how studios actually pitch a day rate.
  `FULL_DAY_HOURS` in `src/lib/quote.ts`.
- Quotes round to the nearest £5 — down at the low end, up at the high end —
  then the low end is clamped to the minimum charge, so rounding can never
  breach the guardrail.
- `create_studio` is a `security definer` RPC because the RLS policy on
  `studios` requires a membership row that cannot exist until the studio does.
  Only `/admin` and the test scripts call it.
- **Two pricing models, and everything that reads prices has to ask which.**
  `studios.pricing_model` is `bands` (hours × an hourly rate, which is how a
  tattooist prices) or `services` (a named list at a flat price, which is how a
  salon does). Reading the wrong table reports an empty price list for a
  business whose list is full — it has caused that exact bug twice.
- **Two payment models, and the same applies.** `studios.payment_model` is
  `business` (one account, the owner settles up) or `people` (a Stripe account
  each, because a chair renter's takings were never the shop's). `whoTakes`
  in `src/lib/payments/` is the only thing that decides where a charge goes.
- **Stripe Connect accounts are Standard.** The business is the merchant of
  record: money never touches an account of ours, and refunds, disputes and
  chargebacks are settled in their own Stripe dashboard. Express or Custom
  would make Second Pair liable for losses on accounts it does not own, which
  is a payments business rather than a booking one.

## Erasure

`delete_studio(studio_id)` is the GDPR erasure path. It clears conversations
first, because `bookings.artist_id` is `on delete restrict` and a plain cascade
would fail on any studio that has ever taken a booking.

It does **not** remove reference images: Supabase refuses direct deletes from
`storage.objects`. Whatever calls it must clear the `<studio_id>/` prefix from
the `references` bucket through the Storage API first.

## Checks

```
npm test                        # the pure logic: money, quoting, readiness, slots
node scripts/check-live.mjs     # what the live site can actually do
node scripts/audit-setups.mjs   # what the assistant would do for each business
node scripts/verify-rls.mjs     # tenant isolation against the live database
node scripts/check-migrations.mjs
node scripts/pull-env.mjs       # refresh .env.local from the linked project
```

`check-live.mjs` reads `/api/health`, which reports which keys are present
rather than what they are. It is the fastest way to tell a key that did not
save from a deployment that predates it — two failures that look identical from
outside and have completely different fixes.

`audit-setups.mjs` asks the question no validator asks: which settings are
perfectly valid and lead somewhere silently wrong. An appointment length nobody
chose, a widget switched off, an inbox that does not exist.

`verify-rls.mjs` creates two throwaway studios and deletes them again. Point it
at a development project, never at one with real businesses in it.

## Verticals

The engine is trade-neutral. Tattoo studios were first, but barbers, salons,
piercers and clinics run on the same qualify → quote → escalate → book → deposit
loop, and the same channels.

What varies by trade lives in `src/lib/verticals.ts`: vocabulary
(artist/barber/practitioner), the qualification questions, the style and intent
pick-lists, default service bands and starter FAQs. Adding a trade is a new pack
there, not an engine change. Anything a pack cannot express is a real gap in the
core — fix it there rather than special-casing.

Two things are deliberately per-studio rather than global, because a Postgres
enum is the worst place for a list that varies by trade:

- `service_options` holds each studio's own style and intent lists. These were
  the `tattoo_style` and `enquiry_intent` enums.
- `studios.vertical` and `studios.vocabulary` say which pack seeded a studio and
  let an owner override the wording.

Flat per-service pricing, which this file used to list as unsolved, is done:
`pricing_model`, the `services` table, and a price per person against it.
