import { requireOwner } from "@/lib/studio";
import { StudioForm } from "./StudioForm";

export default async function StudioSettingsPage() {
  // The business itself — the owner's, and the page says so
  // rather than only the tab: hiding a link is not a permission.
  const { studio } = await requireOwner();
  return <StudioForm
        studio={studio}
        /*
         * Formatted here, in the business's own zone, because a date turned
         * into words in the browser is a date the server rendered differently
         * — which React reports as a hydration error and the reader sees as
         * the page flickering.
         */
        lastSaved={
          studio.updated_at
            ? new Intl.DateTimeFormat("en-GB", {
                timeZone: studio.timezone,
                weekday: "short",
                day: "numeric",
                month: "short",
                hour: "numeric",
                minute: "2-digit",
              }).format(new Date(studio.updated_at))
            : null
        }
      />;
}
