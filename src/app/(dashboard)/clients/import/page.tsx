import Link from "next/link";
import { requireStudio } from "@/lib/studio";
import { wordsFor } from "@/lib/words";
import { ImportClients } from "./ImportClients";

export const metadata = { title: "Bring in a client list" };

/**
 * The screen that lets somebody switch.
 *
 * A business with four hundred customers in another system is not going to
 * retype them, so without this the honest pitch is "try it, but start empty" —
 * and that is the end of most conversations, whatever the rest of the product
 * does. Everything else here is about answering enquiries; this is about being
 * able to take the job on at all.
 */
export default async function ImportPage() {
  const { studio } = await requireStudio();
  const words = wordsFor(studio);

  return (
    <div className="mx-auto max-w-4xl px-8 py-9">
      <Link href="/clients" className="hint text-sm">
        ← {capital(words.customers)}
      </Link>

      <h1 className="mt-2 text-2xl font-semibold">Bring in a {words.customer} list</h1>
      <p className="hint mt-1 max-w-prose">
        From Fresha, Treatwell, Booksy, an old spreadsheet — anything that gives you a csv file.
        Nothing is changed in the system you are coming from; this only reads what it gave you.
      </p>

      <div className="mt-6">
        <ImportClients words={{ customers: words.customers, customer: words.customer }} />
      </div>
    </div>
  );
}

function capital(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
