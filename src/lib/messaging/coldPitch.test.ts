import { test } from "node:test";
import assert from "node:assert/strict";
import { coldPitch } from "./coldPitch.ts";

const studio = { name: "Living Canvas Tattoo" };

/*
 * The seven Living Canvas received on 15 September, word for word, every one
 * answered by the assistant in the studio's name.
 */
const received = [
  {
    from: "thevictoriaagency3135@gmail.com",
    subject: "Re:Livingcanvastattoo",
    body: "Si je peux aider votre boutique à atteindre plus de 500 commandes au cours des 30 prochains jours, seriez-vous ouvert(e) à discuter de la manière dont nous pourrions collaborer ?",
  },
  {
    from: "larexecomagency001@gmail.com",
    subject: "Collaboration Opportunity For Livingcanvastattoo",
    body: "Good Day Livingcanvastattoo, I've been following what you're doing at store and I'm genuinely impressed by your recent work. I believe there's a strong opportunity for us",
  },
  { from: "beebsales105@gmail.com", subject: "", body: "Hey 👋" },
  {
    from: "tiwaexpert.fr@gmail.com",
    subject: "Hello",
    body: "If I help you generate 10–20 sales per week, would you be willing to agree to a 3% commission on the sales generated?",
  },
  {
    from: "bestdressedpetstore@gmail.com",
    subject: "Re:Re: A little HelloLivingcanvastattoo",
    body: "Hi Livingcanvastattoo, just wanted to check if I’ve reached the owner of the store?",
  },
  {
    from: "suport.elaandigitals@gmail.com",
    subject: "Livingcanvastattoo",
    body: "Good news Livingcanvastattoo's Shop stands out with thoughtful design and exciting products potential. From what I've observed, it can be generating 150-300 orders monthly, equivalent to 5-10 orders daily.",
  },
  {
    from: "kaseefexpert5@gmail.com",
    subject: "Quick question",
    body: "If I bring 30–45 orders to Livingcanvastattoo in September, can we explore a collaboration? What’s the best WhatsApp to connect with you?",
  },
];

for (const [i, email] of received.entries()) {
  test(`the real pitch #${i + 1} (${email.from}) is caught`, () => {
    const v = coldPitch(email, studio);
    assert.equal(v.pitch, true, `score ${v.score}: ${v.signs.join("; ")}`);
  });
}

/*
 * And the customers it must never swallow. Each of these contains one thing a
 * pitch has — a collaboration, a Gmail with numbers, the handle, a commission —
 * and is still somebody who wants a tattoo.
 */
const customers = [
  { from: "jo.marsh@gmail.com", subject: "Tattoo quote", body: "How much for a forearm piece?" },
  { from: "sam1987@gmail.com", subject: "Booking", body: "Hi, can I book in for a small wrist tattoo next week?" },
  {
    from: "ellie@gmail.com",
    subject: "Collaboration on a sleeve",
    body: "I'd love to collaborate with one of your artists on a sleeve design, is Karen free in October?",
  },
  { from: "dan@outlook.com", subject: "Commission", body: "I'd like to commission a custom piece of my dog, roughly palm sized." },
  {
    from: "maya@hotmail.com",
    subject: "Saw you on instagram",
    body: "Found you through @livingcanvastattoo and livingcanvastattoo.ink — do you do fine line?",
  },
  { from: "kim@gmail.com", subject: "Re: your reply", body: "Thanks, Thursday at 2 works for me." },
  { from: "lee@gmail.com", subject: "", body: "Hi, do you do walk-ins on Saturdays?" },
  { from: "zoe2001@gmail.com", subject: "Hello", body: "Hello! How much is a deposit for a half sleeve?" },
];

for (const email of customers) {
  test(`a customer is not a pitch: "${email.subject || email.body.slice(0, 30)}"`, () => {
    const v = coldPitch(email, studio);
    assert.equal(v.pitch, false, `score ${v.score}: ${v.signs.join("; ")}`);
  });
}

