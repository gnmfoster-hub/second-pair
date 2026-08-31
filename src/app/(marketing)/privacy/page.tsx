import type { Metadata } from "next";
import { Legal, Section } from "../Legal";

export const metadata: Metadata = {
  title: "Privacy — Handled",
  description: "What Handled collects, why, and how to get it deleted.",
};

/*
 * A DRAFT. Gareth reads this and corrects it before it goes anywhere near a
 * real customer or a Meta reviewer — particularly the company name, address
 * and the ICO registration, which I cannot know.
 *
 * Meta will not review an app without a reachable privacy policy, and the AI
 * disclosure below is not optional: people are talking to an assistant and
 * they are entitled to know it.
 */
export default function PrivacyPage() {
  return (
    <Legal title="Privacy" updated="31 August 2026">
      <p className="lede">
        Handled provides an assistant that answers enquiries for small businesses. This
        explains what it collects, why, and how to have it removed.
      </p>

      <Section title="You are talking to an assistant">
        <p>
          When you message a business using Handled, the first reply is written by an AI
          assistant, not by a person. It says so at the start of every conversation.
        </p>
        <p>
          The business sees everything the assistant says and everything you say, and can
          step in at any point. Ask for a person and the assistant stops and fetches one.
          It will never claim to be human.
        </p>
      </Section>

      <Section title="What is collected">
        <p>When you enquire through a business using Handled, we hold:</p>
        <ul>
          <li>Your name, and a phone number or email address if you give one</li>
          <li>What you have asked about, and anything you tell the assistant about it</li>
          <li>Photos you choose to attach</li>
          <li>The address where work is to happen, for trades that come to you</li>
          <li>Your appointments, and whether a deposit was paid</li>
          <li>The messages in your conversation</li>
        </ul>
        <p>
          Only what you type. Nothing is bought in from anywhere else, and there is no
          tracking of you across other websites.
        </p>
      </Section>

      <Section title="Why">
        <p>
          To answer your enquiry, give you a price, book you in, and remind you before the
          appointment. That is the whole purpose. Your details are not used for marketing
          and are never sold or shared with anyone for their own purposes.
        </p>
      </Section>

      <Section title="Who can see it">
        <ul>
          <li>
            <strong>The business you contacted.</strong> They can see the whole
            conversation. No other business on Handled can see any of it.
          </li>
          <li>
            <strong>Anthropic</strong>, whose model writes the replies. Conversations are
            not used to train it.
          </li>
          <li>
            <strong>Supabase</strong>, where the data is stored, in the United Kingdom.
          </li>
          <li>
            <strong>Stripe</strong>, if you pay a deposit. Card details go straight to
            Stripe and are never seen or held by Handled or by the business.
          </li>
        </ul>
      </Section>

      <Section title="How long it is kept">
        <p>
          Conversations and appointment records are kept while you are a customer of that
          business and for six years afterwards, which is how long UK businesses generally
          need to keep transaction records. Photos you attach are deleted when the business
          deletes the enquiry.
        </p>
        <p>If a business closes its Handled account, everything of theirs is deleted.</p>
      </Section>

      <Section title="Your rights">
        <p>
          You can ask for a copy of what is held about you, ask for it to be corrected, or
          ask for it to be deleted. Ask the business you contacted, or write to us at the
          address below and we will pass it on and make sure it happens. We will respond
          within a month.
        </p>
        <p>
          If you are not happy with how it is handled, you can complain to the Information
          Commissioner&rsquo;s Office at ico.org.uk.
        </p>
      </Section>

      <Section title="Cookies">
        <p>
          The chat window stores one identifier in your browser so your conversation
          survives a refresh. Nothing else. There is no advertising or analytics tracking.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Written questions and requests to{" "}
          <a href="mailto:privacy@gethandled.co.uk">privacy@gethandled.co.uk</a>.
        </p>
        <p className="draft">
          Before this goes live it needs the registered company name and address, the ICO
          registration number, and confirmation of the retention period. Ask me and
          I&rsquo;ll fill them in.
        </p>
      </Section>
    </Legal>
  );
}
