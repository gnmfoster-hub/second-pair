import { readableNumber } from "@/lib/channels/phoneNumbers";

/**
 * What numbers this business has, and where another comes from.
 *
 * Giles: a number comes with the subscription, and settings should say so and
 * show it if it is subscribed to. The panel above shows one number and the
 * control below it says who that one belongs to, so a salon with three had a
 * screen that discussed one of them and never said the other two existed.
 *
 * And nobody could find out how to get another. A business cannot buy one:
 * a UK number has to be registered to a real address before it can send
 * anything, which takes days and is ours to do. An owner with a new stylist
 * asking for her own line had no idea whether that was a thing she could have,
 * a thing to pay for, or a thing already included.
 *
 * Only ever the truth about this business. "Included in your subscription" is
 * said because it is, and asking is the whole of the process.
 */
export function YourNumbers({
  lines,
  business,
}: {
  lines: { id: string; externalId: string | null; forWho: string | null }[];
  business: string;
}) {
  if (lines.length === 0) return null;

  const shared = lines.filter((l) => !l.forWho);
  const given = lines.filter((l) => l.forWho);

  /*
   * The list only where there is a list.
   *
   * The panel above already shows the number and says what it does, so on a
   * business with one this would print it a second time under a heading that
   * says the same thing. The part that is missing on every business, one number
   * or five, is where another comes from.
   */
  const several = lines.length > 1;

  return (
    <div className="mt-5 rounded-xl border border-border bg-surface-2/50 px-4 py-3">
      {several && (
        <>
          <div className="label">Your {lines.length} numbers</div>

          <ul className="mt-2 space-y-1.5">
            {lines.map((l) => (
              <li key={l.id} className="flex flex-wrap items-baseline gap-x-2.5 text-sm">
                <span className="num font-medium">{readableNumber(l.externalId ?? "")}</span>
                <span className="hint">
                  {l.forWho ? `${l.forWho}'s own` : `${business}'s own`}
                </span>
              </li>
            ))}
          </ul>

          {/*
            * What each kind actually does, said once rather than per row.
            *
            * The difference is the only thing about a number that matters here
            * and it is invisible: the same number behaves completely
            * differently depending on whose it is, and nothing about the number
            * itself says which.
            */}
          <p className="hint mt-2.5 max-w-prose">
            {shared.length > 0 && (
              <>
                A customer writing to {shared.length === 1 ? "the" : "a"} {business} number is
                asked who they would like before anything is booked.
              </>
            )}
            {given.length > 0 && (
              <>
                {" "}
                Anything arriving on somebody&rsquo;s own number is theirs, and the assistant
                never asks.
              </>
            )}
          </p>
        </>
      )}

      {/*
        * How to get another, which was nowhere.
        *
        * Not a button, because there is nothing to press: a UK number has to be
        * registered to a real address before it can send anything. Saying what
        * actually happens is more use than a form that would sit there.
        */}
      <p className={`hint max-w-prose ${several ? "mt-2" : ""}`}>
        <strong className="text-foreground">Another one is included.</strong> Numbers come
        with your subscription, so if somebody new needs their own, ask us and we will set it
        up. It takes a few days, because a UK number has to be registered to a real address
        before it can send anything, and then it appears here ready to give to them.
      </p>
    </div>
  );
}
