import type { Metadata } from "next";
import { Ask, Close, Hero, Item, Section, Shot } from "../SellingPage";

export const metadata: Metadata = {
  title: "Websites",
  description:
    "The site you have been putting off, built around the work you actually do, hosted and looked after.",
};

/**
 * The selling page for the studio.
 *
 * No price and no invented client list. Living Canvas is named because it is
 * already named on the home page and the site is live and public; the second
 * one is a placeholder until Giles says whether that client wants naming.
 */
export default function Page() {
  return (
    <>
      <Hero
        eyebrow="Websites"
        title={<>The site you keep meaning to sort out.</>}
        lede={
          <>
            Plenty of good tradespeople have no website, or one built years ago by
            somebody who has stopped answering. We build it, host it, keep it working, and
            you can have it whether or not you ever use the assistant.
          </>
        }
      />

      <Section
        title="What you get"
        intro="A site built around the work you do, not a theme with your name dropped into it."
      >
        <Item head="Built around the work, not a template">
          Your trade, your photographs, your prices if you want them shown. It says what
          you actually do rather than what a theme assumed.
        </Item>
        <Item head="Found by the people looking">
          Set up properly for search and for a phone, which is where nearly everybody will
          see it. Fast, because a slow site loses the job before it loads.
        </Item>
        <Item head="Looked after">
          Hosting, the certificate, the updates and the small changes as the business
          changes. Nothing to renew and nobody to chase.
        </Item>
        <Item head="Yours">
          Your domain, your content, your photographs. If you ever leave it comes with you.
        </Item>
        <Item head="The assistant on it, or not">
          If you have Second Pair it answers on the site from the first day. If you do not,
          the site is still yours and works perfectly well without it.
        </Item>
        <Item head="One person to ring">
          The same person builds it, hosts it and changes it. No account manager, no
          ticket, no waiting a fortnight for a phone number to be updated.
        </Item>
      </Section>

      <Shot
        src="/shots/livingcanvas.webp"
        alt="livingcanvastattoo.ink, a tattoo studio site built and hosted by Second Pair."
        address="livingcanvastattoo.ink"
        tinted
        caption={
          <>
            A tattoo studio in Devon. We built it, we host it, and the assistant answers on
            it. This is the live site, not a mock-up.
          </>
        }
      />

      <Ask line="Tell us what yours needs to do." cta="Book a 15 minute chat" />

      <Section title="Recently" tinted>
        <Item head="livingcanvastattoo.ink">
          A tattoo studio in Devon, with the assistant answering on it. Built, hosted and
          looked after by us.
        </Item>
        <Item head="[NEXT CLIENT]">
          In build. This slot is deliberately empty rather than filled with a stock
          screenshot of somebody we have never worked for.
        </Item>
      </Section>

      <Section
        title="How it works"
        intro="Three steps, and two of them are ours."
      >
        <Item head="A fifteen minute chat">
          What you do, who you do it for, and what the site has to achieve. We will tell
          you if a site is not what you need.
        </Item>
        <Item head="We build it">
          You see it before anybody else does, and you say what is wrong with it. Changes
          during the build are part of it, not extras.
        </Item>
        <Item head="It goes live and stays live">
          We point the domain, switch it on and look after it from there. Priced per job,
          agreed before we start, no monthly surprise.
        </Item>
      </Section>

      <Close
        line="Let us build the one you have been putting off."
        note={
          <>
            Priced per job and agreed before anything starts. Fifteen minutes on the phone
            and you will know what yours would cost.
          </>
        }
      />
    </>
  );
}
