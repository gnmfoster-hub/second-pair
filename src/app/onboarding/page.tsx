import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { seedFromPack } from "@/lib/seed";
import { VERTICAL_LIST } from "@/lib/verticals";

/**
 * Signup. Two questions, because the trade decides everything that follows —
 * the wording, the questions the assistant asks, the services, the reminders.
 * Getting it wrong here means a salon starts life with tattoo price bands.
 */
async function createStudio(formData: FormData) {
  "use server";

  const name = String(formData.get("name") ?? "").trim();
  const vertical = String(formData.get("vertical") ?? "general").trim();
  if (!name) return;

  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "business";

  const supabase = await createClient();
  const { data: studioId, error } = await supabase.rpc("create_studio", {
    studio_name: name,
    studio_slug: `${slug}-${Math.random().toString(36).slice(2, 6)}`,
  });

  if (error) throw new Error(error.message);

  // Everything the trade implies, all editable afterwards.
  if (studioId) await seedFromPack(supabase, studioId as string, vertical);

  redirect("/settings");
}

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="grid min-h-screen place-items-center px-6 py-12">
      <form action={createStudio} className="w-full max-w-lg space-y-8">
        <div>
          <div className="text-lg font-semibold tracking-tight">Set up your business</div>
          <p className="hint mt-1">Both of these can be changed later.</p>
        </div>

        <div>
          <label className="label">What is it called</label>
          <input
            name="name"
            required
            placeholder="Living Canvas Tattoo"
            className="input"
            autoFocus
          />
        </div>

        <fieldset>
          <legend className="label">What sort of business</legend>
          <p className="hint mb-3">
            This sets the wording, the questions the assistant asks, your starting services
            and what reminders say. All of it is yours to edit afterwards.
          </p>

          <div className="space-y-2">
            {VERTICAL_LIST.map((pack, i) => (
              <label
                key={pack.id}
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-4 hover:border-muted/50 has-[:checked]:border-accent has-[:checked]:bg-accent/5"
              >
                <input
                  type="radio"
                  name="vertical"
                  value={pack.id}
                  defaultChecked={i === 0}
                  className="mt-1 accent-[var(--accent)]"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{pack.label}</span>
                  <span className="hint mt-0.5 block">{pack.blurb}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <button type="submit" className="btn-primary w-full">
          Create it
        </button>
      </form>
    </div>
  );
}
