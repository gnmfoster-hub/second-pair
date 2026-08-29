import { requireStudio } from "@/lib/studio";
import { StudioForm } from "./StudioForm";

export default async function StudioSettingsPage() {
  const { studio } = await requireStudio();
  return <StudioForm studio={studio} />;
}
