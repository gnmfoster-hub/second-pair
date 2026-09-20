import { createAdminClient } from "@/lib/supabase/admin";
import { marketingChoiceOf } from "@/lib/consent";
import { Preferences } from "./Preferences";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your preferences" };

/**
 * What a customer hears from a business, set by the customer.
 *
 * Consent has to be as easy to withdraw as it was to give, and until now the
 * only way out was to ring up and ask somebody to untick a box. This is the
 * other half: a long random link, no login, two switches and a sentence
 * saying what it does not cover.
 *
 * Appointment reminders and confirmations are deliberately not here. They are
 * not marketing — they are about something this person asked for — and a page
 * that offered to switch them off would have people turning off the reminder
 * that stops them missing an appointment.
 */
export default async function PreferencesPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const db = createAdminClient();

  const { data: contact } = /^[A-Za-z0-9_-]{16,128}$/.test(token)
    ? await db
        .from("contacts")
        .select("id, name, email, phone, marketing_consent, marketing_email, marketing_sms, studios(name)")
        .eq("marketing_token", token)
        .maybeSingle()
    : { data: null };

  const business = (contact?.studios as unknown as { name: string } | null)?.name ?? null;

  if (!contact || !business) {
    return (
      <main className="grid min-h-screen place-items-center px-6 text-center">
        <div className="max-w-sm">
          <h1 className="text-lg font-semibold tracking-tight">That link does not work</h1>
          <p className="hint mt-2">
            It may have been copied wrongly, or it is no longer in use. Ask the business to
            send it again, or tell them what you would like and they can set it for you.
          </p>
        </div>
      </main>
    );
  }

  const firstName = (contact.name as string | null)?.trim().split(" ")[0] ?? null;

  return (
    <main className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-md">
        <p className="label">{business}</p>
        <h1 className="page-title mt-1">
          {firstName ? `${firstName}, what would you like to hear about?` : "What would you like to hear about?"}
        </h1>

        <p className="hint mt-2">
          Offers, news and anything else that is not about an appointment. Change it whenever
          you like. This page is yours and the link keeps working.
        </p>

        <Preferences
          token={token}
          business={business}
          has={{ email: Boolean(contact.email), sms: Boolean(contact.phone) }}
          choice={marketingChoiceOf(contact)}
        />

        <p className="hint mt-6 border-t border-border pt-4 text-sm">
          This does not affect appointment reminders, confirmations or a reply to something
          you have asked {business}. Those are about your own appointments, and you will keep
          getting them.
        </p>
      </div>
    </main>
  );
}
