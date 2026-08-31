# What needs doing

Two lists. The first is yours — accounts, DNS, decisions, things only you can do.
The second is mine. They are separate on purpose: the last version mixed them up
and it was impossible to tell what was blocking what.

Last updated: 1 September 2026.

---

## Yours, in order

The order matters. Item 1 unblocks three other things, and items 4 and 5 have
approval queues that run for days or weeks, so they want starting early even
though nothing depends on them yet.

### 1. DNS for second-pair.com — 30 minutes, blocks everything

One visit to your registrar. Four records:

| Type  | Name                | Value                       | For          |
| ----- | ------------------- | --------------------------- | ------------ |
| A     | `@`                 | `76.76.21.21`               | Vercel       |
| CNAME | `www`               | `cname.vercel-dns.com`      | Vercel       |
| TXT   | `@`                 | *(Resend gives you this)*   | Email — SPF  |
| TXT   | `resend._domainkey` | *(Resend gives you this)*   | Email — DKIM |

Do the Vercel two now and add the Resend two in the same sitting once you have
step 3 open. It is the same login and you will not want to go back twice.

**Why it blocks things:** Vercel needs it to serve the site. Meta needs a public
HTTPS URL before it will review the app. Email needs the TXT records or
everything you send goes to spam. All three wait on this one job.

### 2. Name clearance — an hour, do it before anything is printed

- **Companies House** — search "Second Pair" at
  find-and-update.company-information.service.gov.uk
- **UK IPO trade marks** — search at trademarks.ipo.gov.uk, in **class 9**
  (software) and **class 42** (software as a service). Those are the two that
  matter for this.
- **Handles** — the domain is yours; check the socials you would actually use.

Do this before the logo goes on anything, before you tell customers the name,
and before you spend on branding. If it comes back dirty you want to know while
the name is still only in a codebase.

### 3. Resend account, then Supabase SMTP — 30 minutes, most urgent technical fix

**This is the front door and it is currently broken for real use.**

Signing in, signing up and password resets all send email. Right now they go
through Supabase's *shared* sender, which is rate limited to a handful an hour
and sends from a Supabase address that lands in spam. The moment two people sign
up in the same hour, one of them does not get in.

1. Sign up at resend.com — the free tier is 3,000 emails a month, 100 a day,
   which is plenty for a long while.
2. Add `second-pair.com` as a domain. It gives you the two TXT records for step 1.
3. Create an API key. **Put it in `.env.local` with notepad — do not paste it
   into a chat.**
4. In Supabase, under Project Settings → Authentication → SMTP Settings, turn on
   custom SMTP and point it at Resend:
   - Host `smtp.resend.com`, port `465`, username `resend`, password = your API key
   - Sender `hello@second-pair.com`, name `Second Pair`

### 4. Twilio — start now, approval takes days

You do not need this working today, but UK numbers need a regulatory bundle
approved and the clock only starts when you apply.

1. Sign up at twilio.com. The trial credit is enough to test with.
2. Buy **one** UK mobile number (+447…) with SMS capability.
3. It will ask for a **regulatory bundle** — a UK address and proof of it.
   Submit it straight away. A day or two to approve, longer if they query it.
4. Do not buy a number per business yet. One is enough until the code is written.

### 5. Meta business verification — start now, takes weeks

The slowest thing here, and it cannot start until step 1 is done, because Meta
will not review an app without a live HTTPS URL and a published privacy policy.

You are setting up **your own** business portfolio, for Second Pair — not one on
Living Canvas's behalf. Each customer then connects their own WhatsApp and
Instagram to your reviewed app. You do this once. They click connect.

### 6. Decisions only you can make

- **VAT.** Are you registering? It changes every price on the site and on the
  invoices, and retrofitting it is unpleasant.
- **Which three trades** get proper packs first. There are 34 in the code; three
  should be genuinely good. Tattoo and hair are two by default — what is the
  third, and is it one you can actually get a customer in?
