import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { seedFromPack } from "@/lib/seed";
import { TradePicker } from "./TradePicker";
import { parsePounds } from "@/lib/money";
import { Mark } from "@/components/Icons";

/**
 * Signup.
 *
 * Three questions, and the trade decides most of what follows — the wording,
 * what the assistant asks, the services, the reminders. Getting it wrong means
 * a salon starts life with tattoo price bands.
 *
 * The third question exists because most businesses here are one person who is
 * also the one answering the phone. Without somebody to quote for, a new signup
 * would find the assistant unable to price anything at all.
 */
async function createStudio(formData: FormData) {
  "use server";

  const name = String(formData.get("name") ?? "").trim();
  const vertical = String(formData.get("vertical") ?? "general").trim();
  const yourName = String(formData.get("your_name") ?? "").trim();
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

  if (studioId) {
    // Everything the trade implies, all editable afterwards.
    await seedFromPack(supabase, studioId as string, vertical);

    // And the person doing the work. Without at least one, the assistant
    // cannot quote anything — which for a one-person business would mean
    // signing up and finding it does not work.
    if (yourName) {
      const hourly = parsePounds(formData.get("hourly_rate")) ?? 5000;
      const minimum = parsePounds(formData.get("min_charge")) ?? Math.min(hourly, 3000);

      await supabase.from("artists").insert({
        studio_id: studioId as string,
        name: yourName,
        hourly_rate_pence: hourly,
        min_charge_pence: minimum,
        active: true,
        booking_provider: "native",
      });
    }
  }

  redirect(yourName ? "/settings/pricing" : "/settings/artists");
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
          <Mark className="size-8" />
          <div className="page-title mt-4">Set up your business</div>
          <p className="hint mt-1.5">
            Three questions. All of it can be changed later.
          </p>
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
            This sets your wording, the questions the assistant asks, your starting services,
            whether you travel to customers, and what reminders say. All of it is yours to
            edit afterwards.
          </p>
          <TradePicker />
        </fieldset>

        <div className="space-y-4 rounded-lg border border-border p-4">
          <div>
            <label className="label">Who does the work</label>
            <p className="hint mb-3">
              Just you? Put your name in. More of you? Add the others afterwards — this is
              simply the first.
            </p>
          </div>

          <input
            name="your_name"
            placeholder="Your name"
            className="input"
            autoComplete="name"
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Hourly rate (£)</label>
              <input name="hourly_rate" placeholder="50" className="input" />
            </div>
            <div>
              <label className="label">Minimum charge (£)</label>
              <input name="min_charge" placeholder="30" className="input" />
            </div>
          </div>
          <p className="hint">
            Rough is fine — they only set the starting point, and flat-price services can be
            added instead. Without at least one person the assistant cannot quote.
          </p>
        </div>

        <button type="submit" className="btn-primary w-full">
          Create it
        </button>
      </form>
    </div>
  );
}
