import { requireStudio, getFaqs } from "@/lib/studio";
import { FaqEditor } from "./FaqEditor";

const SUGGESTED = [
  "Aftercare",
  "Parking",
  "Walk-ins",
  "Age policy",
  "Deposits and rescheduling",
  "Touch-ups",
];

export default async function FaqsPage() {
  const { studio } = await requireStudio();
  const faqs = await getFaqs(studio.id);

  return (
    <div className="space-y-3">
      <p className="hint">
        Anything the assistant is allowed to answer on its own. Worth covering:{" "}
        {SUGGESTED.join(", ").toLowerCase()}. Anything not here, and anything medical, gets
        handed to you.
      </p>

      {faqs.map((faq, i) => (
        <FaqEditor key={faq.id} faq={faq} index={i} />
      ))}

      <FaqEditor index={faqs.length} />
    </div>
  );
}
