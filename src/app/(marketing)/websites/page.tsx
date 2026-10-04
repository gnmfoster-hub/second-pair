import type { Metadata } from "next";
import { Ask, Close, Hero, Item, Section } from "../SellingPage";
import { SiteTour } from "./SiteTour";
import "../home/showpiece.css";
import "./websites.css";

export const metadata: Metadata = {
  title: "Websites",
  description:
    "The site you have been putting off, built around the work you actually do, hosted and looked after.",
};

/**
 * The selling page for the studio.
 *
 * No price and no invented client list. The two sites named are the two that
 * are live, and both already carry our name in their own footers.
 *
 * This is the page that has to prove we can build a website, so it is built
 * the way we would build one: a first screen that is one statement, then the
 * six things you get shown on the sites themselves as the page scrolls, then
 * the three steps, numbered because they are a sequence.
 */
export default function Page() {
  return (
    <>
      <div className="sp-night sp-web-hero">
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
      </div>

      {/*
        * Two sites, because one reads as the only one there has ever been, and
        * deliberately unlike each other — a dog walker and a tattoo studio. The
        * question a visitor is actually asking is "would you know what to do
        * with mine", and two different trades answer it better than any
        * sentence about being adaptable.
        */}
      <SiteTour
        title="What you get"
        intro="A site built around the work you do, not a theme with your name dropped into it."
        items={[
          {
            head: "Built around the work, not a template",
            body: (
              <>
                Your trade, your photographs, your prices if you want them shown. It says
                what you actually do rather than what a theme assumed.
              </>
            ),
          },
          {
            head: "Found by the people looking",
            body: (
              <>
                Set up properly for search and for a phone, which is where nearly everybody
                will see it. Fast, because a slow site loses the job before it loads.
              </>
            ),
          },
          {
            head: "Looked after",
            body: (
              <>
                Hosting, the certificate, the updates and the small changes as the business
                changes. Nothing to renew and nobody to chase.
              </>
            ),
          },
          {
            head: "Yours",
            body: (
              <>
                Your domain, your content, your photographs. If you ever leave it comes with
                you.
              </>
            ),
          },
          {
            head: "The assistant on it, or not",
            body: (
              <>
                If you have Second Pair it answers on the site from the first day. If you do
                not, the site is still yours and works perfectly well without it.
              </>
            ),
          },
          {
            head: "One person to ring",
            body: (
              <>
                The same person builds it, hosts it and changes it. No account manager, no
                ticket, no waiting a fortnight for a phone number to be updated.
              </>
            ),
          },
        ]}
      />

      <Ask line="Tell us what yours needs to do." cta="Book a 15 minute chat" />

      <Section title="Recently" tinted>
        <Item head="livingcanvastattoo.ink">
          A tattoo studio in Devon, with the assistant answering on it. Built, hosted and
          looked after by us.
        </Item>
        <Item head="amberspawsandpastures.com">
          Dog walking, pet sitting and horse care near Newton Abbot. Built, hosted, and
          answering by text and email.
        </Item>
      </Section>

      <section className="sp-steps">
        <div className="shell sp-steps-in">
          <h2 className="page-title sp-big-title">How it works</h2>
          <p className="sp-steps-intro">Three steps, and two of them are ours.</p>
          <ol>
            <li>
              <h3 className="section-title">A fifteen minute chat</h3>
              <p>
                What you do, who you do it for, and what the site has to achieve. We will
                tell you if a site is not what you need.
              </p>
            </li>
            <li>
              <h3 className="section-title">We build it</h3>
              <p>
                You see it before anybody else does, and you say what is wrong with it.
                Changes during the build are part of it, not extras.
              </p>
            </li>
            <li>
              <h3 className="section-title">It goes live and stays live</h3>
              <p>
                We point the domain, switch it on and look after it from there. Priced per
                job, agreed before we start, no monthly surprise.
              </p>
            </li>
          </ol>
        </div>
      </section>

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
