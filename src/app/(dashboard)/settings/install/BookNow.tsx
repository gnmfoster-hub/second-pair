import { Snippet } from "./Snippet";

/**
 * Booking from a Facebook page and an Instagram profile.
 *
 * Giles, 28 Sep: "create an integrated Facebook booking add-on like they have
 * available."
 *
 * ── Why this is the whole of the useful half ────────────────────────────────
 *
 * There are two things that get called Facebook booking and they are not the
 * same kind of work.
 *
 * The one Fresha and Booksy have — an appointment made inside Facebook, without
 * leaving the app — is a listed partner integration. It is applied for and
 * granted rather than built, and it is downstream of the Meta business
 * verification that has not come through yet.
 *
 * The one almost every small trade actually means is this: a **Book now** button
 * on their page that opens their own booking page. A Facebook page and an
 * Instagram professional account each have one action button and it can point at
 * any web address. Every business here already has a booking page, and so does
 * every individual person, so there was nothing to build except somewhere to
 * find the right link and be told where it goes.
 *
 * Which is exactly what the website snippet panel already does, and this is
 * built to match it: the link to copy, and a short table of where to paste it.
 *
 * ── Why the steps are described rather than dictated ───────────────────────
 *
 * Meta moves these menus, and has moved them repeatedly. Writing "Settings →
 * Templates and Tabs → Add a Button" as though it were a fact is how a help
 * panel becomes worse than no help panel: somebody follows it, the menu is not
 * there, and now they do not trust the rest of the page either. So each row says
 * what to look for and roughly where, and says out loud that Meta renames
 * things — which is true, checkable, and still enough to finish the job.
 */
export function BookNow({
  /** The business's own booking page. */
  link,
  /** Each person's own, where a business has more than one. */
  people,
  /** The trade's own word for one customer, for the last sentence. */
  customer,
}: {
  link: string;
  people: { name: string; link: string }[];
  customer: string;
}) {
  return (
    <section>
      <div className="section-title">A Book now button on Facebook and Instagram</div>
      <p className="hint mt-1 max-w-prose">
        Both let you put one button on your page. Point it at the link below and somebody
        who taps it lands on your own booking page with the assistant on it, which answers
        and books them in. Nothing to install, and no approval from Facebook needed.
      </p>

      <div className="mt-3 space-y-2.5">
        <Snippet value={link} label="Your booking link" />
        {/*
          * Each person's own, listed only where there is more than one.
          *
          * A stylist with her own Instagram wants her own button, and the
          * difference is not cosmetic: on her link the assistant already knows
          * it is for her and never asks who they would like.
          */}
        {people.map((person) => (
          <Snippet
            key={person.link}
            value={person.link}
            label={`${person.name.split(" ")[0]}’s own`}
          />
        ))}
      </div>

      <div className="card mt-4 overflow-hidden">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-border">
            {[
              [
                "Facebook page",
                "Open your page as the manager and look for the button under your cover photo. It may say Add a button, or already say something like Send message. Edit it, choose Book now, and paste the link.",
              ],
              [
                "Instagram",
                "Your account has to be a professional one, which is free to switch to. Then Edit profile, and look for action buttons or contact options. Choose the booking option and paste the link.",
              ],
              [
                "Your bio, either place",
                "Worth putting the same link in the bio as well. The button is easy to miss, and a line saying “book here” is not.",
              ],
            ].map(([what, how]) => (
              <tr key={what}>
                <th scope="row" className="w-40 px-4 py-2.5 text-left align-top font-medium">
                  {what}
                </th>
                <td className="px-4 py-2.5 text-muted">{how}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="hint mt-3 max-w-prose">
        Facebook renames these menus fairly often, so look for the words rather than the
        exact path. If you cannot find it, send us the page and we will do it.
      </p>

      {/*
        * What this is not, said here rather than left to be discovered.
        *
        * Somebody who has seen a salon book inside the Facebook app will
        * reasonably expect this to be that. It is not, and finding out by
        * pressing the button is worse than being told in a sentence.
        */}
      <p className="hint mt-2 max-w-prose">
        This opens your booking page rather than booking inside Facebook itself. Answering
        messages sent to your page is a separate thing and is waiting on Facebook&rsquo;s
        review of Second Pair. Once that is through, a {customer}{" "}
        who messages your page gets answered here alongside everything else.
      </p>
    </section>
  );
}
