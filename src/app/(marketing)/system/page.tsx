import type { Metadata } from "next";
import { ChannelIcon } from "@/components/ChannelIcon";
import type { Channel } from "@/lib/types";
import { Ask, Close, Hero } from "../SellingPage";
import { Record, Reminders, Shot, Showcase } from "../home/TheRest";
import "../home/showpiece.css";
import "../websites/websites.css";
import "./system.css";

export const metadata: Metadata = {
  title: "The Second Pair system",
  description:
    "An assistant that answers your customers and fills your diary while you are working, in your prices and your words.",
};

/**
 * Where it answers, and how far along each one is.
 *
 * The state is the first thing said about each channel, so it is drawn as a
 * label rather than left as the opening words of a paragraph: somebody
 * scanning six cards should not have to read all six to learn that three are
 * live and one is not.
 */
const WHERE: { head: string; state: "Live now" | "Not yet" | "Part way" | null; icon: Channel[]; body: string }[] = [
  {
    head: "Your website",
    state: "Live now",
    icon: ["web"],
    body: "A widget in your own colour on your own site, answering from the first day. If we build the site it is already on it.",
  },
  {
    head: "Text messages",
    state: "Live now",
    icon: ["sms"],
    body: "Your own number, or a new one we set up for you. Whoever texts it gets an answer, at any hour.",
  },
  {
    head: "Email",
    state: "Live now",
    icon: ["email"],
    body: "Your enquiries address forwards in, and replies go out under your name. Everyone on the team can have their own.",
  },
  {
    head: "WhatsApp, Instagram and Messenger",
    state: "Not yet",
    icon: ["whatsapp", "instagram", "messenger"],
    body: "These three need Meta’s review before anybody can use them, and ours is in progress. We would rather say that than sell you something that is not switched on.",
  },
  {
    head: "The phone",
    state: "Part way",
    icon: ["voice"],
    body: "A missed call can take a message, and the assistant answers what was actually said by text rather than making somebody type it out again. Picking the call up and talking is what we are building now.",
  },
  {
    head: "One inbox for all of it",
    state: null,
    icon: [],
    body: "Filtered by what needs you, what is open, what is booked and what was lost. The things waiting on a person are marked, and nothing else asks for your attention.",
  },
];

/**
 * The selling page for the system, written to Giles's brief.
 *
 * Two rules held throughout. No price: he asked for it off this page, and it
 * is settled per business in the chat anyway. And nothing claimed that is not
 * true today — the channels section says plainly which are live and which are
 * waiting on Meta, because the sales assistant was corrected for exactly that
 * claim and the page it sits on should not repeat it.
 *
 * The words are the ones the page had. What changed is that each claim now
 * has the screen it describes beside it, the channels say their state at a
 * glance, and the page has rooms rather than twenty-four paragraphs in a row.
 */
