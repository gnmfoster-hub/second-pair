import { requireOwner } from "@/lib/studio";
import { wordsFor } from "@/lib/words";
import { ReviewForm } from "./ReviewForm";

export const dynamic = "force-dynamic";

export const metadata = { title: "Review requests" };

/**
 * Review requests, on a page of their own.
 *
 * They were two fields on the business page, sandwiched between the privacy
 * notice and the trade's key dates — Giles could not find them, which is the
 * whole argument for this. Anything sent to a customer now sits together:
 * confirmations and reminders, review requests, and marketing.
 */
export default async function ReviewsSettingsPage() {
  const { studio } = await requireOwner();
  const words = wordsFor(studio);

  const url = (studio as unknown as { review_url?: string | null }).review_url ?? "";
  const on = (studio as unknown as { review_ask?: boolean | null }).review_ask === true;

  return (
    <div className="space-y-3">
      <p className="hint max-w-prose">
        A review is the cheapest marketing a small business has and the one nobody
        remembers to ask for. Set a link and the assistant asks the morning after, once,
        in the same conversation they started — so a reply comes back to you.
      </p>

      <ReviewForm url={url} on={on} words={words.customers} />
    </div>
  );
}
