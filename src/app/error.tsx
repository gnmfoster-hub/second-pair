"use client";

import { useEffect } from "react";

/**
 * When a page falls over, said the way the pay pages say it.
 *
 * There was no error page, so any render failure on a public route — a
 * payment page, a form, somebody's marketing preferences — showed Next's
 * stock "Application error: a server-side exception has occurred" with a
 * digest id underneath. That is the framework talking, in a business's name,
 * to somebody who was halfway through paying them.
 *
 * Two things matter here and neither is technical: say plainly that nothing
 * has been charged or lost, and give them something to press. The digest goes
 * to the console for us, not onto the page for them.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[page]", error.digest ?? "", error.message);
  }, [error]);

  return (
    <div className="grid min-h-screen place-items-center px-6 text-center">
      <div className="max-w-sm">
        <h1 className="text-lg font-semibold tracking-tight">Something went wrong at our end</h1>
        <p className="hint mt-2">
          Nothing you were doing has been lost, and nothing has been charged. It is worth trying
          again &mdash; most of these pass on their own.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={reset} className="btn border border-border">
            Try again
          </button>
        </div>
        <p className="hint mt-4 text-xs">
          If it keeps happening, the business you were dealing with can still be reached the way
          you reached them before.
        </p>
      </div>
    </div>
  );
}
