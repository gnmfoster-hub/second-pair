export default function PaymentCancelledPage() {
  return (
    <div className="grid min-h-screen place-items-center px-6 text-center">
      <div className="max-w-sm">
        <h1 className="text-lg font-semibold tracking-tight">Payment cancelled</h1>
        <p className="hint mt-2">
          Nothing has been charged. Your slot is held for a short while — go back to the
          chat and ask for the link again if you still want it.
        </p>
      </div>
    </div>
  );
}
