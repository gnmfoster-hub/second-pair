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
