import type { Metadata } from "next";
import { Ask, Close, Hero, Item, Section, Shot } from "../SellingPage";

export const metadata: Metadata = {
  title: "Our work",
  description:
    "What we have built and who is using it: sites, the assistant, and the things we make for ourselves.",
};

/**
 * What we have built.
 *
 * Deliberately short on client names. Living Canvas is here because its site is
 * public and already named on the home page; the rest are placeholders until
 * Giles says who is happy to be named. A page of invented logos is the one
 * thing a page like this must not be — anybody who checks finds out, and then
 * nothing else on the site is believed either.
 */
export default function Page() {
  return (
    <>
      <Hero
        eyebrow="Our work"
        title={<>A short list, and all of it real.</>}
        lede={
          <>
            A small software company in Devon, run by people who answer the phone. This
            page is short on purpose: everything on it is live, and nothing on it is a
            stock photograph of somebody we have never worked for.
          </>
        }
      />

      <Section
        title="Live and answering"
        intro="Businesses running Second Pair today, with real customers on the other end of it."
      >
        <Item head="Living Canvas Tattoo">
          A tattoo studio in Devon. We built livingcanvastattoo.ink, host it, and the
          assistant answers on it. Enquiries at nine on a Tuesday night get a price and a
          slot rather than a wait until morning.
        </Item>
        <Item head="[CLIENT]">
          A cleaning business, with the assistant on its enquiries. Named here once they
          have said they are happy to be.
        </Item>
        <Item head="[NEXT CLIENT]">
          In build. This is left empty rather than filled, which is the point of the page.
        </Item>
      </Section>

      <Shot
        src="/shots/livingcanvas.webp"
        alt="livingcanvastattoo.ink, built and hosted by Second Pair with the assistant on it."
        address="livingcanvastattoo.ink"
        tinted
        caption="Living Canvas Tattoo. The site, the hosting and the assistant, all ours."
      />

      <Ask line="Want one of these for your trade?" />

      <Section title="What we make for ourselves" tinted>
        <Item head="Second Pair">
          The assistant, the diary, the client list and the reports. Thirty-two trades, each
          with its own questions. Everything on this site is running on it.
        </Item>
        <Item head="Family APP!">
          A private hub for one family: chat, photos, a shared calendar, meal plans and an
          AI holiday planner. Built because we wanted it at home, and in early access now.
        </Item>
        <Item head="This site">
          Built and hosted the same way we would build yours, and the assistant on the
          front page is the real one. You can ask it something and see.
        </Item>
      </Section>

      <Section
        title="How we work"
        intro="The same three things every time, whether it is a website, an app, or the assistant."
      >
        <Item head="We set it up, not you">
          Every business is set up by us: the prices, the hours, the questions, the
          reminders. There is no empty dashboard waiting for you to fill it in.
        </Item>
        <Item head="Priced per job">
          Agreed before anything starts. No monthly surprise and nothing that quietly grows
          with use.
        </Item>
        <Item head="One person to ring">
          The person who built it is the person who picks up, and they know your business
          without looking it up.
        </Item>
      </Section>

      <Close
        line="Come and be the next one."
        note={
          <>
            Fifteen minutes on the phone and we will tell you honestly whether any of this
            suits your trade, and what it would cost.
          </>
        }
      />
    </>
  );
}
