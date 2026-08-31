import { requireStudio } from "@/lib/studio";
import { AssistantForm } from "./AssistantForm";

export default async function AssistantPage() {
  const { studio } = await requireStudio();
  return <AssistantForm studio={studio} />;
}