test("a one-word business name is never matched as squashed", () => {
  const v = coldPitch({ from: "a@b.com", subject: "Inkwell", body: "Hi Inkwell, can I book?" }, { name: "Inkwell" });
  assert.equal(v.pitch, false);
});

// Two Neat & Tidy received, pitching websites rather than orders.
test("a web designer offering a quote is a pitch", () => {
  const v = coldPitch(
    { from: "tim.webllc58@gmail.com", subject: "Re: Yes, Send Price", body: "Hi, I'm still waiting for your reply May I send you a quote" },
    { name: "Neat & Tidy Solutions" },
  );
  assert.equal(v.pitch, true, v.signs.join("; "));
});

test("an SEO 'audit errors' chase is a pitch", () => {
  const v = coldPitch(
    { from: "nancy.fevor030@gmail.com", subject: "Re: Audit Errors ❗", body: "Hi, info@neatandtidysolutions.co.uk Any Update? Please send" },
    { name: "Neat & Tidy Solutions" },
  );
  assert.equal(v.pitch, true, v.signs.join("; "));
});

test("a customer asking for a quote is not", () => {
  const v = coldPitch(
    { from: "sue77@gmail.com", subject: "Quote please", body: "Could you send me a quote for an end of tenancy clean? 2 bed flat." },
    { name: "Neat & Tidy Solutions" },
  );
  assert.equal(v.pitch, false, v.signs.join("; "));
});

test("a customer called Brandon or Devon forwarding something is not a seller", () => {
  for (const from of ["brandon.hale@gmail.com", "devon1984@gmail.com"]) {
    const verdict = coldPitch({
      from,
      subject: "Fwd: photos of the kitchen",
      body: "Hi, forwarding the photos from my landlord. Could you quote for an end of tenancy clean?",
      headers: {},
    });
    assert.equal(verdict.pitch, false, from);
  }
});

/*
 * And the four that arrived on 16 September, after the rules above were
 * written — every one answered in the studio's name again. Each got through on
 * a detail: "the store owner" rather than "owner of the store", "3 percent"
 * rather than "3%", "200+ orders" rather than "200-400 orders", and an agency's
 * own domain, which nothing looked at.
 */
const laterOnes = [
  {
    from: "support@vantagecoreagency.com",
    subject: "",
    body: "Is anyone available to chat with regarding this store,\nlivingcanvastattoo.ink",
  },
  {
    from: "yuslovecontact01@gmail.com",
    subject: "",
    body: "If I bring your store 200+ orders in  24–48 hours window, I’d expect a 3 percent commission. If that works with you kindly share your WhatsApp",
  },
  {
    from: "dreymary.info@gmail.com",
    subject: "New visitor livingcanvastattoo.ink",
    body: "Hello there,\nMay I know if I'm speaking with the store owner?",
  },
  { from: "beebsales105@gmail.com", subject: "(no subject)", body: "Hey 👋" },
];

for (const [i, email] of laterOnes.entries()) {
  test(`the second day's pitch #${i + 1} (${email.from}) is caught`, () => {
    const v = coldPitch(email, { ...studio, sites: ["livingcanvastattoo.ink"] });
    assert.equal(v.pitch, true, `score ${v.score}: ${v.signs.join("; ")}`);
  });
}

/*
 * The other half of the job. Every one of these is a real thing to write to a
 * tattoo studio, and silencing any of them costs the business a customer —
 * which is worse than a pitch in the inbox.
 */
const realOnes = [
  {
    from: "hannah.p@gmail.com",
    subject: "Cover up",
    body: "Hi, I emailed info@livingcanvastattoo.ink last week about covering an old tattoo on my forearm — did it come through?",
  },
  {
    from: "dave1987@hotmail.com",
    subject: "Re: your reply",
    body: "Thanks — Saturday works. Is the deposit still 50?",
  },
  {
    from: "j.okafor@gmail.com",
    subject: "Quote",
    body: "Could you give me a price for a half sleeve? I found you on livingcanvastattoo.ink and wanted to check before I book.",
  },
];

