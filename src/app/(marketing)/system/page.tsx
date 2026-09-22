import type { Metadata } from "next";
import { Ask, Close, Hero, Item, Section, Shot } from "../SellingPage";

export const metadata: Metadata = {
  title: "The Second Pair system",
  description:
    "An assistant that answers your customers and fills your diary while you are working, in your prices and your words.",
};

/**
 * The selling page for the system, written to Giles's brief.
 *
 * Two rules held throughout. No price: he asked for it off this page, and it
 * is settled per business in the chat anyway. And nothing claimed that is not
 * true today — the channels section says plainly which are live and which are
 * waiting on Meta, because the sales assistant was corrected for exactly that
 * claim and the page it sits on should not repeat it.
 */
export default function Page() {
  return (
    <>
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

      <Section
        title="What it actually does"
        intro="Not a chatbot that takes a name and a number. It finishes the job: quotes it, books it, takes the deposit and sets the reminder."
      >
        <Item head="Answers in your voice">
          It learns how you write from a couple of examples you type in, and answers the
          way you would. It never pretends to be you, and it says so if somebody asks.
        </Item>
        <Item head="Quotes from your prices">
          Your rates, your minimums. It never invents a number, never goes under your
          floor, and always says a price is confirmed once you have seen the job.
        </Item>
        <Item head="Books into your diary">
          It offers real gaps, takes the booking and writes it down. Day, week and person
          views, repeats, blocks and all-day entries. If you already run Fresha it reads
          that diary too.
        </Item>
        <Item head="Takes the deposit">
          Straight to your bank through Stripe at their normal rate. Second Pair takes
          nothing out of it. Off entirely for trades that invoice after.
        </Item>
        <Item head="Sends the reminders">
          Bring photo ID for a tattoo. Come with dry hair for a colour. Leave access and
          somewhere to park for a sparky. Written for the job, not a generic nudge.
        </Item>
        <Item head="Keeps the records">
          History, what somebody has spent, no-shows, and a private note that flags every
          time they come back.
        </Item>
      </Section>

      <Shot
        src="/shots/inbox.webp"
        alt="The Second Pair inbox, showing nine enquiries with their status and what they came to."
        address="second-pair.com"
        tinted
        caption={
          <>
            One inbox, whatever the enquiry arrived on. What it booked, what it took, and
            the one thing waiting on a person, marked. This is the demo salon, so the
            people and the money are made up; everything else is exactly what you get.
          </>
        }
      />

      <Section
        title="Where it answers"
        tinted
        intro="Every channel lands in one inbox, so you are not checking five apps to find out who wants what."
      >
        <Item head="Your website">
          Live now. A widget in your own colour on your own site, answering from the first
          day. If we build the site it is already on it.
        </Item>
        <Item head="Text messages">
          Live now. Your own number, or a new one we set up for you. Whoever texts it gets
          an answer, at any hour.
        </Item>
        <Item head="Email">
          Live now. Your enquiries address forwards in, and replies go out under your name.
          Everyone on the team can have their own.
        </Item>
        <Item head="WhatsApp, Instagram and Messenger">
          Not yet. These three need Meta&rsquo;s review before anybody can use them, and
          ours is in progress. We would rather say that than sell you something that is
          not switched on.
        </Item>
        <Item head="The phone">
          Part way. A missed call can take a message, and the assistant answers what was
          actually said by text rather than making somebody type it out again. Picking the
          call up and talking is what we are building now.
        </Item>
        <Item head="One inbox for all of it">
          Filtered by what needs you, what is open, what is booked and what was lost. The
          things waiting on a person are marked, and nothing else asks for your attention.
        </Item>
      </Section>

      <Ask line="Fifteen minutes, and you will know if it suits your trade." />

      <Shot
        src="/shots/diary-month.webp"
        alt="A month in the Second Pair diary, showing appointments across six stylists."
        address="second-pair.com/diary"
        caption={
          <>
            The diary it books into. Day, week, month and person, with everybody in their
            own colour. Hours booked, what they are worth and what is still free, at the
            top of every view.
          </>
        }
      />

      <Section
        title="It knows your trade"
        intro="Thirty-two trades, each with its own questions, its own fields and its own sense of what matters. A gas engineer does not book somebody who says they can smell gas."
      >
        <Item head="The questions your trade asks">
          A roofer is asked how many storeys, because that decides the access equipment. A
          locksmith records whether proof of address was seen. A clinic records when the
          consultation happened, because without it there is no defence.
        </Item>
        <Item head="It knows when to stop">
          A complaint, anything medical, anyone under eighteen, anyone who asks for a
          person. It fetches you and stops talking, and it tells the customer plainly that
          nothing is settled until you have answered.
        </Item>
        <Item head="It will turn work away">
          If it is not something you do, it says so instead of booking it in and leaving
          you to explain on the day.
        </Item>
        <Item head="A link each">
          In a salon, every stylist gets their own link for their own Instagram. Enquiries
          there are theirs, and it never asks who you would like.
        </Item>
        <Item head="Whose customer it is">
          Somebody who has been before is joined to the record you already have, so their
          history is in front of whoever is doing the work.
        </Item>
        <Item head="On your phone">
          Add it to your home screen and it works like an app. No app store, no waiting,
          nothing to update.
        </Item>
      </Section>

      <Section
        title="What you get back"
        tinted
        intro="The report that arrives every Monday, and the screen you can open any time."
      >
        <Item head="What it won you">
          What came in while you were shut, what it turned into, and what has actually been
          paid. Money recovered rather than messages answered.
        </Item>
        <Item head="How fast it answered">
          The median time from somebody&rsquo;s message to the reply. It is usually seconds,
          and that is most of why the work lands with you rather than the next name on the
          list.
        </Item>
        <Item head="Who has not been back">
          Past their own usual gap, not a fixed number of days. Somebody who comes every
          five weeks shows up long before somebody who comes twice a year.
        </Item>
        <Item head="When you are busy">
          Which days fill and which hours go, so you know what to open up and what to stop
          offering.
        </Item>
        <Item head="Every penny, and how it came in">
          Card machine, payment link or cash, and what the card company kept.
        </Item>
        <Item head="Nothing you have to chase">
          It arrives on a Monday morning by email if you want it. You do not have to open
          anything to find out how the week went.
        </Item>
      </Section>

      <Shot
        src="/shots/report.webp"
        alt="The Second Pair weekly report, showing money recovered, reply speed and takings by person."
        address="second-pair.com/report"
        tinted
        caption={
          <>
            And what it came to. This one arrives by email on a Monday morning if you want
            it, so you do not have to open anything to find out how the week went.
          </>
        }
      />

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
