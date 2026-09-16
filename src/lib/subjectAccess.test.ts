import { test } from "node:test";
import assert from "node:assert/strict";
import { subjectAccessDocument, type SubjectRecord } from "./subjectAccess.ts";

const LDN = "Europe/London";

const record = (over: Partial<SubjectRecord> = {}): SubjectRecord => ({
  business: "Living Canvas Tattoo",
  askedOn: new Date("2026-03-05T12:00:00Z"),
  contact: {
    name: "Sam Whitfield",
    phone: "07700 900123",
    email: "sam@example.com",
    instagram_handle: null,
    marketing_consent: false,
    alert: null,
    notes: null,
    created_at: "2026-01-04T10:00:00Z",
  },
  conversations: [],
  bookings: [],
  ...over,
});

test("it is a document a person can read, not a dump", () => {
  const doc = subjectAccessDocument(record(), LDN);
  assert.match(doc, /What Living Canvas Tattoo holds about you/);
  assert.match(doc, /Sam Whitfield/);
  assert.match(doc, /07700 900123/);
  // No braces, no field names, nothing anybody has to be shown how to read.
  assert.ok(!doc.includes("{"), "reads like JSON");
  assert.ok(!doc.includes("contact_id"), "leaks a column name");
});

test("nothing recorded is said plainly rather than left blank", () => {
  const doc = subjectAccessDocument(record(), LDN);
  assert.match(doc, /CONVERSATIONS[\s\S]*There are none recorded/);
  assert.match(doc, /APPOINTMENTS[\s\S]*There are none recorded/);
});