for (const [i, email] of realOnes.entries()) {
  test(`a real customer #${i + 1} is left alone`, () => {
    const v = coldPitch(email, { ...studio, sites: ["livingcanvastattoo.ink"] });
    assert.equal(v.pitch, false, `score ${v.score}: ${v.signs.join("; ")}`);
  });
}

/*
 * 17 September, 7.18am. Four words and a web address, and it got through
 * because every "asking for the owner" pattern so far has needed either a shop
 * word or a speaking verb.
 */
test("the one from the morning of the 17th is caught", () => {
  const v = coldPitch(
    { from: "supreme.hikmart@gmail.com", subject: "", body: "Is the owner here?\n\n\nlivingcanvastattoo.ink" },
    { name: "Living Canvas Tattoo", sites: ["livingcanvastattoo.ink"] },
  );
  assert.equal(v.pitch, true, `score ${v.score}: ${v.signs.join("; ")}`);
});

test("every way a list-seller asks for the owner", () => {
  const asks = [
    "Is the owner here?",
    "Is there an owner I can speak to?",
    "Is the manager around?",
    "Can I speak to the owner please",
    "Who is the owner of this lovely place",
    "May I talk with the boss?",
    "Are you the owner?",
  ];
  for (const ask of asks) {
    const v = coldPitch(
      { from: "x@gmail.com", subject: "", body: `${ask} livingcanvastattoo.ink` },
      { name: "Living Canvas Tattoo", sites: ["livingcanvastattoo.ink"] },
    );
    assert.equal(v.pitch, true, `"${ask}" scored ${v.score}: ${v.signs.join("; ")}`);
  }
});

test("a customer mentioning the owner by name is still a customer", () => {
  const v = coldPitch(
    {
      from: "hannah.p@gmail.com",
      subject: "Thursday",
      body: "Hi, is the owner Sarah in on Thursday? She did my last tattoo and I'd like her to do this one.",
    },
    { name: "Living Canvas Tattoo", sites: ["livingcanvastattoo.ink"] },
  );
  assert.equal(v.pitch, false, `score ${v.score}: ${v.signs.join("; ")}`);
});

/*
 * The three below came out of real inboxes on the two live businesses, marked
 * as spam by Giles himself. They are here word for word because a rule written
 * from a remembered paraphrase is a rule that matches the paraphrase.
 */

test("an agency pitch that asks for a one-word reply", () => {
  const v = coldPitch(
    {
      from: "sabid.k@atolynus.com",
      subject: "Ink",
      body: `I wanted to bring something to Ink's attention before a competitor gets there first.

While you're deciding what to post next, someone else in your space already closed the deal.
Ink, losing ground right here, one day at a time.
We don't want Ink watching from behind. Let's build the system that keeps you ahead website, content, ads, moving together, every month.

Reply "Yes" portfolio first, then a plan made only for Ink.`,
    },
    { name: "Living Canvas Tattoo", sites: ["livingcanvastattoo.ink"] },
  );
  assert.equal(v.pitch, true, `score ${v.score}: ${v.signs.join("; ")}`);
});

test("a lead-generation platform selling work to a trade", () => {
  const v = coldPitch(
    {
      from: "support@myjobquote.co.uk",
      subject: "Ready for more work, Karen?",
      body: `Hi Karen, A new job is posted every 60 seconds, so there's always work waiting. Remember, only three tradespeople can quote each job, so don't miss your chance. The sooner you browse and quote new leads, the better your chances of securing the work. Browse Latest Jobs. More Leads, On Your Terms. Steady stream of leads ready for when you need them.`,
    },
    { name: "Neat & Tidy Solutions", sites: ["neatandtidysolutions.co.uk"] },
  );
  assert.equal(v.pitch, true, `score ${v.score}: ${v.signs.join("; ")}`);
});

