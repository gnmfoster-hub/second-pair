import { Logo } from "@/components/Logo";

export const metadata = { title: "Nothing to pay — Second Pair" };

/**
 * Where a deposit link lands when the business cannot take payments.
 *
 * Somebody has clicked a link expecting to pay and there is nothing to pay
 * into. The important thing is that their appointment is not in danger — the
 * booking stands, and the worst outcome here would be somebody assuming it
 * fell through because the payment did.
 */
export default function NotNeededPage() {
  return (
    <div className="grid min-h-screen place-items-center px-6 py-12">
      <div className="w-full max-w-md">
        <Logo height={52} lockup="flush-right" />
        <div className="card mt-7 p-6">
          <div className="section-title">You are booked in</div>
          <p className="hint mt-2">
            There is no deposit to pay after all &mdash; your appointment is confirmed
            exactly as it is, and nothing else is needed from you.
          </p>
          <p className="hint mt-3">
            If you would rather change or cancel it, reply to the conversation you had
            and somebody will sort it out.
          </p>
        </div>
      </div>
    </div>
  );
}
