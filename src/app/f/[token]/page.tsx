import { createAdminClient } from "@/lib/supabase/admin";
import { cleanBlocks } from "@/lib/forms/blocks";
import { FillForm } from "./FillForm";

export const dynamic = "force-dynamic";

export const metadata = {
  robots: { index: false, follow: false },
};

/**
 * A form, opened by the customer from a text or an email.
 *
 * Nothing about it needs an account, and nothing on it says Second Pair more
 * than it has to: this is the business asking its own customer to fill
 * something in, so the business's name is the heading.
 */
export default async function FormPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = createAdminClient();

  const valid = /^[A-Za-z0-9_-]{20,64}$/.test(token);
  const { data: form } = valid
    ? await db
        .from("client_forms")
        .select("id, title, blocks, status, expires_at, signed_at, studios(name), contacts(name)")
        .eq("token", token)
        .maybeSingle()
    : { data: null };

  const business = (form?.studios as unknown as { name: string } | null)?.name ?? null;

  const gone = !form || form.status === "void";
  const expired = Boolean(form?.expires_at && hasPassed(form.expires_at as string) && form.status !== "signed");

  // The first time it is opened, so the business can see it was.
  if (form && form.status === "sent" && !expired) {
    await db
      .from("client_forms")
      .update({ status: "opened", opened_at: new Date().toISOString() })
      .eq("id", form.id)
      .eq("status", "sent");
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-xl">
        {business && <p className="label">{business}</p>}

        {gone ? (
          <Notice heading="This form is not available">
            It may have been withdrawn, or the link was copied wrongly. Ask for a new link.
          </Notice>
        ) : form.status === "signed" ? (
          <Notice heading="Already done — thank you">
            This form was filled in and signed. There is nothing more to do.
          </Notice>
        ) : expired ? (
          <Notice heading="This link has run out">
            Links last thirty days. Ask {business ?? "the business"} to send it again.
          </Notice>
        ) : (
          <>
            <h1 className="page-title mt-1">{form.title}</h1>
            <p className="hint mt-1">
              {(form.contacts as unknown as { name: string | null } | null)?.name
                ? `For ${(form.contacts as unknown as { name: string }).name}. `
                : ""}
              Takes a couple of minutes. Your answers go privately to {business ?? "the business"}.
            </p>
            <FillForm token={token} blocks={cleanBlocks(form.blocks)} business={business ?? "the business"} />
          </>
        )}
      </div>
    </main>
  );
}

function Notice({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div className="card mt-4 p-6">
      <h1 className="text-lg font-semibold">{heading}</h1>
      <p className="hint mt-2">{children}</p>
    </div>
  );
}

/** Out of the render, where reading the clock belongs. */
function hasPassed(iso: string): boolean {
  return Date.parse(iso) < Date.now();
}
