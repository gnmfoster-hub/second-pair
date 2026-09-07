import { getFaqs , requireOwner } from "@/lib/studio";
import { FaqEditor } from "./FaqEditor";
import { SeedFaqs } from "./SeedFaqs";
import { verticalPack } from "@/lib/verticals";
import { stillWorthAsking } from "@/lib/askedAlready";

export default async function FaqsPage() {
  // What the assistant answers from — the owner's, and the page says so
  // rather than only the tab: hiding a link is not a permission.
  const { studio } = await requireOwner();
  const faqs = await getFaqs(studio.id);

  /*
   * What this trade is asked that this business has no answer for.
   *
   * The page used to name six topics in prose — the same six whatever the
   * trade — which said what to think about and left the owner to type. These
   * are the trade's own questions, and only the ones missing.
   */
  const missing = stillWorthAsking(
    verticalPack(studio.vertical).faqs.map((f) => f.question),
    faqs.map((f) => f.question),
  );

  return (
    <div className="space-y-3">
      <p className="hint">
        Anything the assistant is allowed to answer on its own. Anything not here, and
        anything medical, gets handed to you instead.
      </p>

      <SeedFaqs missing={missing} />

      {faqs.map((faq, i) => (
        <FaqEditor key={faq.id} faq={faq} index={i} />
      ))}

      <FaqEditor index={faqs.length} />
    </div>
  );
}
