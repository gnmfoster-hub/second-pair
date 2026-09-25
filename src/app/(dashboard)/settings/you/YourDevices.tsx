import { createClient } from "@/lib/supabase/server";
import { requireStudio } from "@/lib/studio";
import { deviceLine, looksDead, nothingSent, nameOf, type Device } from "@/lib/devices";
import { ForgetDevice } from "./ForgetDevice";

/**
 * Which of your devices are signed up to be buzzed.
 *
 * The control above turns notifications on for the thing you are holding. It
 * has never been able to tell you about the others, and there is usually more
 * than one — an owner signs up their phone, then the salon iPad, then a new
 * phone eighteen months later and the old one is still on the list.
 *
 * What makes it worth a screen rather than a nicety is how a push subscription
 * dies: silently. A replaced phone, a browser clearing its site data, somebody
 * turning notifications off in their operating system — nothing errors,
 * nothing is logged, the phone simply stops buzzing. The owner finds out when
 * a customer rings about a message nobody answered.
 *
 * `last_used_at` has been written on every successful send since notifications
 * were built, precisely so somebody could look. Found by the audit of columns
 * the product writes and never reads.
 *
 * Only this person's own devices. Somebody else's phone is not theirs to see
 * or to remove, and the whole point of the per-device design is that the
 * decision belongs to whoever is holding the thing.
 */
export async function YourDevices() {
  const { studio, userId } = await requireStudio();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("id, label, created_at, last_used_at")
    .eq("studio_id", studio.id)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  /*
   * Silent when there is nothing to say. Somebody who has never turned
   * notifications on is being asked to by the control above, and a second
   * empty box under it saying "no devices" is the same message twice.
   */
  if (error || !data?.length) return null;

  const devices: Device[] = data.map((d) => ({
    id: d.id as string,
    label: (d.label as string | null) ?? null,
    addedAt: d.created_at as string,
    lastUsedAt: (d.last_used_at as string | null) ?? null,
  }));

  const quiet = nothingSent(devices);

  return (
    <section className="card p-5">
      <h2 className="section-title">Where you get buzzed</h2>
      <p className="hint mt-1.5 max-w-prose">
        {devices.length === 1
          ? "One device signed up."
          : `${devices.length} devices signed up. Each one gets every notification.`}
      </p>

      <ul className="mt-3 divide-y divide-border">
        {devices.map((device) => {
          const dead = looksDead(device, devices);
          return (
            <li key={device.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5">
              <span className="font-medium">{nameOf(device)}</span>
              <span className="hint text-xs">{deviceLine(device)}</span>

              {/*
                * Said only where it is actually evidence: this one stopped
                * while another carried on. A single quiet phone is a quiet
                * month, and a warning on that teaches somebody to ignore the
                * screen. See lib/devices.
                */}
              {dead && (
                <span className="pill bg-warn/10 text-[0.65rem] text-warn">
                  May have stopped
                </span>
              )}

              <span className="ml-auto">
                <ForgetDevice id={device.id} name={nameOf(device)} />
              </span>
            </li>
          );
        })}
      </ul>

      {/*
        * The sentence that stops this screen lying.
        *
        * "Not buzzed yet" against every device reads as broken, and on these
        * accounts it almost always means nothing has needed anybody — which is
        * the product working. Said once, here, rather than as a verdict on
        * each row.
        */}
      {quiet && (
        <p className="hint mt-3 max-w-prose text-xs">
          Nothing has been sent yet, so nothing has been buzzed. That is not a fault —
          it means nothing has been left waiting for a person since you signed up.
        </p>
      )}
    </section>
  );
}
