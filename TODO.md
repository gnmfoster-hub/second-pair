# What needs doing

Two lists. Yours is first — accounts, DNS, decisions, things only you can do.
Mine is at the bottom. They are separate on purpose: the last version mixed them
up and it was impossible to tell what was blocking what.

Last updated: 1 September 2026.

---

# Yours

## The order, and why

| # | Job | Time | Why it is here |
| - | --- | ---- | -------------- |
| 1 | DNS on second-pair.com | 30 min | Unblocks Vercel, email and Meta at once |
| 2 | Resend, then Supabase SMTP | 30 min | Sign-in is currently broken for real use |
| 3 | Vercel deploy | 20 min | Nothing is live until this |
| 4 | Name clearance | 1 hr | Before anything is printed |
| 5 | Twilio | 30 min + days waiting | Approval queue; start the clock |
| 6 | Meta verification | 1 hr + weeks waiting | Slowest thing here |
| 7 | Four decisions | — | I am blocked on two of them |

Do 1 and 2 in the same sitting. They share a browser tab.

---

## 1. DNS on second-pair.com

Log in to wherever you bought the domain. Find "DNS", "DNS records", or
"Advanced DNS". You are adding records, not changing nameservers.

**For Vercel — add these two now:**

| Type  | Host / Name | Value                  | TTL     |
| ----- | ----------- | ---------------------- | ------- |
| A     | `@`         | `76.76.21.21`          | Default |
| CNAME | `www`       | `cname.vercel-dns.com` | Default |

`@` means the bare domain. Some registrars want it blank instead — if `@` is
rejected, leave the field empty.

**For email — three or four more**, but do step 2 first because Resend generates
them for you and they are unique to your account. Do not invent them. They will
look roughly like:

| Type | Host / Name         | Purpose                            |
| ---- | ------------------- | ---------------------------------- |
| TXT  | `send`              | SPF — says Resend may send for you  |
| TXT  | `resend._domainkey` | DKIM — signs your mail so it is trusted |
| MX   | `send`              | Bounce handling                     |
| TXT  | `_dmarc`            | DMARC — optional, improves delivery |

**Copy the values Resend shows you exactly.** A single wrong character means
every email you send lands in spam, and it will not tell you — it just quietly
does not arrive.

DNS takes anywhere from two minutes to an hour to propagate. Both Vercel and
Resend have a "Verify" button; press it, and if it fails, wait twenty minutes
and press it again before assuming you made a mistake.

---

## 2. Resend, then Supabase SMTP

**This is the most urgent technical thing on the list**, and it is not obvious
why, so: signing in, signing up and password resets all send an email. Right now
they go through Supabase's *shared* sender. That is rate limited to a handful an
hour across everybody using it, and it sends from a Supabase address that lands
in spam. The moment two people sign up in the same hour, one of them does not
get in. It is the front door and it is currently held shut.

### Resend

1. Go to resend.com and sign up. Free tier: 3,000 emails a month, 100 a day.
   That is plenty for a long while.
2. **Domains → Add Domain →** `second-pair.com`. Region: Ireland or London.
3. It shows you the DNS records. Add them at your registrar (step 1), then come
   back and press **Verify**.
4. **API Keys → Create API Key.** Name it "Second Pair", permission "Sending
   access". Copy it — it is shown once.
5. Put it in `.env.local`. Open it with notepad:

   ```
   notepad "$HOME\Desktop\inkdesk\.env.local"
   ```

   Add these two lines:

   ```
   RESEND_API_KEY=re_xxxxxxxxxxxx
   EMAIL_FROM=hello@second-pair.com
   ```

   **Do not paste the key into a chat with me.** It goes in the file and
   nowhere else.

### Supabase SMTP

This is what fixes sign-in.

1. Supabase dashboard → your project → **Project Settings → Authentication**.
2. Find **SMTP Settings**. Turn on **Enable Custom SMTP**.
3. Fill in:
   - Host: `smtp.resend.com`
   - Port: `465`
   - Username: `resend`
   - Password: your Resend API key from above
   - Sender email: `hello@second-pair.com`
   - Sender name: `Second Pair`
4. Save.
5. While you are there: **Authentication → Rate Limits**. The email limit is
   low by default because of the shared sender. Raise it — 100 an hour is
   sensible. It is pointless leaving it at 4 once you have your own sender.
6. Test it: sign out, then use "email me a link" on the login page. It should
   arrive within seconds, from your address, not Supabase's.

---

## 3. Vercel deploy

1. Vercel → **Add New → Project → Import** `gnmfoster-hub/second-pair`.
2. Framework preset: Next.js. Leave the build settings alone.
3. **Before deploying**, open **Environment Variables** and paste in everything
   from your `.env.local`. Every line. Missing one does not fail the build — it
   fails quietly at runtime, which is worse.
4. Deploy.
5. **Settings → Domains → Add** `second-pair.com` and `www.second-pair.com`.
   It checks the DNS from step 1.