- **The SMS cost model.** See below. It affects what you charge.

---

## The SMS question, properly

**Short answer: SMS matters more than Meta, and it is worth doing first.**

Meta feels like the headline feature, but it has a limit that cannot be coded
around: WhatsApp, Messenger and Instagram all refuse a free-form message more
than 24 hours after the customer's last one. So Meta can answer people. It can
never *start*. Every reminder, every "we have had a cancellation at four", every
message to somebody who has not written today — none of that can go over Meta.

SMS can do all of it. It is the only channel that reaches somebody cold.

### What it costs, and why that changes your pricing

Rough UK figures through Twilio. Check them — they move.

- A UK number: about **£1 a month**
- Sending: about **4p a message**
- Receiving: about **0.75p**

A salon doing 200 appointments a month with two reminders each is 400 messages,
so **about £17 a month in SMS alone**. That is not a rounding error against a
subscription. Three ways to handle it:

1. **Include a bundle** — say 300 messages — and charge for overage. Simple to
   explain, and most businesses stay inside it.
2. **Send only the reminder that matters** (24 hours before) by SMS, and use the
   widget or WhatsApp for everything else. Roughly halves it.
3. **Pass it through at cost.** Honest, but it makes your pricing page harder.

I would do 1, with the 24-hour reminder as the only automatic SMS.

### One number each, or one shared?

**One number per business.** About £1 a month each, and worth it:

- A reply comes back to a number belonging to one business, so there is no
  guessing who it was meant for. A shared number breaks the moment one customer
  deals with two of your businesses — which, in one town, they will.
- The salon's customers see a consistent number.

There is a cheaper option: an **alphanumeric sender ID**, where the message shows
as being from "Living Canvas" instead of a number. It costs nothing extra and
looks better, but **nobody can reply to it.** Fine for a reminder that ends
"reply STOP to opt out" and nothing else; useless for a conversation. Not worth
the saving here, because the whole point is that people answer.

---

## Email — what it is actually for

Worth being blunt: **email is a poor reminder channel.** People do not read it.
For "you are booked in at four tomorrow", SMS wins and it is not close.

But email is right for several things, and two of them are already broken
without it:

- **Signing in** — happening now, over Supabase's shared sender. See step 3.
- **Giving staff a login** — you currently copy a link and send it yourself.
  That works, but it is a rough edge on the first thing a new member of staff
  ever sees.
- **Deposit receipts and booking confirmations**, with the appointment attached
  as a calendar file so it lands in their own diary.
- **The weekly report** to the owner.
- **The fallback** when there is no mobile number on file.

So: build it, use it for those, and do not expect it to replace SMS.

Email is not yet a channel in the database at all — there is no `email` in the
channel list. That is mine to add.

---

## Mine

In this order, unless you say otherwise:

1. **Email as a real channel.** Add it to the schema, wire Resend behind the
   existing `deliver()` call, and use it for confirmations, receipts, staff
   invites and the weekly report. Everything already routes through one
   function, which is why this is small.
2. **SMS.** Twilio behind the same `deliver()`, a number stored per business,
   and an inbound webhook so replies land in the inbox and the assistant picks
   them up. This is what makes the outbound messaging I have just built actually
   send.
3. **Reminders over SMS**, once 2 is done. They currently only reach people who
   came in through the website widget.
4. **Meta**, once the app is reviewed.
5. Roles on the artist editor, and per-person greeting and tone — both have
   database columns and no screen yet.

### Already built, waiting on you

- Outbound messaging: message a client from their page, add a client who has
  never written in. Works, and says honestly when a channel cannot be used.
- The diary reads properly on a phone.
- Staff logins, permissions, per-person hours, rates, roles and time off.
- Calendar feed, push notifications, deposits, the weekly report.

None of it can send a message to anybody until steps 3 and 4 above are done.
That is the whole of what is blocking this now.
