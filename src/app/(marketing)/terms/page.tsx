import type { Metadata } from "next";
import { Legal, Section } from "../Legal";

export const metadata: Metadata = {
  title: "Terms — Handled",
  description: "The terms for businesses using Handled.",
};

/*
 * A DRAFT, same as the privacy page. The commercial terms in particular —
 * price, notice period, company details — are Gareth's decisions, not mine,
 * and are marked as such rather than invented.
 */
export default function TermsPage() {
  return (
    <Legal title="Terms" updated="31 August 2026">
      <p className="lede">
        These are the terms for businesses using Handled. If you are a member of the public
        who has messaged a business, the{" "}
        <a href="/privacy">privacy page</a> is the one you want.
      </p>

      <Section title="What Handled does">
        <p>
          Handled provides software that answers enquiries, gives price estimates, and takes
          bookings on your behalf, using your own settings, rates and wording.
        </p>
        <p>
          <strong>The assistant works from what you give it.</strong> It quotes from the
          rates you enter and answers from the information you provide. If your settings are
          wrong, its answers will be wrong. Check them, and check them again when your
          prices change.
        </p>
      </Section>

      <Section title="You are still the business">
        <p>
          Estimates the assistant gives are estimates. The contract for the work is between
          you and your customer, and Handled is not a party to it. You are responsible for
          the work, for your prices, and for anything you have told the assistant to say.
        </p>
        <p>
          You can read every conversation and take over any of them at any time. We strongly
          suggest you do read them, particularly in the first weeks.
        </p>
      </Section>

      <Section title="Payments">
        <p>
          Deposits are taken through Stripe and go to your own Stripe account. You pay
          Stripe&rsquo;s standard rate for that. Handled does not take a cut of your
          deposits, does not hold your money, and is not a payment service.
        </p>
        <p>
          Refunds, chargebacks and disputes with your customers are between you, them and
          Stripe.
        </p>
      </Section>

      <Section title="Your data">
        <p>
          Your business data and your customers&rsquo; details are yours. We do not sell
          them, share them with other businesses on Handled, or use them to train AI models.
        </p>
        <p>
          Close your account and everything of yours is deleted. Export what you need first,
          because it does not come back.
        </p>
      </Section>

      <Section title="Fair use">
        <p>You must not use Handled to:</p>
        <ul>
          <li>Mislead anyone about whether they are talking to a person</li>
          <li>Give medical, legal or financial advice</li>
          <li>Send marketing to people who have not asked for it</li>
          <li>Break the law, or your own trade&rsquo;s regulations</li>
        </ul>
        <p>
          The assistant already refuses these. Configuring it to get around them is a breach
          of these terms.
        </p>
      </Section>

      <Section title="Availability">
        <p>
          We aim to keep Handled running at all times but cannot promise it. It depends on
          services we do not control, including Anthropic, Supabase, Stripe and Meta. If it
          is down, your enquiries wait rather than disappear.
        </p>
      </Section>

      <Section title="Ending it">
        <p className="draft">
          Notice period, subscription price, billing terms and the registered company name
          and address still need deciding. Tell me what they are and I will put them in
          rather than guess at them.
        </p>
      </Section>
    </Legal>
  );
}
