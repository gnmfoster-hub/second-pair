import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { SignIt } from "./SignIt";

export const dynamic = "force-dynamic";

/*
 * Never indexed. The link is the only key there is, so a search engine holding
 * one would be handing out a document with somebody's terms in it.
 */
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * The agreement a business signs when Giles takes them on.
 *
 * Giles, 27 Sep: "think about a way of sending in a contract for businesses I
 * take on that they can be sent and sign when I add them."
 *
 * Built alongside the consent form on purpose, because it is the same job with
 * the parties swapped: a private link, a document nobody can alter after it is
 * sent, a tick, a signature, and a record of who signed and when. The consent
 * form is a business's defence against a customer; this is a business's copy of
 * what it agreed with us, and ours of what they agreed. Both matter only at the
 * moment somebody disputes them, which is the moment nobody is going to be
 * available to explain the software.
 *
 * ── The document is the frozen text, and only that ──────────────────────────
 *
 * The row carries both the wording as sent (`terms_text`) and the figures as
 * data (`setup_fee_pence`, `recurring_pence`, and so on). This page renders the
 * wording and nothing else.
 *
 * It is tempting to put a tidy summary of the money at the top, read from the
 * columns. That is exactly the thing not to do: two statements of the same
 * figure, and if anybody ever edits a column the page shows one price while the
 * signed text says another — and the one somebody signed is the text. So the
 * columns are for the back office to search and total, and the document a
 * person reads and signs is one string, written once, at the moment it was sent.
 *
 * ── Why a missing table reads as a bad link ─────────────────────────────────
 *
 * `agreements` arrives with a migration that has not been run. Until it has,
 * there are no agreements at all — so no token can be valid, and "this is not
 * available" is not a lie, it is the truth arrived at from the other direction.
 * Which is the same thing /b does for the same reason.
 */
export default async function AgreementPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const db = createAdminClient();

  /*
   * Shape checked before asking the database, so a scanner walking the address
   * costs one regular expression rather than a query. Twenty-four random bytes
   * as base64url is thirty-two characters; the range allows for it changing.
   */
  const valid = /^[A-Za-z0-9_-]{20,64}$/.test(token);

  /*
   * select("*") rather than a list of columns.
   *
   * Naming a column PostgREST has not heard of makes it refuse the whole
   * statement, so a page that names one cannot ship before its migration. With
   * a star, a table that does not exist yet simply matches nothing, and the page
   * says what it says for a wrong link.
   */
  const { data: agreement } = valid
    ? await db
        .from("agreements")
        .select("*, studios(name)")
        .eq("token", token)
        .maybeSingle()
    : { data: null };

  const business =
    (agreement?.studios as unknown as { name: string } | null)?.name ?? null;

  const gone = !agreement || Boolean(agreement.void_at);
  const signed = Boolean(agreement?.signed_at);

  return (
    <main className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-2xl">
        {business && <p className="label">{business}</p>}
        <h1 className="page-title mt-1">
          {gone || signed ? "Your agreement" : "Your agreement with Second Pair"}
        </h1>

        {gone ? (
          /*
           * A withdrawn agreement and a mistyped link say the same thing.
           *
           * Deliberately, as on the consent form: telling somebody holding a
           * wrong link that the document exists but has been pulled is more
           * than they are entitled to know, and the two are indistinguishable
           * from where they are standing anyway.
           */
          <Notice heading="This agreement is not available">
            It may have been withdrawn, or replaced by a newer one, or the link was copied
            wrongly. Ask us and we will send it again.
          </Notice>
        ) : signed ? (
          <Notice heading="Already signed, thank you">
            This was signed on {onlyTheDay(agreement.signed_at as string)}
            {agreement.signer_name ? ` by ${agreement.signer_name as string}` : ""}. Keep this
            link: it is your copy, and it will not change.
          </Notice>
        ) : (
          <SignIt
            token={token}
            terms={(agreement.terms_text as string) ?? ""}
            version={(agreement.terms_version as string) ?? ""}
            sentTo={(agreement.sent_to as string | null) ?? null}
          />
        )}
      </div>
    </main>
  );
}

function Notice({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div className="card mt-4 p-6">
      <h2 className="text-lg font-semibold">{heading}</h2>
      <p className="hint mt-2">{children}</p>
    </div>
  );
}

/**
 * The day, without the time.
 *
 * A signature is dated rather than timed in every other context somebody has
 * met one, and "signed on 29 September 2026" is what they are checking against
 * their own memory. The exact instant is on the row for anybody who ever needs
 * it, which is a solicitor rather than the person reading this page.
 */
function onlyTheDay(iso: string): string {
  const at = new Date(iso);
  if (!Number.isFinite(at.getTime())) return "the date recorded on it";
  return at.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/London",
  });
}