6. **Settings → Cron Jobs**: confirm the reminders job is scheduled. It needs
   `CRON_SECRET` set, or it returns 503 and nothing is ever sent.

Whenever you add an environment variable later, you must **redeploy**. Vercel
does not pick up new variables on its own, and this catches everybody once.

---

## 4. Name clearance

An hour, and worth doing before the name goes anywhere it cannot be taken back.

1. **Companies House** — find-and-update.company-information.service.gov.uk.
   Search "Second Pair". You are looking for an active company with the same or
   a confusingly similar name.
2. **UK IPO trade marks** — trademarks.ipo.gov.uk/ipo-tmtext. Search "Second
   Pair" in **class 9** (software) and **class 42** (software as a service).
   Those two are what matter for this. An existing mark in class 25 (clothing)
   does not stop you.
3. **Handles** — check the socials you would actually use.
4. If it is clear and you want to keep it, a UK trade mark application in those
   two classes is about £200 and you can file it yourself.

If it comes back dirty, you want to know now, while the name is only in a
codebase and not on a customer's invoice.

---

## 5. Twilio

You do not need this working today. Start it now because UK number approval
takes days and the clock only starts when you apply.

1. Sign up at twilio.com. The trial credit covers testing.
2. **Phone Numbers → Buy a Number.** Country: United Kingdom. Tick **SMS**.
   Buy **one**. Do not buy one per business yet — the code is not written.
3. It will ask for a **Regulatory Bundle**: a UK address and a document proving
   it (a utility bill or bank statement in the business name). Submit it
   immediately. A day or two normally, longer if they query anything.
4. From the console, note down:
   - Account SID
   - Auth Token
   - The number you bought, in full international form (`+447…`)
5. Put them in `.env.local` with notepad, same as before:

   ```
   TWILIO_ACCOUNT_SID=ACxxxxxxxx
   TWILIO_AUTH_TOKEN=xxxxxxxx
   TWILIO_FROM_NUMBER=+447xxxxxxxxx
   ```

Tell me when the number is live and I will point the webhook at it so replies
come back into the inbox.

---

## 6. Meta

The slowest thing on this list and it cannot start until step 3 is done, because
Meta will not review an app without a live HTTPS URL and a published privacy
policy.

**You are setting up your own business portfolio, for Second Pair — not one on
Living Canvas's behalf.** You do this once. Each customer then connects their
own WhatsApp and Instagram to your reviewed app by clicking a button. This is
the thing most people get wrong and end up doing forty times.

1. **business.facebook.com** → create a Business Portfolio for Second Pair.
2. **Business Settings → Business Info** → start **Business Verification**.
   It wants your company details and a document — a utility bill, bank
   statement, or certificate of incorporation. This is the part that takes
   weeks. Start it before you need it.
3. **developers.facebook.com** → create an App, type **Business**.
4. Add the products: **WhatsApp**, **Messenger**, **Instagram**.
5. Set the callback URL to `https://second-pair.com/api/meta/webhook` and a
   verify token you make up. Tell me the token and I will match it.
6. Request the permissions: `whatsapp_business_messaging`,
   `pages_messaging`, `instagram_manage_messages`.
7. Submit for **App Review**. They want a screencast showing what the app does.

---

## 7. Decisions I need from you

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
which in one town they will.

There is a cheaper option — an **alphanumeric sender ID**, where the message
shows as from "Living Canvas" rather than a number. Costs nothing extra, looks
better, and **nobody can reply to it.** Useless here, because the whole point is
that people answer.

## Email is not a reminder channel

People do not read email. "You are in at four tomorrow" has to be read, and that
is SMS's job.

Email is right for things somebody goes looking for later: **confirmations**
(now sent, with the appointment attached as a calendar file), **deposit
receipts**, **staff logins** (now sent for you), **the weekly report**, and as
the fallback when there is no mobile number.

---

# Mine

**Doing now:** SMS. Twilio behind the same `deliver()` everything else uses, a
number stored per business, and an inbound webhook so replies land in the inbox
and the assistant picks them up. This is what makes outbound messaging actually
send.

**Then:**

1. Reminders over SMS. They currently only reach people who came in through the
   website widget, which is almost nobody.
2. Meta, once the app is through review.
3. Roles on the artist editor, and per-person greeting and tone — all three have
   database columns and no screen yet.
4. Deposit receipts by email.

**Done and waiting on you:**

- Email: confirmations with a calendar file, staff invites that send themselves.
  Needs step 2.
- Outbound messaging: message a client from their page, add a client who has
  never written in. Needs step 2 or 5.
- The diary reads properly on a phone.
- Staff logins, permissions, per-person hours, rates, roles, time off.
- Calendar feed, push notifications, deposits, the weekly report.

Everything in that list is built and none of it can send a message to anybody
until steps 2 and 5 are done. That is the whole of what is blocking this.
