# Second Pair

AI receptionist for tattoo studios. First customer: Living Canvas Tattoo.

## Status

**Day 1 complete.** Supabase schema with RLS, dashboard shell, auth, and full studio
settings: studio details, opening hours, deposit rules, cancellation policy, artists with
rates, price bands, and FAQs. The pricing page shows a live quote table so the owner sees
exactly what the assistant will quote before it quotes it.

Not built yet: the conversation engine (Day 2), calendar and deposits (Day 3), inbox
takeover and reminders (Day 4).

## Setup

1. Create a project at [supabase.com](https://supabase.com). Region: London (eu-west-2).
2. `npx supabase login`, then `npx supabase link --project-ref <ref>`.
3. `npx supabase db push` to apply `supabase/migrations/`.
4. Copy `.env.example` to `.env.local` and fill in the three values from
   Project Settings → API.
5. `npm install && npm run dev`
6. Go to `/login`, enter your email, click the magic link, name the studio.

Without the CLI, paste the migration files into the SQL editor in filename order instead.

Supabase sends magic-link emails from a shared server that is heavily rate-limited. For
real use, set up SMTP under Authentication → Emails.

## Layout

```
supabase/migrations/   schema, RLS policies, storage bucket
src/lib/               money, quoting, types, supabase clients
src/app/(dashboard)/   inbox + settings, behind auth
src/middleware.ts      session refresh and the auth gate
```

## Conventions

- **Money is integer pence.** `src/lib/money.ts` holds the only conversions.
- **Quotes come from `src/lib/quote.ts`, nowhere else.** It enforces the guardrail that a
  quote never falls below an artist's minimum charge. When the conversation engine quotes,
  it calls this, so the dashboard preview and the assistant can never disagree.
- **`createAdminClient()` bypasses RLS.** Webhooks and the engine only. Never in a page.
- Every tenant-scoped table has an RLS policy keyed on `studio_members`.

## Decisions worth knowing

- `studio_members` is not in the original spec. RLS needs something to key on, and it is
  also how a studio adds a second user later.
- Day rates apply at 6+ hours and the client gets whichever of hourly and day rate is
  cheaper, which is how studios actually pitch a day rate. `FULL_DAY_HOURS` in
  `src/lib/quote.ts`.
- Quotes round to the nearest £5 — down at the low end, up at the high end — then the low
  end is clamped to the minimum charge, so rounding can never breach the guardrail.
- `create_studio` is a `security definer` RPC because the RLS policy on `studios` requires
  a membership row that cannot exist until the studio does.

## Erasure

`delete_studio(studio_id)` is the GDPR erasure path. It clears conversations
first, because `bookings.artist_id` is `on delete restrict` and a plain cascade
would fail on any studio that has ever taken a booking.

It does **not** remove reference images: Supabase refuses direct deletes from
`storage.objects`. Whatever calls it must clear the `<studio_id>/` prefix from
the `references` bucket through the Storage API first.

## Checks

```
npm test                      # quote and deposit maths
node scripts/verify-rls.mjs   # tenant isolation against the live database
node scripts/pull-env.mjs     # refresh .env.local from the linked project
```

`verify-rls.mjs` creates two throwaway studios and deletes them again. Point it
at a development project, never at one with real studios in it.

## Verticals

The engine is trade-neutral. Tattoo studios are first, but barbers, salons,
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

**Not solved yet:** barbers and salons charge a flat price per service, where
`price_bands` only expresses hours × an hourly rate. That needs a second pricing
model, and it is worth designing against a real barber rather than guessing.
