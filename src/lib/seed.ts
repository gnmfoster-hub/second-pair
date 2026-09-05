import type { SupabaseClient } from "@supabase/supabase-js";
import { verticalPack } from "@/lib/verticals";

/**
 * Fills a new business with its trade's starting point.
 *
 * Everything here is editable afterwards — it exists so somebody signing up on
 * a Tuesday has a working assistant on Tuesday, rather than an empty form and
 * a tattoo studio's price bands.
 *
 * Written to be safe to re-run: every insert ignores what is already there, so
 * a business can pick up a pack later without losing what they have changed.
 */
export async function seedFromPack(
  db: SupabaseClient,
  studioId: string,
  verticalId: string,
): Promise<{ seeded: string[]; errors: string[] }> {
  const pack = verticalPack(verticalId);
  const seeded: string[] = [];
  const errors: string[] = [];

  /*
   * Whether this table already has something in it.
   *
   * Errs towards "yes, leave it alone". A failed count read as nought would
   * make seeding run again over a business that already has its prices, and
   * every band would be duplicated — the assistant then quotes from a list
   * with two of everything, and somebody has to unpick it by hand.
   *
   * The other way round is harmless: a business that ends up unseeded shows in
   * the attention panel as needing prices, which is visible and fixable.
   */
  const has = async (table: string) => {
    const { count, error } = await db
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq("studio_id", studioId);
    if (error) return true;
    return (count ?? 0) > 0;
  };

  // --- vocabulary and trade
  const { error: studioError } = await db
    .from("studios")
    .update({
      vertical: pack.id,
      vocabulary: pack.vocabulary,
      deposit_mode: pack.deposits,
      // Where the work happens decides whether the assistant asks for an
      // address at all, and whether travel time is left between jobs. Getting
      // this wrong makes the product unusable for a mobile trade on day one.
      travel_mode: pack.location,
    })
    .eq("id", studioId);
  if (studioError) errors.push(`vocabulary: ${studioError.message}`);
  else seeded.push("wording");

  // --- pick-lists
  if (!(await has("service_options"))) {
    // Every row carries every key: PostgREST sends an explicit NULL for a key
    // another row in the batch has, which silently fails the whole insert.
    const options = [
      ...pack.styles.map((s, i) => ({ kind: "style", value: s.value, label: s.label, sort_order: i })),
      ...pack.intents.map((s, i) => ({ kind: "intent", value: s.value, label: s.label, sort_order: i })),
    ].map((o) => ({ ...o, studio_id: studioId }));

    const { error } = await db.from("service_options").insert(options);
    if (error) errors.push(`options: ${error.message}`);
    else seeded.push(`${options.length} styles and intents`);
  }

  // --- service bands
  if (!(await has("price_bands"))) {
    const bands = pack.bands.map((b, i) => ({ ...b, studio_id: studioId, sort_order: i }));
    const { error } = await db.from("price_bands").insert(bands);
    if (error) errors.push(`bands: ${error.message}`);
    else seeded.push(`${bands.length} services`);
  }

  // --- questions worth answering, left blank for the owner to fill in
  if (!(await has("faqs"))) {
    const faqs = pack.faqs.map((f, i) => ({
      studio_id: studioId,
      question: f.question,
      answer: f.answer || "",
      sort_order: i,
    }));
    const { error } = await db.from("faqs").insert(faqs);
    if (error) errors.push(`faqs: ${error.message}`);
    else seeded.push(`${faqs.length} questions to answer`);
  }

  // --- reminders
  if (!(await has("reminder_templates"))) {
    const reminders = pack.reminders.map((r, i) => ({
      studio_id: studioId,
      label: r.label,
      hours_before: r.hours_before,
      body: r.body,
      enabled: true,
      sort_order: i,
    }));
    const { error } = await db.from("reminder_templates").insert(reminders);
    if (error) errors.push(`reminders: ${error.message}`);
    else seeded.push(`${reminders.length} reminders`);
  }

  return { seeded, errors };
}
