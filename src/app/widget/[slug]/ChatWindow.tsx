"use client";

import { useEffect, useRef, useState } from "react";

type Line = { from: "client" | "studio"; text: string };

const SESSION_KEY = "inkdesk_session";

function sessionId(): string {
  try {
    const existing = localStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const fresh = crypto.randomUUID().replace(/-/g, "");
    localStorage.setItem(SESSION_KEY, fresh);
    return fresh;
  } catch {
    // Private browsing, or storage blocked: the conversation just will not
    // survive a refresh.
    return crypto.randomUUID().replace(/-/g, "");
  }
}

export function ChatWindow({ slug, studioName }: { slug: string; studioName: string }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const session = useRef<string>("");
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    session.current = sessionId();
  }, []);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines, sending]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const message = draft.trim();
    if (!message || sending) return;

    setLines((l) => [...l, { from: "client", text: message }]);
    setDraft("");
    setSending(true);
    setError("");

    try {
      const response = await fetch("/api/widget/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studio: slug, session: session.current, message }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Something went wrong.");
      } else if (data.reply) {
        setLines((l) => [...l, { from: "studio", text: data.reply }]);
      } else if (data.paused) {
        setLines((l) => [
          ...l,
          { from: "studio", text: `Thanks — someone at ${studioName} will reply here shortly.` },
        ]);
      }
    } catch {
      setError("Could not reach the studio. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-screen flex-col bg-surface">
      <header className="border-b border-border px-4 py-3">
        <div className="text-sm font-medium">{studioName}</div>
        <div className="hint">Usually replies in under a minute</div>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {lines.length === 0 && (
          <div className="rounded-2xl rounded-tl-sm bg-surface-2 px-3.5 py-2.5 text-sm">
            Hi — what were you thinking of getting done?
          </div>
        )}

        {lines.map((line, i) => (
          <div
            key={i}
            className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm ${
              line.from === "client"
                ? "ml-auto rounded-br-sm bg-accent text-white"
                : "rounded-tl-sm bg-surface-2"
            }`}
          >
            {line.text}
          </div>
        ))}

        {sending && (
          <div className="w-16 rounded-2xl rounded-tl-sm bg-surface-2 px-3.5 py-3">
            <span className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="size-1.5 animate-pulse rounded-full bg-muted"
                  style={{ animationDelay: `${i * 150}ms` }}
                />
              ))}
            </span>
          </div>
        )}

        {error && <div className="text-xs text-accent">{error}</div>}
        <div ref={bottom} />
      </div>

      <form onSubmit={send} className="flex gap-2 border-t border-border p-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a message…"
          className="input flex-1"
          maxLength={2000}
          autoFocus
        />
        <button type="submit" className="btn-primary" disabled={sending || !draft.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
