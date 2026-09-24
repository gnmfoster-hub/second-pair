import type { SetupStep } from "@/lib/setupSteps";
import { StepLink } from "./StepLink";

/**
 * The walk-through's list, taken out of the page that used to own it.
 *
 * Giles: "fold the walk-through into the working page." It was its own route
 * at /setup, and two screens about being set up is one of the things he was
 * pointing at when he said the whole thing felt muddled. So the route is gone
 * and the list moved — same steps, same order, same "next" marker, rendered
 * inside the page that already answers everything else.
 *
 * Kept whole rather than rewritten. It is the only part of the product that
 * walks somebody through anything and it works; the problem was where it
 * lived, not what it did.
 */
export function SetupSteps({ steps, next }: { steps: SetupStep[]; next: SetupStep | null }) {
  return (
      <ol className="mt-6 space-y-2.5">
        {steps.map((step, i) => {
          const isNext = next?.key === step.key;
          return (
            <li
              key={step.key}
              className={`card flex gap-4 p-4 sm:p-5 ${isNext ? "border-accent/50 ring-1 ring-accent/20" : ""}`}
            >
              <span
                className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold ${
                  step.done ? "bg-ok/15 text-ok" : isNext ? "bg-accent text-on-accent" : "bg-surface-2 text-muted"
                }`}
                aria-hidden
              >
                {step.done ? "✓" : i + 1}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <h2 className={`font-medium ${step.done ? "text-muted" : ""}`}>{step.title}</h2>
                  {step.optional && <span className="pill bg-surface-2 text-[11px] text-muted">Optional</span>}
                  {step.done && <span className="sr-only">Done</span>}
                  {isNext && <span className="pill bg-accent/10 text-[11px] text-accent">Next</span>}
                </div>

                {/* The explanation only where it is still to do; a done step is a line. */}
                {!step.done && (
                  <>
                    <p className="hint mt-1 max-w-prose">{step.why}</p>
                    {step.todo && <p className="mt-1.5 max-w-prose text-sm text-warn">{step.todo}</p>}
                  </>
                )}

                <div className="mt-3">
                  <StepLink
                    href={step.href}
                    external={step.external}
                    className={
                      step.done
                        ? "text-sm text-muted underline-offset-2 hover:text-foreground hover:underline"
                        : isNext
                          ? "btn inline-flex bg-accent text-on-accent"
                          : "btn inline-flex border border-border"
                    }
                  >
                    {step.done ? "Look again" : step.action}
                  </StepLink>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
  );
}
