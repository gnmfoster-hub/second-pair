# What needs doing

Two lists. Yours is first — accounts, DNS, decisions, things only you can do.
Mine is at the bottom. They are separate on purpose: the last version mixed them
up and it was impossible to tell what was blocking what.

Last updated: 14 September 2026.

---

# Migrations

**Nothing waiting.** All run, up to and including
`20260915140000_who_offers_what.sql`.

When one is waiting it will be named here. Until it is run the product keeps
working without it — everything new is written so the deploy and the migration
can happen in either order, and the screen says what it cannot do yet rather
than breaking.

---

# Waiting on you

Everything here is something I cannot do from this side. Roughly in the order
it is holding something up.

### 1. Switch the money on for Living Canvas

I have been calling this "connect Stripe", and that was a third of it. I checked
the live database rather than going from memory, and Living Canvas is off at
three separate switches:

| What | Now | Where |
| ---- | --- | ----- |
| Stripe account | not connected | Settings → the business → Taking the money |
| Deposits | `none` | Settings → the business → Deposits |
| Payments in full | off | Settings → Whose money it is |

Connecting Stripe on its own changes nothing you can see, because with deposits
set to none the assistant never asks for one, and a payment link is refused
before it ever reaches Stripe. All three, or none of it works. That is why
every payment control has been saying "not set up" rather than doing anything.

The connect button itself works. I told you the platform key might be missing;
it is not, it has been set on Vercel all along. What was missing was anything
saying so — the button bounced people back in silence, which I have fixed.

Stripe's own onboarding: their ID, their bank details, about ten minutes.

The same three switches apply to Neat & Tidy whenever you want money moving
there.

### 2. Living Canvas has no price list

It prices by the hour against size bands, which is right for tattooing and is
why there are seven bands and no services. Two things read from a named list
rather than from bands, and both are quietly empty because of it: picking what
somebody is having when you add a booking, and anything per-person.

Nothing is broken. It is a choice about whether a tattoo studio wants named
things as well — a piercing, a touch-up, a consultation — sitting alongside the
bands. Tell me and I will set it up either way.

### 3. Nobody has a phone signed up for notifications

Still not one device, on any of the three businesses.

A booking sends an email *and* a push, and the email half works — so you are
being told, just not on your phone. What is unused is the quick half, the one
that matters when somebody books while you are between jobs.

It has to be done on the phone itself, by each person, from their own settings
tab. New since the last version of this list: it is now its own line on the
dashboard checklist, so a business can see it rather than only me from a
terminal. The old checklist took an email address as good enough and read green.

### 4. Karen's consultation is ten minutes

Unchanged, and still ten minutes on the live record.

Three of Neat & Tidy's services need a consultation first — end of tenancy,
after builders, deep clean. Ten minutes is a phone call. If those quotes are
done by ringing somebody back, that is exactly right and there is nothing to
do. If Karen goes and looks at the property, the assistant is booking her a
ten-minute visit to quote a whole house.

It is your call, which is why it is here rather than changed.

### 5. Take a backup before you test hard

One command, and only you can run it because only you should hold the key:

```
BACKUP_KEY='a long passphrase you keep' node scripts/backup.mjs
```

Keep the passphrase where you keep everything else. There is no unencrypted
path through that script on purpose &mdash; the file is every client's name,
phone number and email for every business on here, in one place, with none of
the row-level security that protects them in the database.

I have run it and read it back with a throwaway key to prove the round trip
works, and deleted the file. Payments are in it now; they never were.

Once a month: `BACKUP_KEY='...' node scripts/restore.mjs <file>`. It only
reports. A backup nobody has read back is a hope, and this is how you find out
the passphrase in the password manager is the old one.

### 6. Decide about tapping a card on a phone

Researched against Stripe's own documentation, September 2026. Three different
things get called "pay on the phone" and only one of them is hard.

**The customer taps their own phone or watch** — Apple Pay, Google Pay. This
already works and needs nothing: they appear on the Stripe checkout page every
link in the product opens. Send the link from the client's record or the
conversation and they pay with two taps on their own phone. Nothing to build.

**You tap their card on your phone** — Stripe Tap to Pay. Live in the UK,
iPhone XS or later, and a good range of Android. Two ways to have it:

| | What it costs you | What it gives up |
| - | - | - |
| Stripe's own Dashboard app | Nothing. Download it, log in, charge. | Two apps at the desk. Record the amount here as "tapped on a phone" afterwards. |
| Built into Second Pair | A native app — Terminal iOS or React Native SDK | Weeks, plus App Store review |

The second is not a feature, it is a project: Tap to Pay is only in Stripe's
iOS and React Native Terminal SDKs, there is no web or browser path at all, and
this product is a web app. It also needs an Apple entitlement requested twice
(development, then distribution), a mandatory "How to Tap" overlay from Apple's
own framework before review, and an app in the App Store to put it in.

