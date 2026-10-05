import type { Metadata } from "next";
import { Ask, Close, Hero } from "../SellingPage";
import { Case } from "./Case";
import "../home/showpiece.css";
import "../websites/websites.css";
import "./work.css";

export const metadata: Metadata = {
  title: "Our work",
  description:
    "What we have built and who is using it: sites, the assistant, and the things we make for ourselves.",
};

/**
 * What we have built.
 *
 * Deliberately short on client names. Living Canvas and Amber's are here
 * because their sites are public and carry our name; the third is a
 * placeholder until Giles says they are happy to be named. A page of invented
 * logos is the one thing a page like this must not be — anybody who checks
 * finds out, and then nothing else on the site is believed either.
 *
 * Two real pieces of work is a short portfolio, so each gets a whole screen
 * rather than a third of a row. Short and large reads as chosen; short and
 * small reads as all there is.
 */
export default function Page() {
  return (
    <>
      <div className="sp-night sp-web-hero">
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
      </div>

      <div className="shell sp-work-lead">
        <h2 className="page-title sp-big-title">Live and answering</h2>
        <p>
          Businesses running Second Pair today, with real customers on the other end of it.
        </p>
      </div>

      <Case
        name="Living Canvas Tattoo"
        did={["Website", "Hosting", "The assistant"]}
        href="https://livingcanvastattoo.ink"
        domain="livingcanvastattoo.ink"
        src="/shots/site-livingcanvas.webp"
        height={830}
        alt="livingcanvastattoo.ink, built and hosted by Second Pair with the assistant on it."
      >
        A tattoo studio in Devon. We built livingcanvastattoo.ink, host it, and the
        assistant answers on it. Enquiries at nine on a Tuesday night get a price and a
        slot rather than a wait until morning.
      </Case>

      {/*
        * Amber's. The chat bubble is in the picture on purpose: it is the
        * product, on a real customer's site, which is the whole argument this
        * page is making, made by a picture rather than by a sentence.
        */}
      <Case
        night
        flip
        name={<>Amber&rsquo;s Paws &amp; Pastures</>}
        did={["Website", "Hosting", "The assistant"]}
        href="https://www.amberspawsandpastures.com"
        domain="amberspawsandpastures.com"
        src="/shots/site-ambers.webp"
        height={2600}
        alt="amberspawsandpastures.com, built by Second Pair with the assistant answering on it."
      >
        Dog walking, pet sitting and horse care around Newton Abbot. We built
        amberspawsandpastures.com, and the assistant answers on it by text and by email —
        including the enquiries that arrive after she has finished for the day.
      </Case>

      <div className="shell sp-work-unnamed">
        <div className="index-item">
          <h3 className="section-title text-[0.95rem]">[CLIENT]</h3>
          <p>
            A cleaning business, with the assistant on its enquiries. Named here once they
            have said they are happy to be.
          </p>
        </div>
      </div>

      <Ask line="Want one of these for your trade?" />

      <section className="shell sp-own">
        <h2 className="page-title sp-big-title">What we make for ourselves</h2>
        <ul>
          <li>
            <div className="sp-own-pic">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/shots/inbox.webp" alt="The Second Pair inbox, in the demo salon." loading="lazy" />
            </div>
            <h3 className="section-title">Second Pair</h3>
            <p>
              The assistant, the diary, the client list and the reports. Thirty-two trades,
              each with its own questions. Everything on this site is running on it.
            </p>
          </li>
          <li>
            <div className="sp-own-pic">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/shots/fa-holiday.webp" alt="The holiday planner in Family APP!" loading="lazy" />
            </div>
            <h3 className="section-title">Family APP!</h3>
            <p>
              A private hub for one family: chat, photos, a shared calendar, meal plans and
              an AI holiday planner. Built because we wanted it at home, and in early access
              now.
            </p>
          </li>
          <li>
            <div className="sp-own-pic" data-fit="hand">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/hands/hand-type-480.webp" alt="" loading="lazy" />
            </div>
            <h3 className="section-title">This site</h3>
            <p>
              Built and hosted the same way we would build yours, and the assistant on the
              front page is the real one. You can ask it something and see.
            </p>
          </li>
        </ul>
      </section>

      <section className="sp-steps" data-plain="">
        <div className="shell sp-steps-in">
          <h2 className="page-title sp-big-title">How we work</h2>
          <p className="sp-steps-intro">
            The same three things every time, whether it is a website, an app, or the
            assistant.
          </p>
          <ul className="sp-steps-list">
            <li>
              <h3 className="section-title">We set it up, not you</h3>
              <p>
                Every business is set up by us: the prices, the hours, the questions, the
                reminders. There is no empty dashboard waiting for you to fill it in.
              </p>
            </li>
            <li>
              <h3 className="section-title">Priced per job</h3>
              <p>
                Agreed before anything starts. No monthly surprise and nothing that quietly
                grows with use.
              </p>
            </li>
            <li>
              <h3 className="section-title">One person to ring</h3>
              <p>
                The person who built it is the person who picks up, and they know your
                business without looking it up.
              </p>
            </li>
          </ul>
        </div>
      </section>

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
