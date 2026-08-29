import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function createStudio(formData: FormData) {
  "use server";

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "studio";

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_studio", {
    studio_name: name,
    studio_slug: `${slug}-${Math.random().toString(36).slice(2, 6)}`,
  });

  if (error) throw new Error(error.message);
  redirect("/settings");
}

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="grid min-h-screen place-items-center px-6">
      <form action={createStudio} className="w-full max-w-sm space-y-4">
        <div>
          <div className="text-lg font-semibold tracking-tight">Name your studio</div>
          <p className="hint mt-1">You can change this later.</p>
        </div>
        <input
          name="name"
          required
          placeholder="Living Canvas Tattoo"
          className="input"
          autoFocus
        />
        <button type="submit" className="btn-primary w-full">
          Create studio
        </button>
      </form>
    </div>
  );
}