**My recommendation: the Dashboard app, and revisit if a customer asks twice.**
Because every business here has its own Stripe account under Standard Connect,
they can use Stripe's app today with no work from anybody. The bill now has
"Tapped on a phone" as a way to record it, kept separate from "card machine" on
purpose: a tap through Stripe is already in their Stripe account and will show
in their payouts, and a third-party terminal never touches Stripe — recording
both as "card" makes a month impossible to reconcile.

Worth knowing before choosing: in the UK some cards refuse a contactless tap
above the CVM limit and demand the card be inserted, which a phone cannot do.
Stripe's own advice in that case is another card, a real reader, or a payment
link — so a phone is never the only way you can take money.

### 7. The Neat & Tidy number

Send it to Chris, and put it on the Facebook page, the Google listing and
anything else with the old one on.

### 8. Check the forward on info@neatandtidysolutions.co.uk

You sent a test to it. Confirm it arrived at the Second Pair address.

### 9. The slow ones

- **Meta verification** — weeks, and cannot be hurried. Steps below.
- **ICO registration** — £52 a year. You are processing personal data on behalf
  of other businesses, so it is not optional.

`EMAIL_FROM` has come off this list: it is set on Vercel and the live check
confirms mail sends from your own domain. `INTEREST_EMAIL` is not worth a line
either — it falls back to `EMAIL_FROM`, so enquiries from the marketing site
already reach you. Set it only if you want them somewhere else.

---

# Yours

## Done since this list was last written

| # | Job | State |
| - | --- | ----- |
| 1 | DNS on second-pair.com | **Done.** A, CNAME, SPF, DKIM and DMARC all verify. |
| 2 | Resend, then Supabase SMTP | **Done.** Key accepted, sender domain verified. |
| 3 | Vercel deploy | **Done.** Live on www.second-pair.com, cron job running. |
| 5 | Twilio | **Done.** Account active, not on trial. Living Canvas and Neat & Tidy each have their own number registered. |

`node scripts/check-live.mjs` is what confirms all of that, and it is worth
running after any change to Vercel's environment variables. It now also checks
whether a business can connect Stripe at all — the check that would have caught
item 1 being three switches rather than one.

## Still open

### 4. Name clearance

An hour, and worth doing before the name goes anywhere it cannot be taken back.

1. **Companies House** — find-and-update.company-information.service.gov.uk.
   Search "Second Pair". You are looking for an active company with the same or
   a confusingly similar name.
2. **UK IPO trade marks** — trademarks.ipo.gov.uk/ipo-tmtext. Search "Second
   Pair" in **class 9** (software) and **class 42** (software as a service).
   Those two are what matter. An existing mark in class 25 (clothing) does not
   stop you.
3. **Handles** — check the socials you would actually use.
4. If it is clear and you want to keep it, a UK trade mark application in those
   two classes is about £200 and you can file it yourself.

If it comes back dirty, you want to know now, while the name is in a codebase
and not on a customer's invoice.

### 6. Meta

The slowest thing on this list. It can start now — the live HTTPS site and the
published privacy policy it was waiting on are both up.

**You are setting up your own business portfolio, for Second Pair — not one on
Living Canvas's behalf.** You do this once. Each customer then connects their
own WhatsApp and Instagram to your reviewed app by pressing a button. This is
the thing most people get wrong and end up doing forty times.

1. **business.facebook.com** → create a Business Portfolio for Second Pair.
2. **Business Settings → Business Info** → start **Business Verification**.
   It wants your company details and a document — a utility bill, bank
   statement, or certificate of incorporation. This is the part that takes
   weeks. Start it before you need it.
3. **developers.facebook.com** → create an App, type **Business**.
4. Add the products: **WhatsApp**, **Messenger**, **Instagram**.
5. Set the callback URL to `https://www.second-pair.com/api/meta/webhook` and a
   verify token you make up. Tell me the token and I will match it.
6. Request the permissions: `whatsapp_business_messaging`, `pages_messaging`,
   `instagram_manage_messages`.
7. Submit for **App Review**. They want a screencast showing what the app does.

### 7. Decisions I need from you

Two of these are blocking me.

- **VAT — blocking.** Are you registering? It changes every price shown, the
  invoices, and the deposit maths. Retrofitting it is unpleasant.
- **Which three trades — blocking.** There are 34 in the code and three should
  be genuinely good rather than all 34 being adequate. Tattoo and hair are two
  by default. What is the third, and can you actually get a customer in it?
- **The SMS bundle.** See below. It changes your pricing page.
- **What you charge.** Nothing in the product depends on it yet, but the
  pricing page does.

