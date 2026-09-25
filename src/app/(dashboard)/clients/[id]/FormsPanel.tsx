import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { flagged, cleanBlocks } from "@/lib/forms/blocks";
import { formLine, wentNowhere } from "@/lib/forms/howItWent";
import { SendForm } from "./SendForm";
import { PaperForm } from "./PaperForm";
import { SendQuote } from "./SendQuote";

/**
 * Forms on a customer's record: what has been sent, what is signed, and a way
 * to send another or keep a paper one.
 *
 * Read on its own, so a business that has not had the forms update yet sees a
 * sentence here and a working record everywhere else.
 */
export async function FormsPanel({
  studioId,
  contactId,
  firstName,
  channels,
  mayMessage,
  team = [],
  me = null,
}: {
  studioId: string;
  team?: { id: string; name: string }[];
  me?: string | null;
  contactId: string;
  firstName: string;
  /** The ways this customer can be reached right now. */
  channels: { channel: string; label: string }[];
  mayMessage: boolean;
}) {
  const supabase = await createClient();

  const [{ data: forms, error }, { data: templates }] = await Promise.all([
    supabase
      .from("client_forms")
      .select("id, title, status, sent_at, opened_at, signed_at, created_at, blocks, answers, file_type, sent_via")
      .eq("contact_id", contactId)
      .eq("studio_id", studioId)
      .neq("status", "void")
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("form_templates")
      .select("id, name")
      .eq("studio_id", studioId)
      .eq("active", true)
      .order("sort_order")
      .order("created_at"),
  ]);

  if (error) {
    return (
      <section className="card p-5">
        <h2 className="section-title text-sm">Forms</h2>
        <p className="hint mt-2 text-sm">
          Consent forms, questionnaires and paper forms will live here once the forms update
          has been applied.
        </p>
      </section>
    );
  }

  return (
    <section className="card p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="section-title text-sm">Forms</h2>
        <Link href="/settings/forms" className="text-xs text-accent hover:underline">
          Your forms
        </Link>
      </div>

      {forms && forms.length > 0 ? (
        <ul className="mt-3 divide-y divide-border">
          {forms.map((f) => {
            const warn = f.status === "signed" && flagged(cleanBlocks(f.blocks), f.answers as Record<string, string>).length > 0;
            return (
              <li key={f.id}>
                <Link
                  href={`/clients/${contactId}/forms/${f.id}`}
                  className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-accent"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{f.title}</span>
                    <span className="hint block text-xs">{when(f)}</span>
                  </span>
                  <span className="flex shrink-0 gap-1">
                    {warn && <span className="pill bg-warn/10 text-[0.65rem] text-warn">Read answers</span>}
                    <Status
                      status={f.status as string}
                      sentVia={(f as { sent_via?: string | null }).sent_via ?? null}
                      quote={String(f.title).startsWith("Quote")}
                    />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="hint mt-2 text-sm">Nothing yet.</p>
      )}

      <div className="mt-4 space-y-3 border-t border-border pt-4">
        <SendForm
          contactId={contactId}
          firstName={firstName}
          templates={(templates ?? []).map((t) => ({ id: t.id as string, name: t.name as string }))}
          channels={channels}
          mayMessage={mayMessage}
        />
        <SendQuote contactId={contactId} firstName={firstName} channels={channels} mayMessage={mayMessage} team={team} me={me} />
        <PaperForm contactId={contactId} />
      </div>
    </section>
  );
}

function Status({
  status,
  sentVia,
  quote = false,
}: {
  status: string;
  sentVia: string | null;
  quote?: boolean;
}) {
  /*
   * A link nobody has handed over is not "Sent".
   *
   * The row's status is "sent" either way — it is the same row whether a text
   * went out or a URL was put on the screen for somebody to pass on. The
   * second kind wore a grey "Sent" badge, which reads as done and waiting on
   * the customer. It is the opposite: it is waiting on whoever made it.
   *
   * So it is drawn in the warning colour rather than the quiet one, because it
   * is a job. Nothing live is in this state today — every form that went out
   * as a link was opened or signed, so somebody did pass it on — but a form
   * made for a walk-in with no number and no address lands here every time.
   */
  if (status === "sent" && wentNowhere(sentVia)) {
    return <span className="pill bg-warn/10 text-[0.65rem] text-warn">Not sent</span>;
  }

  const look: Record<string, [string, string]> = {
    sent: ["Sent", "bg-surface-2 text-muted"],
    opened: ["Opened", "bg-accent/10 text-accent"],
    signed: [quote ? "Accepted" : "Signed", "bg-ok/10 text-ok"],
    paper: ["Paper", "bg-ok/10 text-ok"],
  };
  const [label, cls] = look[status] ?? [status, "bg-surface-2 text-muted"];
  return <span className={`pill text-[0.65rem] ${cls}`}>{label}</span>;
}

/** See lib/forms/howItWent — the wording lives there so it can be tested. */
function when(f: {
  status: string;
  sent_at: string | null;
  opened_at: string | null;
  signed_at: string | null;
  created_at: string;
  sent_via?: string | null;
}) {
  return formLine({
    status: f.status,
    sentVia: f.sent_via ?? null,
    sentAt: f.sent_at,
    openedAt: f.opened_at,
    signedAt: f.signed_at,
    createdAt: f.created_at,
  });
}