/*
 * This one was marked as spam too, and it is not spam — it is somebody asking
 * a cleaner when they can clean, which is the entire thing the product exists
 * to catch. It is kept as a test precisely because it was mislabelled: the
 * rules must go on letting it through no matter what else is added.
 *
 * A wrong spam label is worse than no label. It is one lost job on its own,
 * and if rules were fitted to it, it would be every job like it after that.
 */
test("a real enquiry is never a pitch, however short", () => {
  for (const ask of [
    "Hi when could you do cleaning",
    "hi do you have any availability next week",
    "how much for a tattoo",
  ]) {
    const v = coldPitch(
      { from: "+447711774029", subject: "", body: ask },
      { name: "Neat & Tidy Solutions", sites: ["neatandtidysolutions.co.uk"] },
    );
    assert.equal(v.pitch, false, `"${ask}" scored ${v.score}: ${v.signs.join("; ")}`);
  }
});

/*
 * The one that got a reply.
 *
 * This reached Neat & Tidy on 18 September and the assistant answered it
 * politely, which tells a list its address is live and reads as the business
 * being unable to tell a customer from a salesman. It scored one: only the
 * throwaway address matched, because it had a real In-Reply-To header — it
 * was a genuine follow-up to their own earlier send — so the "Re: to nobody"
 * sign did not fire either.
 *
 * Nothing in the words counted at all, and the words were the giveaway.
 */
test("the SEO pitch that got a polite answer out of a cleaning company", () => {
  const v = coldPitch(
    {
      from: "ayerakhan789@outlook.com",
      subject: "Re: Yes",
      // Threaded, so it is a real reply and the Re: sign correctly stays quiet.
      headers: { "in-reply-to": "<abc@outlook.com>", references: "<abc@outlook.com>" },
      body: `Hi

I sent you an email a few days ago. I didn't get any response back from you.

May I send an Proposal and Pricing?

thanks,

From: Ayera Khan
Sent: Thursday, September 17, 2026 12:55 PM
Subject: Re: Yes

Hi,

I was going through your website, which isn't doing well but has a lot of potential in your business.

We can place your website on Google's first page.

May I send an Proposal and Pricing?

Thanks,`,
    },
    { name: "Neat & Tidy Solutions", sites: ["neatandtidysolutions.co.uk"] },
  );
  assert.equal(v.pitch, true, `score ${v.score}: ${v.signs.join("; ")}`);
});

/* A customer may mention a website without being sold one. */
test("a customer who found them through their website is not a pitch", () => {
  const v = coldPitch(
    {
      from: "hannah.p@gmail.com",
      subject: "Cleaning",
      body: "Hi, I found your website on Google and wanted to ask what you charge for a deep clean. Could I send you a few photos of the kitchen?",
    },
    { name: "Neat & Tidy Solutions", sites: ["neatandtidysolutions.co.uk"] },
  );
  assert.equal(v.pitch, false, `score ${v.score}: ${v.signs.join("; ")}`);
});

/*
 * The next one through the door, exactly as the comment above the rule
 * predicted. Two misses in one short sentence: "please" between the pronoun
 * and the verb, and "connect" not being one of the verbs listed.
 */
test("asking to be connected to the person who owns the store", () => {
  for (const ask of [
    "Hello,can I please connect to the person who owned the store?.",
    "Can I kindly speak to the owner please",
    "Could you connect me with the business owner",
    "May I talk to the person who runs this place",
  ]) {
    const v = coldPitch(
      { from: "raufsalaudeen666@gmail.com", subject: "Enquiry", body: ask },
      { name: "Living Canvas Tattoo", sites: ["livingcanvastattoo.ink"] },
    );
    assert.ok(
      v.signs.includes("asks whether it has reached the owner"),
      `"${ask}" gave ${v.signs.join("; ") || "nothing"}`,
    );
  }
});

/*
 * Letters a rule cannot read.
 *
 * Living Canvas got this on 19 September and every rule in the file saw
 * nothing in it, because those are mathematical monospace characters rather
 * than letters. The studio's assistant replied to it, politely, in the
 * studio's name — which is how a spammer learns the address is real.
 */
