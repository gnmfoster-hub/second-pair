"use client";

import { useEffect, useRef, useState } from "react";
import { colourFor, initialsFor } from "@/components/Avatar";

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

const ClipIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" {...stroke}>
    <path d="M20 11.5 12.2 19.3a4.6 4.6 0 0 1-6.5-6.5l7.8-7.8a3 3 0 1 1 4.3 4.3l-7.8 7.8a1.5 1.5 0 0 1-2.1-2.1l7.2-7.2" />
  </svg>
);

const SendIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" {...stroke}>
    <path d="M4 12h13M12.5 6.5 18.5 12l-6 5.5" />
  </svg>
);

const CloseIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" {...stroke}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

type Line = { from: "client" | "studio"; text: string; images?: number };

/**
 * Turns URLs in a reply into links you can actually tap.
 *
 * Built from the text rather than rendered as HTML: everything here came back
 * from a model, and nothing it writes should ever be interpreted as markup.
 */
function withLinks(text: string, onDark: boolean) {
  const parts = text.split(/(https?:\/\/[^\s<>"']+)/g);
  return parts.map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className={`underline underline-offset-2 ${onDark ? "text-white" : "text-accent"}`}
      >
        {part.replace(/^https?:\/\//, "").replace(/\/$/, "")}
      </a>
    ) : (
      part
    ),
  );
}

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

export function ChatWindow({
  slug,
  studioName,
  greeting,
}: {
  slug: string;
  studioName: string;
  greeting: string;
}) {
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
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <span
          className="grid size-9 shrink-0 place-items-center rounded-full text-sm font-semibold text-white"
          style={{ background: colourFor(studioName) }}
          aria-hidden
        >
          {initialsFor(studioName)}
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{studioName}</div>
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <span className="size-1.5 rounded-full bg-ok" aria-hidden />
            Usually replies in under a minute
          </div>
        </div>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {lines.length === 0 && (
          <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-surface-2 px-3.5 py-2.5 text-sm">
            {greeting}
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
            {withLinks(line.text, line.from === "client")}
            {line.images ? (
              <div className={line.text ? "mt-1 text-xs opacity-80" : "text-xs opacity-80"}>
                {line.images} image{line.images > 1 ? "s" : ""} attached
              </div>
            ) : null}
          </div>
        ))}

        {sending && (
          <div className="w-fit rounded-2xl rounded-tl-sm bg-surface-2 px-4 py-3.5">
            <span className="flex gap-1" role="status" aria-label="Typing">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="size-1.5 animate-bounce rounded-full bg-muted/70"
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
                className="text-muted hover:text-bad"
                aria-label={`Remove ${file.name}`}
              >
                <CloseIcon />
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
          className="btn-ghost shrink-0 px-2.5"
          aria-label="Attach photos"
          title="Attach photos"
        >
          <ClipIcon />
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
          className="btn-primary shrink-0 px-3"
          aria-label="Send"
          disabled={sending || (!draft.trim() && pending.length === 0)}
        >
          <SendIcon />
        </button>
      </form>
    </div>
  );
}
