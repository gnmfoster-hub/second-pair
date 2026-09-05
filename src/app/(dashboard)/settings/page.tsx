import { requireOwner } from "@/lib/studio";
import { StudioForm } from "./StudioForm";

export default async function StudioSettingsPage() {
  // The business itself — the owner's, and the page says so
  // rather than only the tab: hiding a link is not a permission.
  const { studio } = await requireOwner();
  return <StudioForm studio={studio} />;
}
