import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStudio, getArtists } from "@/lib/studio";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { answerText, cleanBlocks, flagged, quoteTotal, isTypedSignature } from "@/lib/forms/blocks";
import { QuoteTable } from "@/app/f/[token]/FillForm";
import { AskForPayment } from "@/components/AskForPayment";
import { payableFor } from "@/lib/payments/whoTakes";
import { formatPence } from "@/lib/money";
import { PrintButton } from "./PrintButton";
import { Withdraw } from "./Withdraw";

export const dynamic = "force-dynamic";

/**
 * One form, as it was agreed.
 *
 * The questions come from the copy kept with the form, never from the
 * template, so what is shown is what they saw. Printable, because a signed
 * consent is sometimes wanted on paper — by an insurer, an inspector, or the
 * customer themselves.
 */
export default async function ClientFormPage({
  params,
}: {
  params: Promise<{ id: string; formId: string }>;
}) {
  const { id, formId } = await params;
  const { studio } = await requireStudio();
  const supabase = await createClient();

  const { data: form } = await supabase
    .from("client_forms")
    .select("*, contacts(name)")
    .eq("id", formId)
    .eq("contact_id", id)
    .eq("studio_id", studio.id)
    .maybeSingle();

  if (!form) notFound();

  const blocks = cleanBlocks(form.blocks);
  const total = quoteTotal(blocks);
  const isQuote = blocks.some((b) => b.type === "lines");
  const payable = isQuote && form.status === "signed" ? payableFor(studio, (await getArtists(studio.id)).filter((a) => a.active)) : [];
  const answers = (form.answers ?? {}) as Record<string, string>;
  const warnings = flagged(blocks, answers);
  const who = (form.contacts as { name: string | null } | null)?.name ?? "Customer";

  // A paper form's file, readable for an hour.
  let fileUrl: string | null = null;
  if (form.file_path) {
    const { data } = await createAdminClient()
      .storage.from("forms")
      .createSignedUrl(form.file_path as string, 3600);
    fileUrl = data?.signedUrl ?? null;
  }

  const stamp = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString("en-GB", {
          timeZone: studio.timezone ?? "Europe/London",
          day: "numeric",
          month: "long",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : "—";

  return (
    <div className="mx-auto max-w-2xl space-y-5 print:max-w-none">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/clients/${id}`} className="text-sm text-accent hover:underline">
          ← {who}
        </Link>
        <div className="flex gap-2">
          <PrintButton />
          {form.status !== "signed" && form.status !== "paper" && form.status !== "void" && <Withdraw id={form.id as string} />}
        </div>
      </div>

      <header>
        <p className="label">{studio.name}</p>
        <h1 className="page-title mt-1">{form.title as string}</h1>
        <p className="hint mt-1">
          {who} ·{" "}
          {form.status === "signed"
            ? `Signed ${stamp(form.signed_at as string)}`
            : form.status === "paper"
              ? `Paper form kept ${stamp(form.signed_at as string)}`
              : form.status === "void"
                ? "Withdrawn"
                : form.status === "opened"
                  ? `Opened ${stamp(form.opened_at as string)} — not signed yet`
                  : `Sent ${stamp(form.sent_at as string)} — not opened yet`}
        </p>
      </header>

      {warnings.length > 0 && (
        <div className="rounded-xl border border-warn/40 bg-warn/10 p-4 text-sm">
          <div className="font-medium text-warn">Answered yes, read before starting</div>
          <ul className="mt-2 space-y-1">
            {warnings.map((b) => (
              <li key={b.id}>
                <span className="font-medium">{b.label}</span>
                <span className="block text-foreground/80">{answerText(b, answers)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {form.status === "paper" ? (
        <section className="card p-5">
          {fileUrl ? (
            (form.file_type as string)?.startsWith("image/") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fileUrl} alt={`${form.title} for ${who}`} className="w-full rounded-lg border border-border" />
            ) : (
              <a href={fileUrl} target="_blank" rel="noreferrer" className="btn border border-border">
                Open the PDF ({form.file_name as string})
              </a>
            )
          ) : (
            <p className="hint">The file could not be opened just now. Refresh to try again.</p>
          )}
        </section>
      ) : (
        <section className="card divide-y divide-border">
          {blocks.map((b) =>
            b.type === "lines" ? (
              <div key={b.id} className="px-5 py-4">
                <QuoteTable items={b.items ?? []} by={b.by?.name} />
              </div>
            ) : b.type === "text" ? (
              <p key={b.id} className="whitespace-pre-line px-5 py-4 text-sm text-foreground/80">
                {b.label}
              </p>
            ) : b.type === "signature" ? (
              <div key={b.id} className="px-5 py-4">
                <div className="label">Signature</div>
                {isTypedSignature(form.signature as string | null) ? (
                  /*
                   * Signed by typing rather than drawing.
                   *
                   * Shown as what it is, never dressed up as a drawing: the
                   * business should be able to see at a glance which of the
                   * two it was, because that is the sort of detail that
                   * matters if a form is ever questioned.
                   */
                  <div className="mt-2 rounded border border-border bg-white px-4 py-3">
                    <div className="font-serif text-xl italic text-[#1b1b1b]">
                      {(form.signature as string).slice("typed:".length)}
                    </div>
                    <div className="mt-1 text-xs text-muted">Typed as their signature</div>
                  </div>
                ) : form.signature ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={form.signature as string}
                    alt={`Signature of ${form.signer_name ?? who}`}
                    className="mt-2 h-28 rounded border border-border bg-white"
                  />
                ) : (
                  <p className="hint mt-1 text-sm">Not signed yet.</p>
                )}
                {form.signer_name && <p className="mt-2 text-sm">{form.signer_name as string}</p>}
              </div>
            ) : (
              <div key={b.id} className="grid gap-1 px-5 py-3 sm:grid-cols-[1fr_1fr] sm:gap-4">
                <div className="text-sm text-muted">{b.label}</div>
                <div className="whitespace-pre-line text-sm">{answerText(b, answers)}</div>
              </div>
            ),
          )}
        </section>
      )}

      {/*
        * An accepted quote is the moment to take a deposit or the whole thing.
        */}
      {isQuote && form.status === "signed" && (
        <section className="card p-5 print:hidden">
          <h2 className="section-title">Accepted — {formatPence(total)}</h2>
          <p className="hint mt-1 text-sm">Take a deposit or the whole amount by link, or book the work in the diary.</p>
          <div className="mt-3">
            <AskForPayment
              contactId={id}
              amountPence={total}
              description={form.title as string}
              connected={payable.length > 0}
              people={payable.map((a) => ({ id: a.id, name: a.name }))}
              artistId={blocks.find((b) => b.type === "lines")?.by?.id ?? null}
              label="Send a payment link for this quote"
            />
          </div>
        </section>
      )}

      {form.status === "signed" && (
        <p className="hint text-xs">
          Submitted {stamp(form.signed_at as string)}
          {form.signer_ip ? ` from ${form.signer_ip as string}` : ""}. The questions shown are the ones sent,
          kept with the form, so later changes to the form do not alter this record.
        </p>
      )}
    </div>
  );
}
