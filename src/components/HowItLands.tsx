"use client";

import { useState } from "react";
import { buildEmail } from "@/lib/messaging/emailTemplate";
import { forOneText } from "@/lib/reminderText";

/**
 * What the customer actually gets, on both channels.
 *
 * Giles: can we see the email that goes out, in templates, for all outgoing,
 * so the user can see it. The reminder editor already drew a phone — that was
 * the right instinct and it was half the story, because the same wording
 * arrives as an email for anybody who came in by email, and nobody had ever
 * seen what that looked like.
 *
 * Both halves are rendered by the code that sends them. forOneText is the
 * function that decides what fits in one text; buildEmail is the function that
 * builds the email. The editor's own comment already says a preview that
 * renders a template its own way is a preview that can be wrong, and an email
 * preview drawn from a second copy of that markup would be wrong the first
 * time either changed.
 *
 * The email goes in an iframe with srcDoc. It is a whole document with its own
 * body and its own styles, and dropping that into the page would have an email
 * template quietly restyling the settings screen around it.
 */
export function HowItLands({
  /** The message, already filled in with the stand-in name and time. */
  text,
  business,
  photoUrl,
  policy,
  action,
  /** Which channels this one can actually go out on. */
  channels = ["sms", "email"],
}: {
  text: string;
  business: string;
  photoUrl?: string | null;
  policy?: string | null;
  action?: { label: string; url: string } | null;
  channels?: ("sms" | "email")[];
}) {
  const [showing, setShowing] = useState<"sms" | "email">(channels[0] ?? "sms");

  /*
   * What a text actually carries, not what was typed.
   *
   * A reminder past a hundred and sixty characters is billed as two, and
   * forOneText cuts between sentences rather than mid-word. Showing the whole
   * thing on the phone would be showing something that does not arrive.
   */
  const onePhone = forOneText(text);
  const trimmed = onePhone !== text.trim();

  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="label mb-0">How it lands</span>
        {channels.length > 1 && (
          <span className="ml-auto flex gap-1">
            {channels.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setShowing(c)}
                className={`pill text-[11px] ${
                  showing === c ? "bg-accent text-on-accent" : "bg-surface-2 text-muted"
                }`}
              >
                {c === "sms" ? "As a text" : "As an email"}
              </button>
            ))}
          </span>
        )}
      </div>

      {showing === "sms" ? (
        <div className="mt-1.5 max-w-sm rounded-2xl border border-border bg-surface-2/50 p-3">
          <div className="mt-1.5 rounded-2xl rounded-bl-md bg-surface px-3.5 py-2.5 text-sm leading-relaxed shadow-sm">
            {onePhone || <span className="text-muted">Nothing yet.</span>}
          </div>
          <div className="hint mt-1.5 text-right tabular-nums">
            {onePhone.length} characters
            {onePhone.length > 160 && (
              <span className="text-warn">
                , over 160, so it is charged as {Math.ceil(onePhone.length / 153)} texts
              </span>
            )}
          </div>
          {trimmed && (
            <p className="hint mt-1.5">
              Cut to fit one text. The whole message still goes by email and in the
              conversation; only the text is shortened, and only between sentences.
            </p>
          )}
        </div>
      ) : (
        <div className="mt-1.5 overflow-hidden rounded-2xl border border-border">
          <iframe
            title="How the email looks"
            className="block h-[420px] w-full bg-white"
            /* No scripts, and nothing from the page reaches inside it. */
            sandbox=""
            srcDoc={buildEmail({ business, body: text, photoUrl, policy, action })}
          />
        </div>
      )}
    </div>
  );
}