test("who said what is named, not left as a role", () => {
  const doc = subjectAccessDocument(
    record({
      conversations: [
        {
          channel: "web",
          created_at: "2026-02-01T18:00:00Z",
          messages: [
            { role: "client", content: "how much for a half sleeve?", created_at: "2026-02-01T18:00:00Z" },
            { role: "assistant", content: "Around £600.", created_at: "2026-02-01T18:00:30Z" },
            { role: "owner", content: "Happy to talk it through.", created_at: "2026-02-02T09:00:00Z" },
          ],
        },
      ],
    }),
    LDN,
  );
  assert.match(doc, /You · /);
  assert.match(doc, /Living Canvas Tattoo's assistant · /);
  assert.match(doc, /how much for a half sleeve\?/);
  assert.ok(!/\bclient\b/.test(doc), "shows a database role to a member of the public");
});

// ------------------------------------- the part it would be tempting to omit

test("private notes about somebody are included", () => {
  /*
   * A note a business wrote about a person is personal data about that person,
   * and the right of access covers it whether or not it is flattering.
   * Leaving it out because it is awkward is the reason the right exists.
   */
  const doc = subjectAccessDocument(
    record({ contact: { ...record().contact, notes: "Cancelled twice. Take a deposit." } }),
    LDN,
  );
  assert.match(doc, /Cancelled twice\. Take a deposit\./);
});

test("a cancelled appointment still says it happened", () => {
  const doc = subjectAccessDocument(
    record({
      bookings: [
        {
          starts_at: "2026-02-14T10:00:00Z",
          ends_at: "2026-02-14T13:00:00Z",
          type: "session",
          with: "Dave",
          cancelled_at: "2026-02-10T09:00:00Z",
          notes: null,
        },
      ],
    }),
    LDN,
  );
  assert.match(doc, /with Dave/);
  assert.match(doc, /\(cancelled\)/);
});

test("times are shown where the business is, not where the server is", () => {
  const doc = subjectAccessDocument(
    record({
      bookings: [
        { starts_at: "2026-06-14T09:00:00Z", ends_at: "2026-06-14T10:00:00Z", type: null, with: null, cancelled_at: null, notes: null },
      ],
    }),
    LDN,
  );
  // June is BST, so nine UTC is ten in London.
  assert.match(doc, /10:00/);
});

test("a missing detail is left out rather than shown as empty", () => {
  const doc = subjectAccessDocument(
    record({ contact: { ...record().contact, email: null, phone: null } }),
    LDN,
  );
  assert.ok(!/Email\s*$/m.test(doc), "printed an empty field");
  assert.ok(!doc.includes("null"), "showed a null to a member of the public");
});

/*
 * The standing flag was the one part of somebody's record left out of their
 * own copy of it — and it is shown to the business every time that person gets
 * in touch, which makes it among the most consequential things written about
 * them anywhere here.
 */
test("the note shown on every enquiry is disclosed", () => {
  const doc = subjectAccessDocument(
    record({
      contact: { ...record().contact, alert: "Difficult about prices" },
    }),
    LDN,
  );
  assert.match(doc, /whenever you contact them/);
  assert.match(doc, /Difficult about prices/);
});

test("no flag, no section about one", () => {
  const doc = subjectAccessDocument(record(), LDN);
  assert.ok(!doc.includes("whenever you contact them"), doc);
});

/*
 * What the business wrote on the appointment itself is about the person as
 * much as the time is — and in the case that prompted this, it was a note
 * about what they are allergic to.
 */
test("a note on an appointment is disclosed with it", () => {
  const doc = subjectAccessDocument(
    record({
      bookings: [
        {
          starts_at: "2026-06-14T09:00:00Z",
          ends_at: "2026-06-14T10:00:00Z",
          type: null,
          with: null,
          cancelled_at: null,
          notes: "Allergic to green ink",
        },
      ],
    }),
    LDN,
  );
  assert.match(doc, /Allergic to green ink/);
});

/*
 * The document used to say "this is everything held about you by this
 * business" while leaving out the three most personal things in the record.
 * A confidently incomplete answer to a legal request is worse than a slow one.
 */
test("forms, what they asked about and what they paid are all in it", () => {
  const doc = subjectAccessDocument(
    {
      business: "Living Canvas Tattoo",
      askedOn: new Date("2026-09-17T09:00:00Z"),
      contact: {
        name: "Jo Marsh",
        phone: "07700 900321",
        email: null,
        instagram_handle: null,
        marketing_consent: false,
        notes: null,
        alert: null,
        created_at: "2026-08-01T10:00:00Z",
      },
      conversations: [],
      bookings: [],
      forms: [
        {
          name: "Consent and medical",
          status: "signed",
          signed_at: "2026-09-01T10:00:00Z",
          signed: true,
          answers: [
            { question: "Are you taking blood thinners?", answer: "no" },
            { question: "Any allergies?", answer: "plasters" },
          ],
        },
      ],
      enquiries: [
        {
          created_at: "2026-08-01T10:00:00Z",
          description: "Small heron on the forearm",
          placement: "forearm",
          address: null,
          photos: 2,
        },
      ],
      payments: [{ paid_at: "2026-09-01T11:00:00Z", amount: "£50.00", kind: "deposit", status: "paid" }],
    },
    "Europe/London",
  );

  assert.match(doc, /FORMS YOU FILLED IN/);
  assert.match(doc, /Are you taking blood thinners\?/);
  assert.match(doc, /plasters/, "their own answers, not just that a form exists");
  assert.match(doc, /signature was recorded/);
  assert.match(doc, /WHAT YOU ASKED ABOUT/);
  assert.match(doc, /Small heron on the forearm/);
  assert.match(doc, /2 photos/);
  assert.match(doc, /WHAT YOU PAID/);
  assert.match(doc, /£50\.00 deposit/);
});

test("somebody with none of those gets no empty headings", () => {
  const doc = subjectAccessDocument(
    {
      business: "Living Canvas Tattoo",
      askedOn: new Date("2026-09-17T09:00:00Z"),
      contact: {
        name: "Jo Marsh",
        phone: null,
        email: null,
        instagram_handle: null,
        marketing_consent: false,
        notes: null,
        alert: null,
        created_at: null,
      },
      conversations: [],
      bookings: [],
    },
    "Europe/London",
  );

  assert.doesNotMatch(doc, /FORMS YOU FILLED IN/);
  assert.doesNotMatch(doc, /WHAT YOU PAID/);
});
