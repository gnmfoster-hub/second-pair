"use client";

import { useActionState } from "react";
import { seedStarterBands, type FormState } from "../actions";
import { FormMessage, SubmitButton } from "@/components/Form";

export function SeedBands() {
  const [state, action] = useActionState<FormState, FormData>(seedStarterBands, {});

  return (
    <form action={action} className="border-t border-border px-5 py-4">
      <SubmitButton className="btn-ghost">Use the standard seven bands</SubmitButton>
      <p className="hint mt-2">
        Coin, palm, hand, forearm, half sleeve, full sleeve, back piece. Edit them after.
      </p>
      <div className="mt-2 empty:mt-0">
        <FormMessage state={state} />
      </div>
    </form>
  );
}
