import { RailLink } from "@/components/NavLink";
import { SettingsPicker } from "./SettingsPicker";
import { SettingsSearch } from "./SettingsSearch";
import { Page, PageHeader } from "@/components/PageHeader";
import { requireStudio } from "@/lib/studio";
import { createClient } from "@/lib/supabase/server";
import { verticalPack } from "@/lib/verticals";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { studio, userId } = await requireStudio();
  const pack = verticalPack(studio.vertical);
  const words = { ...pack.vocabulary, ...(studio.vocabulary ?? {}) };
  const title = (s: string) => s.replace(/^./, (c) => c.toUpperCase());

  /*
   * The owner sets up the business; everybody else sets up themselves.
   *
   * These tabs were the same for everybody, so a Saturday junior was shown the
   * prices, the assistant's instructions and the widget on the website. The
   * actions behind them refuse now, but a screen you are invited to fill in
   * and then told you may not is a worse experience than one that was never
   * offered — and it also reads as though the business is theirs to change.
   */
  const supabase = await createClient();
  const { data: membership } = await supabase
    .from("studio_members")
    .select("role")
    .eq("studio_id", studio.id)
    .eq("user_id", userId)
    .maybeSingle();

  // Anything other than a clear yes is treated as staff, which shows less
  // rather than more.
  const owns = membership?.role === "owner";

  /*
   * The tab carries their name rather than saying "You".
   *
   * "Who is 'You'?" was a fair question, and it came from the owner — who is
   * exactly the person it is worst for. They are the only one who sees this
   * tab and the whole business sitting beside it, so "You" and "Willow & Co"
   * appear together with nothing to say that the first means Sarah the
   * stylist and not Sarah the owner. Everybody else sees one tab and never has
   * cause to wonder.
   *
   * Their own name settles it in a word, and says the same thing about the
   * page underneath: this is one person's, and every person here has their own.
   */
  const { data: me } = await supabase
    .from("artists")
    .select("name")
    .eq("studio_id", studio.id)
    .eq("user_id", userId)
    .maybeSingle();

  // Somebody with a login and no place in the diary — a receptionist, an
  // office manager — has no name to use here, and "You" is right for them.
  const mine = (me?.name as string | undefined)?.trim().split(/\s+/)[0] || "You";

  /*
   * One list, drawn twice. The order is the order a business is set up in:
   * who you are, then how people reach you, then what happens around a
   * booking, then what is yours alone.
   */
  const groups = [
    ...(owns
      ? [
          {
            title: "Your business",
            links: [
              { href: "/settings", label: title(words.business) },
              /*
               * The page you open when you think something is wrong, and the
               * only one that answers about everything at once. Under the
               * business rather than in a group of its own: it is a fact about
               * this business, not a category of setting.
               */
              { href: "/settings/working", label: "Is it working?" },
              { href: "/settings/pricing", label: "Prices" },
              { href: "/settings/artists", label: title(words.practitioners) },
              { href: "/settings/money", label: "Getting paid" },
            ],
          },
          {
            title: "How people reach you",
            links: [
              { href: "/settings/install", label: "Channels" },
              { href: "/settings/assistant", label: "Assistant" },
              { href: "/settings/faqs", label: "Questions" },
            ],
          },
          {
            /*
             * Everything the business sends a customer, in one place.
             *
             * Giles went looking for the review setting and could not find it:
             * it was two fields on the business page, between the privacy
             * notice and the trade's key dates. Reminders were under "Around a
             * booking" and marketing did not exist. Three kinds of message,
             * three different places, none of them named after messages.
             *
             * Ordered by how a customer meets them: confirmed when they book,
             * reminded before, asked afterwards, and marketed to only if they
             * asked to be.
             */
            title: "Messages you send",
            links: [
              { href: "/settings/reminders", label: "Confirmations and reminders" },
              { href: "/settings/reviews", label: "Review requests" },
              { href: "/settings/marketing", label: "Marketing" },
              /*
               * The only one of these a person sends by hand, and the reason
               * it belongs with the other three rather than near the diary:
               * the group answers "where do I change what we say to people".
               */
              { href: "/settings/messages", label: "Saved messages" },
            ],
          },
          {
            /* What a customer fills in, which is not a message. */
            title: "Around a booking",
            links: [{ href: "/settings/forms", label: "Forms" }],
          },
        ]
      : []),
    {
      // Last, and the only group somebody who is not the owner sees.
      title: owns ? "Yours" : "Yours alone",
      links: [
        { href: "/settings/you", label: mine },
        { href: "/settings/data", label: "Your data" },
      ],
    },
  ];

  return (
    <Page>
      <PageHeader title="Settings">
        {owns ? (
          <>
            How your {words.business} works, and what the assistant knows. Change
            something and the next conversation uses it. The first tab is yours alone, your own hours, rates and days off, and everybody on the team
            has the same one of their own. Theirs is on{" "}
            <span className="text-foreground">{title(words.practitioners)}</span>, where
            you can fill it in for them.
          </>
        ) : (
          <>
            Your own hours, rates and days off. The rest of the {words.business} is set
            by whoever owns it.
          </>
        )}
      </PageHeader>

      {/*
        * Down the side, grouped, in the order somebody sets a business up.
        *
        * It was ten tabs along the top, which wrapped onto a second line and
        * dropped each group wherever there happened to be room — so "Around a
        * booking" sat under "Prices" and read as belonging to it. A rail
        * cannot wrap: the headings stay with what they head, the eye runs down
        * one column instead of hunting along two rows, and another page can be
        * added without the shape of the screen changing.
        *
        * Narrower than a laptop it is a picker rather than a rail, because a
        * rail down the side of a four-hundred-pixel screen is most of the
        * screen and a row that scrolls sideways strands each heading over a
        * gap the moment anybody moves it. See SettingsPicker.
        */}
      <div className="mt-6 lg:grid lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:gap-9">
        {/*
          * A hairline between the rail and the work, and the rail sits against
          * it. Without it the two columns float side by side and the eye has
          * to decide where one ends — which is the difference between a page
          * that looks arranged and one that looks like two lists.
          */}
        <nav
          aria-label="Settings"
          className="lg:sticky lg:top-6 lg:self-start lg:border-r lg:border-border lg:pr-6"
        >
          {/*
            * A box before the list, because the list is the thing that was not
            * working. Thirteen pages and a hundred-odd fields: the rail says
            * which page something is on only if you already know its group.
            */}
          <SettingsSearch owner={owns} />

          <SettingsPicker groups={groups} />

          {/* Down the side, from a laptop upwards. */}
          <div className="hidden lg:flex lg:flex-col lg:gap-6">
            {groups.map((group) => (
              <div key={group.title}>
                <div className="px-2.5 pb-1.5 text-[0.74rem] font-semibold text-muted">
                  {group.title}
                </div>
                <div className="flex flex-col gap-0.5">
                  {group.links.map((link) => (
                    <RailLink
                      key={link.href}
                      href={link.href}
                      /* So a page below a section still lights its section,
                         and /settings does not light on all of them. */
                      siblings={groups.flatMap((g) => g.links.map((l) => l.href))}
                    >
                      {link.label}
                    </RailLink>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </nav>

        <div className="mt-8 min-w-0 lg:mt-0 lg:pl-1">{children}</div>
      </div>
    </Page>
  );
}