export default function Page() {
  return (
    <>
      <div className="sp-night sp-web-hero">
        <Hero
          eyebrow="The Second Pair system"
          title={<>It answers while you are working.</>}
          lede={
            <>
              Most enquiries arrive while your hands are full. Second Pair answers them in
              your words, quotes from your own prices, and puts the work in your diary
              before you have put the tools down.
            </>
          }
        />
      </div>

      <Showcase
        title="What it actually does"
        intro="Not a chatbot that takes a name and a number. It finishes the job: quotes it, books it, takes the deposit and sets the reminder."
        items={[
          {
            head: "Answers in your voice",
            body: "It learns how you write from a couple of examples you type in, and answers the way you would. It never pretends to be you, and it says so if somebody asks.",
            show: (
              <Shot
                src="/shots/inbox.webp"
                alt="The Second Pair inbox, showing nine enquiries with their status and what they came to."
              />
            ),
          },
          {
            head: "Quotes from your prices",
            body: "Your rates, your minimums. It never invents a number, never goes under your floor, and always says a price is confirmed once you have seen the job.",
            show: (
              <div className="sp-texts">
                <p>
                  <small>Customer</small>
                  How much for a full head of foils?
                </p>
                <p>
                  <small>Your assistant</small>
                  [YOUR PRICE], confirmed when Chloe&rsquo;s seen your hair. Tuesday at 1?
                </p>
              </div>
            ),
          },
          {
            head: "Books into your diary",
            body: "It offers real gaps, takes the booking and writes it down. Day, week and person views, repeats, blocks and all-day entries. If you already run Fresha it reads that diary too.",
            show: (
              <Shot
                src="/shots/diary-month.webp"
                alt="A month in the Second Pair diary, showing appointments across six stylists."
              />
            ),
          },
          {
            head: "Takes the deposit",
            body: "Straight to your bank through Stripe at their normal rate. Second Pair takes nothing out of it. Off entirely for trades that invoice after.",
            show: (
              <Shot
                src="/shots/report.webp"
                alt="The Second Pair weekly report, showing money recovered, reply speed and takings by person."
              />
            ),
          },
          {
            head: "Sends the reminders",
            body: "Bring photo ID for a tattoo. Come with dry hair for a colour. Leave access and somewhere to park for a sparky. Written for the job, not a generic nudge.",
            show: <Reminders />,
          },
          {
            head: "Keeps the records",
            body: "History, what somebody has spent, no-shows, and a private note that flags every time they come back.",
            show: <Record />,
          },
        ]}
      />

      <section className="sp-night sp-where">
        <div className="shell sp-where-in">
          <h2 className="page-title sp-big-title">Where it answers</h2>
          <p className="sp-where-intro">
            Every channel lands in one inbox, so you are not checking five apps to find out
            who wants what.
          </p>
          <ul>
            {WHERE.map((w) => (
              <li key={w.head} data-state={w.state ?? undefined}>
                <div className="sp-where-top">
                  <span className="sp-where-icons" aria-hidden>
                    {w.icon.map((c) => (
                      <ChannelIcon key={c} channel={c} className="size-5" />
                    ))}
                  </span>
                  {w.state && <em>{w.state}</em>}
                </div>
                <h3 className="section-title">{w.head}</h3>
                <p>{w.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <Ask line="Fifteen minutes, and you will know if it suits your trade." />

      <section className="sp-steps" data-plain="">
        <div className="shell sp-steps-in">
          <h2 className="page-title sp-big-title">It knows your trade</h2>
          <p className="sp-steps-intro">
            Thirty-two trades, each with its own questions, its own fields and its own sense
            of what matters. A gas engineer does not book somebody who says they can smell
            gas.
          </p>
          <ul className="sp-steps-list">
            <li>
              <h3 className="section-title">The questions your trade asks</h3>
              <p>
                A roofer is asked how many storeys, because that decides the access
                equipment. A locksmith records whether proof of address was seen. A clinic
                records when the consultation happened, because without it there is no
                defence.
              </p>
            </li>
            <li>
              <h3 className="section-title">It knows when to stop</h3>
              <p>
                A complaint, anything medical, anyone under eighteen, anyone who asks for a
                person. It fetches you and stops talking, and it tells the customer plainly
                that nothing is settled until you have answered.
              </p>
            </li>
            <li>
              <h3 className="section-title">It will turn work away</h3>
              <p>
                If it is not something you do, it says so instead of booking it in and
                leaving you to explain on the day.
              </p>
            </li>
            <li>
              <h3 className="section-title">A link each</h3>
              <p>
                In a salon, every stylist gets their own link for their own Instagram.
                Enquiries there are theirs, and it never asks who you would like.
              </p>
            </li>
            <li>
              <h3 className="section-title">Whose customer it is</h3>
              <p>
                Somebody who has been before is joined to the record you already have, so
                their history is in front of whoever is doing the work.
              </p>
            </li>
            <li>
              <h3 className="section-title">On your phone</h3>
              <p>
                Add it to your home screen and it works like an app. No app store, no
                waiting, nothing to update.
              </p>
            </li>
          </ul>
        </div>
      </section>

      <section className="sp-back">
        <div className="shell sp-back-in">
          <div className="sp-back-words">
            <h2 className="page-title sp-big-title">What you get back</h2>
            <p className="sp-back-intro">
              The report that arrives every Monday, and the screen you can open any time.
            </p>
            <ul>
              <li className="index-item">
                <h3 className="section-title">What it won you</h3>
                <p>
                  What came in while you were shut, what it turned into, and what has
                  actually been paid. Money recovered rather than messages answered.
                </p>
              </li>
              <li className="index-item">
                <h3 className="section-title">How fast it answered</h3>
                <p>
                  The median time from somebody&rsquo;s message to the reply. It is usually
                  seconds, and that is most of why the work lands with you rather than the
                  next name on the list.
                </p>
              </li>
              <li className="index-item">
                <h3 className="section-title">Who has not been back</h3>
                <p>
                  Past their own usual gap, not a fixed number of days. Somebody who comes
                  every five weeks shows up long before somebody who comes twice a year.
                </p>
              </li>
              <li className="index-item">
                <h3 className="section-title">When you are busy</h3>
                <p>
                  Which days fill and which hours go, so you know what to open up and what to
                  stop offering.
                </p>
              </li>
              <li className="index-item">
                <h3 className="section-title">Every penny, and how it came in</h3>
                <p>Card machine, payment link or cash, and what the card company kept.</p>
              </li>
              <li className="index-item">
                <h3 className="section-title">Nothing you have to chase</h3>
                <p>
                  It arrives on a Monday morning by email if you want it. You do not have to
                  open anything to find out how the week went.
                </p>
              </li>
            </ul>
          </div>

          <figure className="sp-back-shot">
            <Shot
              src="/shots/report.webp"
              alt="The Second Pair weekly report, showing money recovered, reply speed and takings by person."
            />
            <figcaption>
              This is the demo salon, so the people and the money are made up; everything
              else is exactly what you get.
            </figcaption>
          </figure>
        </div>
      </section>

      <Close
        line="Give us a second pair of hands!"
        note={
          <>
            Fifteen minutes on the phone and we will tell you honestly whether it suits
            your trade. We set every business up ourselves, so there is nothing for you to
            configure.
          </>
        }
      />
    </>
  );
}
