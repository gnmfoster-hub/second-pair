import { requireStudio } from "@/lib/studio";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  answerText,
  cleanBlocks,
  isTypedSignature,
  expandRepeats,
  countsFrom,
  type Answers,
} from "@/lib/forms/blocks";
import { signedRecord } from "@/lib/forms/whatTheySignedOn";

/**
 * A completed form, as a file to keep.
 *
 * Giles, 5 October: "there would also be a download button in the client record
 * in case Amber needs to download the form later."
 *
 * There was a print button, which is nine lines of window.print() and relies on
 * whoever needs the form being sat at the dashboard with a printer dialog open.
 * That is not what somebody wants when an insurer asks for the consent a client
 * signed in March, or when a client asks for their own copy a year later.
 *
 * ── Why HTML and not a PDF ─────────────────────────────────────────────────
 *
 * There is no PDF library in this codebase and adding one to render a page of
 * questions and answers would be the heaviest dependency in the project for the
 * least interesting job. A self-contained HTML file opens on anything, has no
 * fonts or images to go missing because everything is inline, keeps the drawn
 * signature as part of the file, and prints to a PDF from any browser in two
 * presses. It is also still readable in ten years, which a half-supported PDF
 * generator is not.
 *
 * Everything about the form is frozen into the file: the questions as they were
 * asked, the answers, the signature, and when and on what it was signed.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; formId: string }> },
) {
  const { id, formId } = await params;
  const { studio } = await requireStudio();

  const db = createAdminClient();
  const { data } = await db
    .from("client_forms")
    .select(
      "id, studio_id, contact_id, title, blocks, answers, status, signed_at, signer_name, signature, signer_ip, signer_agent, contacts(name), studios(name)",
    )
    .eq("id", formId)
    .maybeSingle();

  const form = data as
    | {
        studio_id: string;
        contact_id: string;
        title: string;
        blocks: unknown;
        answers: Answers | null;
        status: string;
        signed_at: string | null;
        signer_name: string | null;
        signature: string | null;
        signer_ip: string | null;
        signer_agent: string | null;
        contacts: { name: string | null } | null;
        studios: { name: string | null } | null;
      }
    | null;

  /*
   * Theirs, and this client's. Checked against the signed-in business rather
   * than trusted from the address, because a form id in a URL is otherwise a
   * way to read another business's consent forms.
   */
  if (!form || form.studio_id !== studio.id || form.contact_id !== id) {
    return new Response("Not found", { status: 404 });
  }

  /* Opened out from the counts kept with the answers, so a downloaded copy
     shows every dog rather than the first one. */
  const blocks = expandRepeats(cleanBlocks(form.blocks), countsFrom(form.answers));
  const answers = form.answers ?? {};
  const who = form.contacts?.name ?? "Client";
  const business = form.studios?.name ?? "";

  const filename = `${form.title} - ${who}${form.signed_at ? ` - ${form.signed_at.slice(0, 10)}` : ""}`
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 120);

  return new Response(asDocument({ form, blocks, answers, who, business }), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}.html"`,
      /* Somebody else's customer's medical details. Never a shared cache. */
      "cache-control": "no-store, private",
    },
  });
}

const safe = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function asDocument({
  form,
  blocks,
  answers,
  who,
  business,
}: {
  form: {
    title: string;
    status: string;
    signed_at: string | null;
    signer_name: string | null;
    signature: string | null;
    signer_ip: string | null;
    signer_agent: string | null;
  };
  blocks: ReturnType<typeof cleanBlocks>;
  answers: Answers;
  who: string;
  business: string;
}): string {
  const when = form.signed_at
    ? new Date(form.signed_at).toLocaleString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
    : null;

  const rows = blocks
    .filter((b) => b.type !== "signature")
    .map((b) => {
      if (b.type === "text") {
        return `<p class="said">${safe(b.label)}</p>`;
      }
      return `<div class="q">
        <div class="label">${safe(b.label)}</div>
        <div class="a">${safe(answerText(b, answers)) || "<span class='none'>Not answered</span>"}</div>
      </div>`;
    })
    .join("\n");

  /*
   * A typed signature is shown as typed and never dressed up as a drawing. The
   * record page has said so since it was built and a downloaded copy that
   * quietly implied otherwise would be worse, because it is the copy that gets
   * forwarded to somebody who was not there.
   */
  const signature = !form.signature
    ? ""
    : isTypedSignature(form.signature)
      ? `<div class="sig"><div class="typed">${safe(form.signature.replace(/^typed:/, ""))}</div>
         <div class="note">Typed as their signature</div></div>`
      : `<div class="sig"><img alt="Signature" src="${form.signature}"></div>`;

  return `<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safe(form.title)} - ${safe(who)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px 20px 64px; background: #f7f4ec; color: #16150f;
         font: 15px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; }
  .page { max-width: 44rem; margin: 0 auto; }
  .top { border-bottom: 2px solid #16150f; padding-bottom: 14px; margin-bottom: 22px; }
  .biz { font-size: 12px; letter-spacing: .12em; text-transform: uppercase; color: #6b675c; }
  h1 { font-size: 1.6rem; margin: 6px 0 0; line-height: 1.2; }
  .for { color: #6b675c; margin: 6px 0 0; }
  .said { background: #fffdf4; border: 1px solid #e6e2d8; border-radius: 6px;
          padding: 12px 14px; margin: 0 0 12px; white-space: pre-line; }
  .q { border-bottom: 1px solid #e6e2d8; padding: 11px 0; }
  .label { font-weight: 600; }
  .a { margin-top: 3px; white-space: pre-line; }
  .none { color: #908c82; font-style: italic; }
  .sig { margin-top: 10px; background: #fff; border: 1px solid #e6e2d8;
         border-radius: 6px; padding: 14px; display: inline-block; }
  .sig img { height: 90px; display: block; }
  .typed { font-family: Georgia, "Times New Roman", serif; font-style: italic; font-size: 1.5rem; }
  .note { font-size: 12px; color: #6b675c; margin-top: 4px; }
  footer { margin-top: 26px; padding-top: 14px; border-top: 1px solid #e6e2d8;
           font-size: 13px; color: #6b675c; }
  /* So the two presses to a PDF give a clean document. */
  @media print {
    body { background: #fff; padding: 0; font-size: 12pt; }
    .said, .sig { background: #fff; }
    .q { break-inside: avoid; }
  }
</style></head>
<body><div class="page">
  <div class="top">
    ${business ? `<div class="biz">${safe(business)}</div>` : ""}
    <h1>${safe(form.title)}</h1>
    <p class="for">Completed by ${safe(who)}${when ? ` on ${safe(when)}` : ""}.</p>
  </div>

  ${rows}

  ${
    signature
      ? `<div class="q"><div class="label">Signature</div>${signature}
         ${form.signer_name ? `<div class="note">Signed ${safe(form.signer_name)}</div>` : ""}</div>`
      : ""
  }

  <footer>
    ${safe(when ? signedRecord({ when, ip: form.signer_ip, agent: form.signer_agent }) : "Not signed.")}
    <br>Downloaded from Second Pair on ${safe(new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }))}.
  </footer>
</div></body></html>`;
}