---

# The two channel questions

## SMS matters more than Meta

Meta feels like the headline feature. It has a limit that cannot be coded
around: WhatsApp, Messenger and Instagram all refuse a free-form message more
than 24 hours after the customer's last one. **Meta can answer people. It can
never start.** Every reminder, every "we have had a cancellation at four", every
message to somebody who has not written today — none of it can go over Meta.

SMS can do all of it. It is the only channel that reaches somebody cold.

### The cost, which changes your pricing

Rough UK figures through Twilio. Check them; they move.

- A UK number: about **£1 a month**
- Sending: about **4p** a message
- Receiving: about **0.75p**

A salon with 200 appointments a month and two reminders each is 400 messages —
**about £17 a month in SMS alone, per customer.** Not a rounding error.

I would **include a bundle of 300 and charge for overage**, and make the
24-hour reminder the only automatic SMS. Most businesses stay inside it, it is
one line to explain, and it stops a chatty salon quietly costing you money.

### One number each

About £1 a month per business, and worth it. A reply comes back to a number
belonging to one business, so there is no guessing who it was for. A shared
number breaks the first time one customer deals with two of your businesses,
which in one town they will. Both live businesses now have their own.

There is a cheaper option — an **alphanumeric sender ID**, where the message
shows as from "Living Canvas" rather than a number. Costs nothing extra, looks
better, and **nobody can reply to it.** Useless here, because the whole point is
that people answer.

## Email is not a reminder channel

People do not read email. "You are in at four tomorrow" has to be read, and that
is SMS's job.

Email is right for things somebody goes looking for later: **confirmations**
(sent, with the appointment attached as a calendar file), **deposit receipts**,
**staff logins**, **the weekly report**, and as the fallback when there is no
mobile number.

---

# Mine

**Doing now:** nothing half-finished. The last run closed out the live bug list
you sent and the money work behind it.

**Next, in the order I would do them:**

1. **Meta**, once the app is through review. Nothing to build until then.

**Done, and waiting on nothing:**

- Payments: Stripe connect for the business and for each person, payment links
  on the appointment, the client's record, the conversation and the till,
  refunds linked through to the exact charge, the till, products and stock.
- Tenant isolation now checks the early-access list, which is protected by
  having no policies at all and was protected by nothing that would notice if
  that changed; a business's channels; and booking groups. 48 checks, all green.
- "This was me testing" on a conversation, which keeps the thread and takes it
  out of the client list, the figures and the report. The flag has existed
  since the second week and only the dashboard preview could set it — so every
  time you opened the real widget on your phone you became a customer.
- The reach check was lying. It said Neat & Tidy could not email seven people
  it can email, because it wrote its own copy of the rule instead of calling it.
- A shelf for a business that prices by the hour. Living Canvas has aftercare
  balm on its price list at £10 and a screen to change it on.
- Support sees the conversation a request was filed out of, which the assistant
  has been recording since it was built and nothing ever read. Checked against
  the support studio first: a business's own conversations stay unreadable
  here, which is the one promise that cannot be made twice.
- The early-access signups from the marketing site have a screen. They were
  going into a table nothing could read.
- Selling a product from the appointment itself, rather than leaving it and
  opening the till: the shop's shelf plus that person's own, the sale tied to
  the visit, and what has already been sold shown on the appointment so nobody
  rings the same bottle up twice.
- Receipts by email, for every payment that used to say nothing: a link paid
  from any of the four screens, a deposit on a booking added by hand, and a
  sale at the till where the client has an address. Not for a deposit the
  assistant takes while booking — that already sends a confirmation in the same
  second, and two emails a second apart read as a glitch. Any of them can be
  sent again from the client's record.
- Per person: hours, rates, roles, greeting, tone, time off, travel time,
  reminders, calendar feed, their own services and prices, and which of the
  shop's services they do and do not offer.
- Diary: reads on a phone, keeps the view you chose when you change person,
  a colour each, a complete button, and the add box no longer cut off.
- Clients: history on somebody added by hand, what they have bought, and who
  has not been back.
- Channels: SMS in and out on a number per business, email in and out, the
  inbox, and the assistant answering on both.
- The setup checklist asks the right money question now. It used to ask whether
  the business had connected Stripe, which is the wrong question on a salon of
  chair renters — there the shop's account is not where anybody's money goes,
  and a business could read as ready while every charge was refused.

**Known, and deliberately not done:**

- Sign-up is invitation-only. Every business is set up by somebody who has
  spoken to the owner, and the page that used to offer a form now says so.
- There is nowhere in the app to type the Stripe Connect key. It is ours, it is
  the same value for every business on here, and a box on one business's
  settings page would imply both of those are false.
