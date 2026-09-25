"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { forgetDevice, type DeviceState } from "./deviceActions";

/**
 * Forget one device.
 *
 * No confirmation dialog. This is reversible in one tap from the device
 * itself, and a dialog over an action that cannot lose anything is the kind of
 * friction that makes a person leave a dead phone on the list forever — which
 * is the thing this screen exists to fix.
 */
export function ForgetDevice({ id, name }: { id: string; name: string }) {
  const [state, action] = useActionState<DeviceState, FormData>(forgetDevice, {});

  return (
    <form action={action} className="flex items-baseline gap-2">
      <input type="hidden" name="id" value={id} />
      <Button name={name} />
      {state.error && <span className="text-xs text-bad">{state.error}</span>}
    </form>
  );
}

function Button({ name }: { name: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-sm text-muted hover:text-foreground disabled:opacity-60"
    >
      {/* Named, because two rows of identical "Forget" links on a phone is how
          somebody removes the wrong one. Read out in full by a screen reader,
          and clipped to "Forget" by eye. */}
      Forget<span className="sr-only"> {name}</span>
    </button>
  );
}