test("a pitch written in look-alike characters is still a pitch", () => {
  const v = coldPitch(
    {
      from: "mmdtechxpert62@gmail.com",
      subject: "Re:",
      body:
        "\u{1D428}".normalize("NFKC") === "o"
          ? "\u{1D470}\u{1D48F} \u{1D46E}\u{1D45C}\u{1D45C}\u{1D454}\u{1D459}\u{1D452} starts sending you 1k \u{1D463}\u{1D456}\u{1D460}\u{1D456}\u{1D461}\u{1D45C}\u{1D45F}\u{1D460}\nto your \u{1D464}\u{1D452}\u{1D44F}\u{1D460}\u{1D456}\u{1D461}\u{1D452}, is your store ready to convert 40 order?."
          : "",
    },
    { name: "Living Canvas Tattoo", sites: ["livingcanvastattoo.ink"] },
  );
  assert.ok(v.pitch, `let through with ${v.signs.join("; ") || "nothing"}`);
});

/*
 * A sentence does not know where the line wrapped.
 *
 * The same email, and the reason it still scored one point after the letters
 * were readable: the newline fell between "visitors" and "to your website", so
 * the phrase existed for a reader and not for a rule.
 */
test("a phrase broken by a line wrap is still the phrase", () => {
  const v = coldPitch(
    {
      from: "someone@gmail.com",
      subject: "Re:",
      body: "If Google starts sending you 1k visitors\nto your website, is your store ready to convert 40 order?.",
    },
    { name: "Living Canvas Tattoo" },
  );
  assert.ok(v.pitch, `let through with ${v.signs.join("; ") || "nothing"}`);
});

/*
 * Neat & Tidy's own mailbox tags what it catches and forwards it anyway. We
 * read the tag as part of the subject and formed an opinion from scratch.
 */
test("a mail provider's own spam tag is believed", () => {
  for (const subject of ["***SPAM*** Re: Audit Errors", "***SPAM*** Re: Yes, Send Price"]) {
    const v = coldPitch({ from: "x@gmail.com", subject, body: "Any update?" }, { name: "Neat & Tidy Solutions" });
    assert.ok(v.pitch, `"${subject}" was let through`);
  }

  const flagged = coldPitch(
    { from: "x@gmail.com", subject: "Hello", body: "Any update?", headers: { "X-Spam-Flag": "YES" } },
    { name: "Neat & Tidy Solutions" },
  );
  assert.ok(flagged.pitch, "an X-Spam-Flag header was ignored");
});

/* The web-design cold open, word for word as Living Canvas received it. */
test("somebody who has been looking through the website", () => {
  const v = coldPitch(
    {
      from: "merveilledeveloper@gmail.com",
      subject: "Opportunities for improvement on your shopify store",
      body:
        "Hi there,\nI came across your Shopify store today and spent a little time looking\nthrough it.\n" +
        "I noticed a couple of areas that may be affecting the customer journey and\nconversions, so I wanted to reach out " +
        "and ask if you're currently working\non improving the store.\nWould you like me to send them over?\nBest regards,\nMerveille",
    },
    { name: "Living Canvas Tattoo", sites: ["livingcanvastattoo.ink"] },
  );
  assert.ok(v.pitch, `let through with ${v.signs.join("; ") || "nothing"}`);
});

/*
 * And the two real customers that arrived in the same week, which must still
 * get through. A filter that eats one of these costs far more than the noise
 * it removes.
 */
test("the cleaning enquiries in the same inbox are not pitches", () => {
  for (const [subject, body] of [
    ["Possible Deep clean", "Hi, Whats the price of deep clean? Regards Giles"],
    ["Cleaning", "Could you give me a price for a weekly clean please"],
    ["", "I came across your website and wondered if you do small tattoos"],
  ] as const) {
    const v = coldPitch({ from: "giles@gmail.com", subject, body }, { name: "Neat & Tidy Solutions" });
    assert.equal(v.pitch, false, `"${subject || body}" was treated as a pitch: ${v.signs.join("; ")}`);
  }
});
