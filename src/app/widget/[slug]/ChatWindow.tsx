"use client";

import { useEffect, useRef, useState } from "react";

type Line = { from: "client" | "studio"; text: string; images?: number };

const SESSION_KEY = "handled_session";

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
  const [pending, setPending] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [started, setStarted] = useState(false);
  const session = useRef<string>("");
  const bottom = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLInputElement>(null);

  useEffect(() => {
    session.current = sessionId();
  }, []);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines, sending]);

  function addFiles(files: FileList | null) {
    if (!files) return;
    setError("");
    const images = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (images.length !== files.length) setError("Images only, please.");
    setPending((p) => [...p, ...images].slice(0, 6));
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const message = draft.trim();
    if ((!message && pending.length === 0) || sending) return;

    const attached = pending;
    setLines((l) => [
      ...l,
      { from: "client", text: message, images: attached.length || undefined },
    ]);
    setDraft("");
    setPending([]);
    setSending(true);
    setError("");

    try {
      // The conversation has to exist before an image can be attached to it, so
      // the first message goes up on its own.
      let media: string[] = [];
      if (attached.length && started) media = await upload(attached);

      const response = await fetch("/api/widget/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studio: slug,
          session: session.current,
          message: message || "(sent an image)",
          media,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }

      setStarted(true);

      // Images picked before the conversation existed go up now, and the studio
      // is told about them on the next turn.
      if (attached.length && media.length === 0) {
        const late = await upload(attached);
        if (late.length) {
          await fetch("/api/widget/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              studio: slug,
              session: session.current,
              message: "(sent an image)",
              media: late,
            }),
          }).then(async (r) => {
            const d = await r.json();
            if (r.ok && d.reply) setLines((l) => [...l, { from: "studio", text: d.reply }]);
          });
          return;
        }
      }

      if (data.reply) {
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

  async function upload(files: File[]): Promise<string[]> {
    const paths: string[] = [];
    for (const file of files) {
      const form = new FormData();
      form.append("studio", slug);
      form.append("session", session.current);
      form.append("file", file);
      const response = await fetch("/api/widget/upload", { method: "POST", body: form });
      const data = await response.json();
      if (response.ok) paths.push(data.path);
      else setError(data.error ?? "That image would not upload.");
    }
    return paths;
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
            {line.images ? (
              <div className={line.text ? "mt-1 text-xs opacity-80" : "text-xs opacity-80"}>
                📎 {line.images} image{line.images > 1 ? "s" : ""} attached
              </div>
            ) : null}
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

      {pending.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t border-border px-3 pt-3">
          {pending.map((file, i) => (
            <span
              key={i}
              className="flex items-center gap-1.5 rounded-lg bg-surface-2 px-2 py-1 text-xs"
            >
              <span className="max-w-32 truncate">{file.name}</span>
              <button
                type="button"
                onClick={() => setPending((p) => p.filter((_, j) => j !== i))}
                className="text-muted hover:text-accent"
                aria-label={`Remove ${file.name}`}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      <form onSubmit={send} className="flex items-center gap-2 border-t border-border p-3">
        <input
          ref={picker}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => picker.current?.click()}
          className="btn-ghost px-3"
          aria-label="Attach reference images"
          title="Attach reference images"
        >
          📎
        </button>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a message…"
          className="input flex-1"
          maxLength={2000}
          autoFocus
        />
        <button
          type="submit"
          className="btn-primary"
          disabled={sending || (!draft.trim() && pending.length === 0)}
        >
          Send
        </button>
      </form>
    </div>
  );
}
