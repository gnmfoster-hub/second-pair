import { requireOwner } from "@/lib/studio";
import { AssistantForm } from "./AssistantForm";

export default async function AssistantPage() {
  // How the assistant behaves — the owner's, and the page says so
  // rather than only the tab: hiding a link is not a permission.
  const { studio } = await requireOwner();
  return <AssistantForm studio={studio} />;
}
