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
        { starts_at: "2026-06-14T09:00:00Z", ends_at: "2026-06-14T10:00:00Z", type: null, with: null, cancelled_at: null },
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
