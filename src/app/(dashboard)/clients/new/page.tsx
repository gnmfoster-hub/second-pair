import Link from "next/link";
import { NewClientForm } from "./NewClientForm";

export default function NewClientPage() {
  return (
    <div className="mx-auto max-w-2xl px-8 py-9">
      <Link href="/clients" className="hint hover:text-foreground">
        ← Clients
      </Link>

      <h1 className="page-title mt-3">Add a client</h1>
      <p className="hint mt-1 max-w-prose">
        For somebody who has never messaged you — a regular who books by walking in,
        or somebody you want to reach out to first.
      </p>

      <div className="mt-6">
        <NewClientForm />
      </div>
    </div>
  );
}
