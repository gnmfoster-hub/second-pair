"use client";

import { useActionState } from "react";
import { saveFaq, deleteFaq, type FormState } from "../actions";
import { FormMessage, SubmitButton } from "@/components/Form";
import type { Faq } from "@/lib/types";

export function FaqEditor({ faq, index }: { faq?: Faq; index: number }) {
  const [state, action] = useActionState<FormState, FormData>(saveFaq, {});

  return (
    <form action={action} className="card space-y-3 p-5">
      {faq && <input type="hidden" name="id" value={faq.id} />}
      <input type="hidden" name="sort_order" value={faq?.sort_order ?? index} />

      <input
        name="question"
        defaultValue={faq?.question ?? ""}
        placeholder="Do you do walk-ins?"
        className="input"
        required
      />
      <textarea
        name="answer"
        defaultValue={faq?.answer ?? ""}
        placeholder="Answer in the studio's own words. The assistant will use this near-verbatim."
        rows={3}
        className="input"
        required
      />

      <div className="flex items-center gap-4">
        <SubmitButton className="btn-ghost">{faq ? "Save" : "Add FAQ"}</SubmitButton>
        <FormMessage state={state} />
        <div className="flex-1" />
        {faq && (
          <button type="submit" formAction={deleteFaq} formNoValidate className="btn-danger">
            Remove
          </button>
        )}
      </div>
    </form>
  );
}
