"use server";

import { revalidatePath } from "next/cache";
import { requireStudio } from "@/lib/studio";
import { createAdminClient } from "@/lib/supabase/admin";
import { refreshDemo } from "@/lib/demo/refresh";

export type DemoResetState = { note?: string; error?: string };

/**
 * Putting the demo back, from inside it.
 *
 * Rebuilding has always been possible and always from the back office, which
 * meant it happened when whoever runs the platform remembered — rather than
 * straight after the demonstration that left a cancelled booking and a
 * half-finished reply in it.
 *
 * Two guards, and they are the whole of this function's job. The business is
 * read from the session rather than taken from the form, so there is no id to
 * get wrong; and it refuses anything not marked as a demo, checked here
 * against the row. refreshDemo checks the same thing again on its own — this
 * deletes a week of appointments and every conversation wholesale, and one
 * check between a button and that is not enough.
 */
export async function resetThisDemo(
  _prev: DemoResetState,
  _fd: FormData,
): Promise<DemoResetState> {
  const { studio } = await requireStudio();

  if (studio.kind !== "demo") {
    return { error: "This is a real business, so there is nothing here to rebuild." };
  }

  try {
    /*
     * The service key, deliberately.
     *
     * Rebuilding writes across every table in the business, and the person
     * pressing this is usually signed in as one of the demo's own staff —
     * whose row-level permissions correctly stop them doing most of it. The
     * authority comes from the two checks above, not from who is holding the
     * button.
     */
    const out = await refreshDemo(createAdminClient(), studio.id);

    revalidatePath("/");
    revalidatePath("/diary");
    revalidatePath("/clients");
    revalidatePath("/report");

    return {
      note:
        `Put back: ${out.appointments} appointments this week, ${out.history} behind it, ` +
        `${out.sales} counter sales and ${out.conversations} conversations, all dated from today.`,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "It would not rebuild." };
  }
}
