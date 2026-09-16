import Link from "next/link";

export const metadata = { title: "Not found" };

/**
 * A page that is not there, said in our own words.
 *
 * There was no not-found page at all, so a retired booking link, a mistyped
 * slug off a van or a QR code, or an old address in an Instagram bio landed on
 * Next's stock "404 | This page could not be found." — the framework talking
 * to a member of the public on a business's behalf.
 *
 * Deliberately says nothing about what they were looking for. Whoever they
 * are, the useful information is the same: it is not here, nothing is wrong
 * with them, and the business is still reachable.
 */
export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center px-6 text-center">
      <div className="max-w-sm">
        <h1 className="text-lg font-semibold tracking-tight">That page is not here</h1>
        <p className="hint mt-2">
          The link may be an old one, or have a character missing. Nothing has gone wrong at your
          end.
        </p>
        <p className="hint mt-3">
          If you were trying to reach a business, the best way back is the link they sent you, or
          their own website.
        </p>
        <Link href="/" className="btn mt-6 inline-flex border border-border">
          Second Pair
        </Link>
      </div>
    </div>
  );
}
