"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Talking to your own assistant.
 *
 * The pricing page already shows the owner what will be quoted before it is
 * quoted. This is the same idea applied to the whole conversation: wrong
 * opening hours, a missing FAQ or a rate left at the default all look fine in
 * a settings form and are obvious the moment somebody asks a question.
 *
 * These are real calls to the real assistant with the real settings — not a
 * simulation — so what it says here is exactly what a customer would get.
 * They are flagged as tests, so they never reach the inbox, the client list or
 * any figure.
 */
type Line = { from: "you" | "them"; text: string };

const PROMPTS = [
  "How much would it be?",
  "What have you got free this week?",
  "Do you take walk-ins?",
  "Can I pay a deposit?",
];

export function TryIt({ slug }: { slug: string }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const session = useRef("");
  const bottom = useRef<HTMLDivElement>(null);

  // A fresh session each time the panel mounts, so the owner is not resuming
  // yesterday's rehearsal and wondering why it already knows their name.
  useEffect(() => {
    session.current = `test${crypto.randomUUID().replace(/-/g, "")}`.slice(0, 32);
  }, []);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines, sending]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || sending) return;

    setLines((l) => [...l, { from: "you", text: message }]);
    setDraft("");
    setSending(true);
    setError("");

    try {
      const response = await fetch("/api/widget/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studio: slug,
          session: session.current,
          message,
          test: true,
        }),
      });
      const data = await response.json();

      if (!response.ok) setError(data.error ?? "Something went wrong.");
      else if (data.reply) setLines((l) => [...l, { from: "them", text: data.reply }]);
      else if (data.paused) {
        setLines((l) => [
          ...l,
          {
            from: "them",
            text: "(handed over — the assistant stops here and fetches you)",
          },
        ]);
      }
    } catch {
      setError("Could not reach the assistant.");
    } finally {
      setSending(false);
    }
  }

  const reset = () => {
    session.current = `test${crypto.randomUUID().replace(/-/g, "")}`.slice(0, 32);
    setLines([]);
    setError("");
  };

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 p-6 pb-4">
        <div className="min-w-0">
          <h2 className="section-title">Try it yourself</h2>
          <p className="hint mt-1 max-w-prose">
            Ask it something a customer would. This is your real assistant with your real
            settings, so what it says here is what they will get —{" "}
            <strong className="text-foreground">but it never reaches your inbox</strong>.
          </p>
        </div>
        {lines.length > 0 && (
          <button type="button" onClick={reset} className="btn-ghost shrink-0">
            Start again
          </button>
        )}
      </div>

      <div className="max-h-80 space-y-2.5 overflow-y-auto border-t border-border bg-surface-2/30 px-5 py-4">
        {lines.length === 0 && (
          <div className="py-2">
            <p className="hint mb-3">Try one of these, or type your own:</p>
            <div className="flex flex-wrap gap-2">
              {PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => send(prompt)}
                  className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium transition-colors hover:border-accent hover:text-accent"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {lines.map((line, i) => (
          <div
            key={i}
            className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
              line.from === "you"
                ? "ml-auto rounded-br-md bg-accent text-white"
                : "rounded-bl-md bg-surface text-foreground shadow-[var(--shadow-card)]"
            }`}
          >
            {line.text}
          </div>
        ))}

        {sending && (
          <div className="w-fit rounded-2xl rounded-bl-md bg-surface px-4 py-3.5 shadow-[var(--shadow-card)]">
            <span className="flex gap-1" role="status" aria-label="Thinking">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="size-1.5 rounded-full bg-muted/70 motion-safe:animate-bounce"
                  style={{ animationDelay: `${i * 140}ms`, animationDuration: "1s" }}
                />
              ))}
            </span>
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-warn/10 px-3 py-2 text-xs text-warn">{error}</div>
        )}
        <div ref={bottom} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
        className="flex items-center gap-2 border-t border-border p-3"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask it something…"
          className="input flex-1"
          maxLength={500}
        />
        <button
          type="submit"
          className="btn-primary shrink-0"
          disabled={sending || !draft.trim()}
        >
          Send
        </button>
      </form>
    </div>
  );
}
