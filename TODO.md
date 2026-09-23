# What needs doing

**The worklist, as a page:** https://claude.ai/artifact/RUkxMxmooA3VsckxfAVan9
— with links at the top to the **Stripe sheet**
(https://claude.ai/code/artifact/ce6ed7c3-5feb-4c27-a7c0-71d904f6b3f4) and the
**Willow & Co test pass**
(https://claude.ai/code/artifact/ee3b9c04-fabb-4cd5-a059-cc33d6805b56).

Two lists. Yours is first — accounts, DNS, decisions, things only you can do.
Mine is at the bottom. They are separate on purpose: the last version mixed them
up and it was impossible to tell what was blocking what.

Last updated: 16 September 2026, after the overnight review of the whole site.

---

# Migrations

**Run on 22 September:** `20260922210000_booking_confirmations.sql` — lets
`hours_before` be zero, which is how a template says "send this one as they
book". Nothing else changed. Until it ran, the settings screen offered
confirmations and the save said so in words rather than showing a raw
constraint error.

Checked from here afterwards, because a migration run by hand in a SQL editor
can be half-applied or applied to the wrong project — which has happened on
this project before, with the artist guard:

- The database accepts `hours_before = 0`, so the constraint really did change.
- A confirmation saves through the real screen: the "When it goes" choice, the
  server action, the validation and the constraint all agree, and the row lands
  enabled with its wording. Written against the Willow demo and deleted after.
- The immediate send fires once and only once. It depends on an
  ignore-duplicates upsert telling you what it inserted — proven directly on
  `reminders`: a new row comes back, a duplicate comes back empty. Had that
  gone the other way, every confirmation would have waited for the seven
  o'clock sweep, which looks exactly like the feature working until somebody
  books at noon.

Still unproven: a real booking end to end. The pieces either side of it are
checked, and the quickest proof is yours — add a confirmation on a demo, book
something, and watch it arrive.

**Nothing waiting, as of 23 September.** Checked from here rather than from
this list, which was wrong: it said `20260917120000_assistant_books.sql` was
still outstanding and it had in fact been run. Every column from the last
seven migrations is present, including the marketing entitlement Giles ran on
the 23rd.

**Run on 16 September:** `20260917100000_marketing_preferences.sql` — checked from
here afterwards: a customer set their own preferences from their link, it
recorded "they set it themselves" with the date, and a wrong link was refused.

The two from the overnight review were run on 16 September
and checked from here:

- `20260917010000_artist_protected_columns.sql` — proved as Aisha: she cannot
  point her Stripe elsewhere, move herself to another business, switch off
  owner-managed or hand her record to another login, and her own settings still
  save. Accepting an invitation still attaches a login, tested with a throwaway
  one on the demo.
- `20260917020000_sms_opt_outs.sql` — the table is there, the server can record
  and read a STOP, and staff cannot write to it by hand.

The SQL editor truncated the first version of the guard, so what ran is the
short form: the managed-person rules (rates, hours, voice) are still enforced
by the app rather than the database. Worth adding later, not urgent.

When one is waiting it will be named here. Until it is run the product keeps
working without it — everything new is written so the deploy and the migration
can happen in either order, and the screen says what it cannot do yet rather
than breaking.

---

# Waiting on you

Everything here is something I cannot do from this side. Roughly in the order
it is holding something up.

### 0. Switch the nightly backup on (5 minutes)

Built, tested against the live database — 726 rows, 514 KB sealed, read back
whole, refused with the wrong key — and waiting for a passphrase.

Put `BACKUP_KEY` into Vercel (Settings → Environment Variables, Production), at
least 16 characters, and keep it in your password manager. If it is lost every
backup is lost with it: there is no unencrypted path through this on purpose.

The first copy is taken between 2 and 5 the next morning. `node
scripts/check-live.mjs` then says "last night's backup was taken" with the
size, and says "nothing is backed up" until you do it.

Once a month, prove one comes back: download the newest from Supabase →
Storage → backups and run
`BACKUP_KEY='...' node scripts/restore.mjs <file>`. It only reports.

### 0a. The daily Google emails — make them a weekly digest

They are DMARC reports, and they are good news: I opened one and every
message sent as second-pair.com passed both checks (7 messages, all through
Resend, DKIM and SPF pass). Nothing is wrong; the format is just written for
machines.

Ten minutes, on the worklist with the exact steps. In short: sign up free at
dmarc.postmarkapp.com, copy the address they give you, and in Namecheap →
Advanced DNS edit the existing `_dmarc` TXT record to

    v=DMARC1; p=none; rua=mailto:YOUR-ADDRESS@inbox.dmarcdigests.com

Edit that record rather than adding a second one. Nothing about your sending
changes — SPF, DKIM and the policy stay as they are, and no customer email is
affected.

Later, once a couple of digests have come back clean: move `p=none` to
`p=quarantine`, which is what actually stops somebody spoofing the domain.
Worth seeing Zoho's forwarding in a report first — forwarded mail is what
usually breaks when that is tightened.

### 0. Stripe on the demo — working end to end

Second Pair LTD sandbox holds the key, the Connect client ID and the payments
webhook ("Second Pair payments (connected accounts)", secret ending `PQeJ`).
Proven on 15 September: Sarah connected her own Stripe, a £55 link was paid
with a test card, Stripe's message reached the site and the payment is marked
paid with Stripe's fee (£1.93) and take-home (£53.07).

**One click on the demo:** sign in as Sarah, Settings, and press **Connect the
business's Stripe** (the orange warning under "If somebody has not connected
Stripe yet"). Pick Sarah's same test account. Until then Priya, Mo, Chloe and
Jade's appointments cannot take a link, because the fallback switch is on but
the business itself has no account — Sarah's and Aisha's own work fine.

Optional tidy-up in Stripe: delete the Thin destination called **"Webhook
endpoint"**. Nothing uses it, and its secret is the wrong one to copy.

When you go live, the same three things come from your real Stripe account in
live mode — see the sheet below.

### 1b. Stripe, on the sheet

Everything about money is on one page now, in three parts: your own account,
how a business connects theirs, and how you would charge them monthly.

**https://claude.ai/code/artifact/ce6ed7c3-5feb-4c27-a7c0-71d904f6b3f4**

The three things worth knowing before you open it:

- **You are on test keys.** The live site's key starts `sk_test_`. Everything
  works and nothing takes money, so a real salon connecting Stripe today would
  connect a test account and never take a penny.
- **Connecting Stripe is a third of it.** Living Canvas is off at three
  switches, not one — the account, deposits, and payments in full. See below.
- **Nothing bills anybody.** The plan and price in the back office are notes.
  No invoice is raised and no card is charged, by anything, ever. That is five
  minutes of clicking in Stripe rather than code, and it is not done.

### 2. Switch the money on for Living Canvas

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

### 3. Living Canvas has no price list

It prices by the hour against size bands, which is right for tattooing and is
why there are seven bands and no services. Two things read from a named list
rather than from bands, and both are quietly empty because of it: picking what
somebody is having when you add a booking, and anything per-person.

Nothing is broken. It is a choice about whether a tattoo studio wants named
things as well — a piercing, a touch-up, a consultation — sitting alongside the
bands. Tell me and I will set it up either way.

### 4. Nobody has a phone signed up for notifications

Still not one device, on any of the three businesses.

A booking sends an email *and* a push, and the email half works — so you are
being told, just not on your phone. What is unused is the quick half, the one
that matters when somebody books while you are between jobs.

It has to be done on the phone itself, by each person, from their own settings
tab. New since the last version of this list: it is now its own line on the
dashboard checklist, so a business can see it rather than only me from a
terminal. The old checklist took an email address as good enough and read green.

### 5. Karen's consultation is ten minutes

Unchanged, and still ten minutes on the live record.

Three of Neat & Tidy's services need a consultation first — end of tenancy,
after builders, deep clean. Ten minutes is a phone call. If those quotes are
done by ringing somebody back, that is exactly right and there is nothing to
do. If Karen goes and looks at the property, the assistant is booking her a
ten-minute visit to quote a whole house.

It is your call, which is why it is here rather than changed.

### 6. Take a backup before you test hard

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

### 7. Decide whether to take a cut of what goes through

You asked whether you can get paid for sending businesses to Stripe.
Researched against Stripe's own documentation, September 2026.

**Not as a referral.** Stripe runs no public affiliate scheme — there is no
link you can sign up for that pays you per business referred. The Stripe
Partner Program does share revenue based on the volume of businesses you bring,
and it is application-based and aimed at platforms that already have volume to
talk about. Worth applying to when you have ten customers, pointless now.

**But there is a real mechanism, and you already have the integration for it.**
Every payment this product takes is a direct charge on the business's own
connected account. Stripe lets a platform add an `application_fee_amount` to
exactly that kind of charge: the money splits at the moment of payment, the
business gets the rest, and your cut lands in your own Stripe balance. Stripe
takes no extra fee on the fee.

It is not a referral bonus from Stripe. It is a fee from the business, which
is a better thing — it scales with their takings rather than with signing them
up.

**The decision, and it is a real one.** Today the answer to "does Second Pair
touch our money" is no, flatly, and that sentence sells. An application fee
makes the answer "a percentage of it, disclosed". Both are defensible; only one
of them is what the terms and the settings page currently say.

Three things to know before choosing:

- **Refunds do not return it automatically.** Refund a £95 colour and the
  application fee stays with you unless the refund explicitly says otherwise —
  so the business is £3 down on a sale they gave back. Since refunds here are
  done by hand in their own Stripe dashboard, there is no code of ours in the
  way to get it right. That is the one that turns into an angry email.
- **It has to be in the terms**, and in a sentence somebody reads before they
  connect, not in clause 14.
- **It changes the pricing conversation.** A subscription plus a percentage is
  two prices; most platforms pick one and are clearer for it.

If you want it, it is a small change — one field on the checkout session — plus
the refund handling, which is the part that is not small.

### 8. Decide about tapping a card on a phone

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

### 9. The Neat & Tidy number

Send it to Chris, and put it on the Facebook page, the Google listing and
anything else with the old one on.

### 10. Check the forward on info@neatandtidysolutions.co.uk

You sent a test to it. Confirm it arrived at the Second Pair address.

### 11. The slow ones

- **Meta verification** — weeks, and cannot be hurried. Steps below.
- **ICO registration** — done: ZC241583, from 7 September 2026.

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

Everything you have asked for, and where it stands. Scoped so you can push back
on any of it before I build it.

## Done on 15 September

- **Tapping an appointment opens on the appointment** — who, when, what, the
  price, the status — with one big **Complete** and "Change or cancel" beside
  it. It used to open the edit form with Complete three screens down.
- **Complete takes the whole sheet**: did they come, what they had, anything
  bought, how they paid.
- **A payment link is sent, not just shown**: "Text it to 07700…" / "Email it
  to…", plus copy or open for them to pay there. On the demo it says what it
  would have sent and sends nothing.
- **Owner and desk take money for anybody**: the record, the conversation and
  the till ask whose work it was, and the money lands in that person's own
  Stripe when the business pays people separately.
- **Each person's Stripe** is listed on Settings → Taking money, with "Connect
  my Stripe" on your own row.
- **Stripe connect says why when it fails** and checks the account was saved.
  The live check now spots a client ID and key from different Stripe accounts.
- **The page after paying** says deposit or payment, what for, to whom, and
  has a way back to the business.
- **The diary shows ✓ Completed · £55 paid** or No-show on each card.
- **Stripe's fee and the take-home amount** are recorded on every card payment.
- **Payment links were refused at random** for expiring exactly a day out.
  Fixed.
- **History on a client lists only visits that have happened**, and a title
  that is only the client's name is not shown twice.
- **Contact preference** (text or email) — migration run and live.

## Done earlier in testing

- Emailed replies read as emails; a daily ceiling on what the assistant answers
  by email; mail arriving at our addresses recorded and folded away in the back
  office.
- No VAT means no VAT.
- The client picker takes a mobile and an email.
- Deleting a conversation no longer lands on a 404.
- The desk sees the whole inbox, with a per-person filter.
- Find somebody in the diary; a client's record says when they are next in.
- The keyboard no longer covers the field you tapped; the iPad on its side uses
  its width.
- The diary loads in two round trips rather than five.

## Done on 16 September

- **Sales pitches and spam are no longer answered by email**, for every
  business: the business name squashed into one word, promises of orders or
  sales in numbers, a percentage commission, a fake "Re:", throwaway seller
  addresses, empty greetings, website-seller chasers, and anything the
  mailbox provider already marked as spam. Ignored before the assistant runs,
  so no credits spent. Tested on all nine real ones received.
- **Every screen in the business's own words** — one words helper, about thirty
  salon and tattoo phrases replaced, examples from the trade's own services.
- **New businesses are set up the way their trade prices**: a price list for
  salons, clinics, tutors and the like; size bands for tattoo and trades. They
  all started on size bands before.
- **Forms and signatures** — built, waiting on the migration above:
  Settings → Forms (ready-made forms per trade and an editor), a Forms section
  on every client's record (send by text or email or just the link; add a
  photo or PDF of a paper form), Clients → Forms (send to several, or everyone
  booked on a day; what is still waiting), the customer's signing page, and a
  printable signed copy that never changes when the form is edited.
- **Reports in the back office** — `/admin/reports`: any date range, by business
  and by trade, spreadsheet download. Enquiries and conversion, first reply,
  messages by channel, assistant and text costs, email verdicts, appointments
  and no-shows, money through Stripe with fees, forms, failures, last sign-in,
  days quiet and an at-risk list.

## Done on 16 September, later

- **Something bespoke on a bill** — "+ Something else" on Complete.
- **Each business's own report** — any range, how it was paid, new versus
  returning, when it is busy, forms waiting, "Email me this", and a Monday
  email the owner switches on. The menu says Reports.
- **Forms tested end to end on the demo**, and a failed submit keeps answers.
- **Worklist page** with tick-off steps and links to every sheet.

## Done overnight, 15-16 September (whole-site review)

Four reviews of the whole codebase — the customer's side, the diary and money,
settings and the back end, the assistant and messaging — plus a crawl of every
page as the owner, as two members of staff and as a customer, and the unit
tests. 45 real faults found; 43 fixed and deployed. The serious ones:

- **Held texts and emails were never answered.** Both live businesses answer
  "when I'm free", which holds a message for five minutes so the owner can
  reply first. The job that releases them asked the database for a column that
  does not exist, failed every single run, and the error was thrown away — so
  every text and email arriving in opening hours was held and then answered by
  nobody. Out-of-hours messages were answered normally, which hid it. Fixed,
  and a reply that cannot be sent now hands the conversation over and says so.
- **Booking a second visit cancelled the first.** "Can you also do the 20th?"
  silently cancelled the appointment on the 10th — including ones already done.
  Now it asks whether it is an extra visit, and only a deposit hold is ever
  replaced.
- **The assistant was never told today's date.** "Tomorrow" and "next Friday"
  were guesses.
- **Texts could be dropped.** A reply taking more than 15 seconds was thrown
  away by Twilio while the thread showed it as sent. Texts are now acknowledged
  first and sent separately, from the business's own number.
- **A customer could pay twice**, or pay for a slot whose hold had run out.
- **Complete ignored a deposit already paid** — a £100 colour with £30 paid
  asked for £100.
- **Saving Settings → Assistant wiped the business email** (reply-to on every
  message, and the owner's own alerts). Saving prices took a person's own
  services off the list.
- **Diary bookings got no reminders**, and moving a booking killed its
  reminders for good.
- **Inbox replies went out from the platform's text number**, so customers'
  replies reached nobody, and could not send on WhatsApp or Instagram at all.
- **Staff could download the whole client list**, and had the whole-diary
  calendar link in their browser.

Left deliberately: Meta message retries (nothing is live on Meta yet), and the
last day of the 21-day slot window not being checked against personal calendar
feeds (the database still prevents any double-booking).

## Done on 16 September, after that

- **A diary without the channels.** Each person now has "the assistant can
  offer and book them", the owner's to set. Off, they keep their diary and you
  book them yourself — no customer is offered them on the website, on a link of
  their own or on a number of their own. Ashcroft's apprentice is exactly this.
- **A gate that was backwards**: "you look after their settings" only ever
  appeared on the owner's own record, where it means nothing, and never on the
  records it was written for.
- **Every trade pack now carries its own roles and its own questions.** Roles
  were on ten packs and empty on twenty-three; most packs asked only park, pay
  and cancel. A groomer is now asked about vaccination records, a garage about
  courtesy cars, an instructor about manual or automatic. Two tests keep it so.

## Done on 16 September, from your six

- **One Stripe account, not two.** Settings offers to point the business at the
  account you have already connected. You had just hit this on the demo: the
  business is on `acct_1UGDV5Rb…` and Sarah on `acct_1UFux8DZ…`, which is the
  second account nobody wanted.
- **Deleting a conversation removes the client too**, unless they have an
  appointment, a payment, a form or another thread.
- **VAT is one question with three answers**, the first being "none — we are
  not VAT registered". Nothing changed underneath; the screen was the problem.
- **Marketing per channel, with the customer's own preferences page.** Email
  and text kept apart, when and how it was agreed recorded, and every client
  has a link they can use to change it without asking. Reminders untouched.
- **Four more demo businesses, and one brand new one.** An electrician who
  travels and adds VAT, a groomer who takes deposits and works Tuesday to
  Saturday, a garage with bays and VAT in the price, a driving instructor with
  one car and evening lessons — each seeded through its own trade pack, plus
  Brightwork Plastering with nothing filled in for walking the set-up.
- **Checked each one talks like its trade**: the electrician asks for the
  postcode and quotes hours plus VAT, the garage asks for the reg, the groomer
  prices by breed and offers Saturdays, the instructor offers blocks of ten.

## Done most recently

- **Staff sending a payment link** no longer hits "row-level security". Tested
  live as Aisha on Sarah's appointment (money to Sarah's Stripe) and on her own
  (to Aisha's).
- **The diary opens on your own column** when you are one of the team; the
  owner and the desk still open on everyone.
- **Quotes can name who wrote them** — "From (optional)", defaults to you,
  shows "Quoted by …" on the quote.
- **Overlapping boxes** — scanned every page as owner and as Aisha at phone,
  iPad portrait, iPad landscape and 1024 wide. Nothing real left on screen; the
  phone header's three theme buttons are one now, so the business name fits.
- **Fallback with no business account** now says so in Settings, with the button.
- Needs a form first, quotes with priced lines, holiday From/To, service saved
  on bookings, Stripe for each person — all done earlier.

## Done on 16 September, later

- **Reports for a business that travels** — where the week's work was, by
  postcode area and by what it came to; and whether jobs ran to time, from the
  length recorded at Complete against what was booked. Both on the page and in
  Monday's email, both silent unless they say something.
- **Backups take themselves** — nightly, encrypted, a fortnight kept, and
  check-live reports whether last night's happened.
- **The trade packs** — roles and their own questions for all 34 trades.
- **Anything still salon-shaped** — the diary's column button, the client list
  and the team screens now use each trade's own words.

## Done on 22 September, with the re-brand

- **Booking confirmations** — a message as soon as somebody books, saying what
  they have booked and when. It is a reminder template set to zero hours
  before, so it reuses the whole of the reminder machinery: rendering, the
  channel they came in on, their opt-out, the claim that stops it going twice,
  the record in the thread, and the owner-sends-by-hand fallback. Settings asks
  it in words rather than expecting anybody to type a nought, and set-up offers
  it as an optional step. It is sent at booking time rather than by the sweep,
  because the sweep runs once a day at seven. Payment pre-authorisation is
  deliberately not done — parked with you.
- **A hue per section** in the sidebar and the phone bar, on the icon only.
  Cobalt stays the one accent.
- **The settings menu on a phone** is the same sheet as the account corner and
  the public site's, instead of the browser's grey dropdown.

## Next, in the order I would do them

### 1. What a customer actually receives

Giles, 23 September: the outgoing things — confirmations, reminders, review
requests — need to look and read like a company that has thought about it.
What the better ones do is send a short text with a link to a proper page,
rather than trying to say everything in 160 characters.

That shape is right and we are most of the way to it already:

- Every message is rendered when it goes out, not when it is scheduled, so
  changing the wording changes what is in flight.
- forOneText already cuts a long message between sentences for SMS.
- There are public pages a link could point at — /f/<token> for forms,
  /prefs/<token> for marketing preferences — so the pattern and the token
  machinery exist.

What is missing is the page itself and the look of the email. A booking page
showing what was booked, when, with who, what it costs, what to bring, and a
button to add it to a calendar or ask a question — with the text reduced to a
sentence and that link. Emails want the same content and a real template
rather than plain text.

Worth doing after the confirmations settle, and worth seeing the example
Giles is getting hold of first: copying the structure of one that works is
faster and better than inventing one.


### 1. Saying an appointment has moved

A confirmation goes once, on purpose — dragging somebody across the diary must
not thank them for booking a second time. But a moved appointment does want
saying, and it is a different message with different words. Small, and the
wording is the part worth agreeing with you first.

### 4. Backups, automatically

Today it is one command you run yourself. Options, cheapest first: a nightly
job writing an encrypted file to storage; the same plus a copy somewhere off
this platform; or manual with a reminder. The middle one is what I would do,
and the decision is yours because it costs money.

### 5. Meta channels

When the app is through review. Nothing to build until then.

## Known and deliberately not done

- Sign-up is invitation-only. Every business is set up by somebody who has
  spoken to the owner, and the page that used to offer a form says so.
- There is nowhere in the app to type the Stripe Connect key. It is ours, it is
  the same value for every business on here, and a box on one business's
  settings page would imply both of those are false.
- No refund button. Standard Connect: the business is the merchant of record
  and it is their money. The product links to the exact charge instead.
