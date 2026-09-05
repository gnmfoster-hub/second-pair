"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { initialsFor } from "@/components/Avatar";
import { MomentCard } from "./Moments";
import type { Moment } from "@/lib/engine/moments";
import { retires, withoutLink } from "@/lib/conversationCards";

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

const ClipIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" {...stroke}>
    <path d="M20 11.5 12.2 19.3a4.6 4.6 0 0 1-6.5-6.5l7.8-7.8a3 3 0 1 1 4.3 4.3l-7.8 7.8a1.5 1.5 0 0 1-2.1-2.1l7.2-7.2" />
  </svg>
);

const SendIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" {...stroke} strokeWidth={2}>
    <path d="M4.5 12h13M12 6.5 17.5 12 12 17.5" />
  </svg>
);

const CloseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" {...stroke} strokeWidth={2}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

/** Two ticks, the universal "it got there". */
const TickIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" {...stroke} strokeWidth={2.2}>
    <path d="M2 13l4 4 8-9M11.5 16.5l1.5 1.5 8-9" />
  </svg>
);

type Line = {
  from: "client" | "studio";
  text: string;
  /** Object URLs for anything attached, so it shows as a picture not a filename. */
  photos?: string[];
  /**
   * What the assistant did on this turn, drawn under the words.
   *
   * Attached to the line rather than held in one place, so scrolling back to an
   * earlier price or an earlier set of times shows what was on offer then —
   * and so a second set of times replaces the buttons rather than adding to
   * them further down.
   */
  moments?: Moment[];
  at: number;
};

/**
 * Turns URLs in a reply into links you can actually tap.
 *
 * Built from the text rather than rendered as HTML: everything here came back
 * from a model, and nothing it writes should ever be interpreted as markup.
 *
 * Bold is the one exception, and only the **double-asterisk** kind — models
 * reach for it constantly when quoting a price, and leaving the asterisks on
 * screen looks broken to somebody who has never seen markdown.
 */
function withLinks(text: string, onDark: boolean) {
  return text.split(/(https?:\/\/[^\s<>"']+|\*\*[^*]+\*\*)/g).map((part, i) => {
    if (/^https?:\/\//.test(part)) {
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className={`font-medium underline underline-offset-2 ${
            onDark ? "text-white" : "text-[var(--brand)]"
          }`}
        >
          {part.replace(/^https?:\/\//, "").replace(/\/$/, "")}
        </a>
      );
    }
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      return (
        <strong key={i} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

/**
 * What to say when you do not know what to say.
 *
 * Deliberately phrased as the customer, not as a menu: each one is a real
 * first message that the assistant can answer properly, and none of them
 * commit anybody to anything.
 */
/*
 * What to offer somebody who has not typed yet.
 *
 * These are right for a customer of a salon and nonsense for anybody using the
 * help assistant, who is not going to ask a support desk what it charges. The
 * page works out which set applies and passes them in; this is only the
 * fallback for a business that has nothing better to offer.
 */
const OPENERS = ["How much would it be?", "What have you got free?", "I've got a question"];

/*
 * One key per business.
 *
 * Every business embeds this widget from the same origin, so they all share a
 * single localStorage. An unscoped key therefore followed a customer from one
 * business's site to the next and resumed the wrong conversation.
 */
const sessionKeyFor = (slug: string) => `secondpair_session_${slug}`;

function sessionId(slug: string): string {
  const key = sessionKeyFor(slug);
  try {
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const fresh = crypto.randomUUID().replace(/-/g, "");
    localStorage.setItem(key, fresh);
    return fresh;
  } catch {
    // Private browsing, or storage blocked: the conversation just will not
    // survive a refresh.
    return crypto.randomUUID().replace(/-/g, "");
  }
}

const clock = (at: number) =>
  new Date(at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

export function ChatWindow({
  slug,
  studioName,
  privacyUrl,
  greeting,
  openers,
  forArtistId = null,
  forArtistName = null,
  photoUrl = null,
  accent = null,
  onAccent = null,
}: {
  slug: string;
  studioName: string;
  /** Their own notice, when they have published one. */
  privacyUrl?: string | null;
  greeting: string;
  /** Three things worth tapping. Falls back to the customer-facing set. */
  openers?: string[];
  /** Set when this link is one person's own. Every enquiry here is theirs. */
  forArtistId?: string | null;
  forArtistName?: string | null;
  photoUrl?: string | null;
  /** The business's own colour, from the script tag on their site. */
  accent?: string | null;
  onAccent?: string | null;
}) {
  const [lines, setLines] = useState<Line[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  /*
   * Is there a frame around us?
   *
   * This decides whether to draw a close button, and it cannot be answered on
   * the server: the same page is both an iframe on somebody's website and a
   * link in an Instagram bio. Read through useSyncExternalStore rather than an
   * effect, which is the one way to take a value from outside React without
   * either a second render or a hydration mismatch — it is told the server's
   * answer (no frame) and the browser's, and reconciles them itself.
   */
  const embedded = useSyncExternalStore(
    // Nothing to subscribe to: a page does not change whether it is framed.
    () => () => {},
    () => {
      try {
        return window.parent !== window;
      } catch {
        // A cross-origin parent throws on access, which is itself the answer.
        return true;
      }
    },
    () => false,
  );

  /*
   * Has a person taken this one over?
   *
   * The line under the name said "Answering now" whatever was happening, which
   * is wrong in the one case it matters: once the assistant hands over it is
   * deliberately silent, and telling somebody they are being answered now while
   * nobody is answering is how a wait turns into a complaint.
   */
  const [handedOver, setHandedOver] = useState(false);
  const [error, setError] = useState("");
  const [started, setStarted] = useState(false);
  const session = useRef<string>("");
  const thread = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLInputElement>(null);

  // Who the customer thinks they are talking to. A person's own link shows
  // that person; the shop's link shows the shop.
  const who = forArtistName ?? studioName;
  /*
   * Their colour if they set one, ours if they did not.
   *
   * Falling back to a colour derived from the business name gave whoever
   * pasted the plain one-liner a random purple, which reads as accidental.
   * Forest is at least a decision.
   */
  const brand = accent ?? "#14243f";
  const onBrand = onAccent ?? "#ffffff";

  useEffect(() => {
    session.current = sessionId(slug);
  }, [slug]);

  useEffect(() => {
    /*
     * Scroll our own box, not the page around it.
     *
     * This was scrollIntoView, which by definition scrolls every scrollable
     * ancestor until the element is visible — and inside an iframe those
     * ancestors include the host page. So sending a message on a website that
     * had embedded the widget scrolled the website, which is somebody else's
     * page lurching under their visitor because our chat did something.
     *
     * Setting scrollTop moves this container and nothing else. It also cannot
     * be smooth on its own, which is the only thing lost — and a thread that
     * snaps to the newest message is what every messaging app does anyway.
     */
    const el = thread.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, sending]);

  // Object URLs are a browser resource, not a value — they leak until revoked.
  const previews = useMemo(() => pending.map((f) => URL.createObjectURL(f)), [pending]);
  useEffect(() => () => previews.forEach(URL.revokeObjectURL), [previews]);

  function addFiles(files: FileList | null) {
    if (!files) return;
    setError("");
    const images = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (images.length !== files.length) setError("Photos only, please.");
    setPending((p) => [...p, ...images].slice(0, 6));
  }

  async function send(e?: React.FormEvent, preset?: string) {
    e?.preventDefault();
    const message = (preset ?? draft).trim();
    if ((!message && pending.length === 0) || sending) return;

    const attached = pending;
    const shots = attached.map((f) => URL.createObjectURL(f));
    setLines((l) => [
      ...l,
      { from: "client", text: message, photos: shots.length ? shots : undefined, at: Date.now() },
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
          message: message || "(sent a photo)",
          media,
          with: forArtistId,
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
              message: "(sent a photo)",
              media: late,
              with: forArtistId,
            }),
          }).then(async (r) => {
            const d = await r.json();
            if (r.ok && d.reply) {
              setLines((l) => [...l, { from: "studio", text: d.reply, at: Date.now() }]);
              window.parent?.postMessage({ secondPair: "reply" }, "*");
            }
          });
          return;
        }
      }

      if (data.reply) {
        setLines((l) => [
          ...l,
          { from: "studio", text: data.reply, moments: data.moments, at: Date.now() },
        ]);
        // Tells the launcher on the host page that something arrived, so a
        // closed widget can show an unread dot instead of sitting silent.
        window.parent?.postMessage({ secondPair: "reply" }, "*");
      } else if (data.paused) {
        setHandedOver(true);
        setLines((l) => [
          ...l,
          {
            from: "studio",
            text: `Thanks — someone at ${studioName} will reply here shortly.`,
            at: Date.now(),
          },
        ]);
      }
    } catch {
      setError("Could not reach them. Please try again.");
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
      else setError(data.error ?? "That photo would not upload.");
    }
    return paths;
  }

  return (
    <div
      /*
       * Two things, both only visible on the shareable link rather than the
       * embedded widget.
       *
       * max-w-2xl: inside a business's website the frame is about 380px and
       * this never binds. Opened as a link on a desktop it was a chat stretched
       * across the whole monitor, with the bubbles stranded at one edge.
       *
       * h-dvh rather than h-screen: on iOS Safari 100vh includes the space the
       * address bar occupies, so the composer sat underneath it and the last
       * thing typed could not be seen. The link goes in an Instagram bio, so
       * a phone is where most people will open it.
       */
      className="mx-auto flex h-dvh w-full max-w-2xl flex-col bg-background sm:border-x sm:border-border"
      style={{ ["--brand" as string]: brand, ["--on-brand" as string]: onBrand }}
    >
      {/*
        * No title bar.
        *
        * A solid coloured bar across the top with an avatar, a name and a
        * close button is what every chat widget on the internet looks like —
        * Intercom, Crisp, Tidio, Drift, all of them — and it costs about a
        * fifth of the height of a phone screen to say something the customer
        * already knows: whose website they are on.
        *
        * Instead the conversation runs the full height of the panel and the
        * identity floats over it on a piece of frosted glass, with the
        * messages passing underneath. It gives the space back to the thing
        * people are here for, and it stops the widget announcing itself as a
        * widget the moment it opens.
        */}
      {/* ──────────────────────────────────────────────────────────── thread */}
      <div className="relative flex-1 overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start gap-2 p-3">
          <div className="pointer-events-auto flex min-w-0 items-center gap-2.5 rounded-full border border-border bg-surface/75 py-1.5 pl-1.5 pr-4 shadow-[var(--shadow-card)] backdrop-blur-xl">
            <span className="relative shrink-0">
              <span
                className="grid size-8 place-items-center overflow-hidden rounded-full text-[11px] font-semibold"
                style={{ background: brand, color: onBrand }}
                aria-hidden
              >
                {photoUrl ? (
                  // Supabase serves these; next/image would need the host
                  // allow-listed and buys nothing for a 32px circle.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoUrl} alt="" className="size-full object-cover" />
                ) : (
                  initialsFor(who)
                )}
              </span>
            </span>

            <div className="min-w-0">
              <div className="truncate text-[0.8rem] font-semibold leading-tight">{who}</div>
              {/*
                * A state, not a promise.
                *
                * This said "usually replies in under a minute", which is a
                * claim the customer has no way to check and which reads as
                * marketing. What is true and useful is whether anything is
                * happening right now — and while it composes a reply, the same
                * two dots that make up the mark do the saying.
                */}
              <div className="flex items-center gap-1.5 text-[0.68rem] leading-tight text-muted">
                {sending ? (
                  <>
                    <span className="flex gap-[3px]" aria-hidden>
                      {[0, 1].map((d) => (
                        <span
                          key={d}
                          className="breathe size-[3px] rounded-full"
                          style={{ background: brand, animationDelay: `${d * 400}ms` }}
                        />
                      ))}
                    </span>
                    Typing
                  </>
                ) : (
                  <>
                    <span
                      className={`size-1.5 rounded-full ${handedOver ? "bg-warn" : "bg-[#22c55e]"}`}
                      aria-hidden
                    />
                    {handedOver
                      ? `Someone at ${studioName} is replying`
                      : forArtistName
                        ? studioName
                        : "Answering now"}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Only when there is something to close. Opened directly from a
              link there is no parent frame, and a button that does nothing
              is worse than no button. */}
          {embedded && (
            <button
              type="button"
              onClick={() => window.parent?.postMessage({ secondPair: "close" }, "*")}
              className="pointer-events-auto ml-auto grid size-9 shrink-0 place-items-center rounded-full border border-border bg-surface/75 text-muted shadow-[var(--shadow-card)] backdrop-blur-xl transition-colors hover:text-foreground"
              aria-label="Close chat"
            >
              <CloseIcon />
            </button>
          )}
        </div>

        <div ref={thread} className="h-full space-y-1 overflow-y-auto px-3.5 pb-4 pt-[4.5rem]">
          {lines.length === 0 && (
            <>
              <Bubble from="studio" first last who={who} photoUrl={photoUrl}>
                {greeting}
              </Bubble>

              {/*
               * The hardest part of any chat widget is the blank box. Somebody
               * who half-wants a price will not compose a sentence to get one,
               * so these do it for them — and each one starts a real
               * conversation rather than opening a menu.
               */}
              {/*
                * Who they are talking to, said once, before they say anything.
                *
                * A member of the public is about to give their name and phone
                * number to something that answers instantly and writes like a
                * person. They are entitled to know it is not one, and to know
                * where to read what happens to what they type — at the moment
                * they are deciding whether to type it, not in a footer on a
                * different page.
                *
                * One quiet line rather than a banner or a box to dismiss. It
                * is a fact about the conversation, not a warning about it, and
                * anything that has to be dismissed teaches people to dismiss
                * things.
                */}
              <p className="pl-10 pt-1.5 text-[11px] leading-relaxed text-muted">
                You are talking to {studioName}&rsquo;s assistant, not a person. A real
                one sees everything and can step in.
                {privacyUrl && (
                  <>
                    {" "}
                    <a
                      href={privacyUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-2 hover:text-foreground"
                    >
                      What happens to your details
                    </a>
                  </>
                )}
              </p>

              <div className="flex flex-wrap gap-2 pl-10 pt-2">
                {(openers?.length ? openers : OPENERS).map((opener, i) => (
                  <button
                    key={opener}
                    type="button"
                    onClick={() => send(undefined, opener)}
                    // Thirty pixels tall, and the first thing a customer is
                    // invited to tap. On a phone that is a miss waiting to
                    // happen, on the one screen where a miss costs an enquiry.
                    className="min-h-11 rounded-full border border-border bg-surface px-4 py-2.5 text-xs font-medium transition-all hover:-translate-y-px hover:border-[var(--brand)] hover:text-[var(--brand)] motion-safe:animate-[rise_260ms_ease-out_both]"
                    style={{ animationDelay: `${120 + i * 70}ms` }}
                  >
                    {opener}
                  </button>
                ))}
              </div>
            </>
          )}

          {lines.map((line, i) => {
            const prev = lines[i - 1];
            const next = lines[i + 1];
            // Consecutive messages from the same side are one group: one
            // avatar, one timestamp, tails only on the ends. It reads as a
            // conversation rather than a stack of receipts.
            const first = !prev || prev.from !== line.from;
            const last = !next || next.from !== line.from;

            /*
             * A card is a control, not a record.
             *
             * The assistant will happily look the diary up twice in one
             * conversation, and each turn brought its own card — so the same
             * four times sat in the transcript twice over, the earlier set
             * dead. Worse than untidy: a customer scrolling back and tapping
             * one would be asking for a slot that was withdrawn.
             *
             * So only the newest card of each kind is drawn. Nothing is lost —
             * the words above it are still there, and they said the times, the
             * price and the booking in full. What the card adds is the ability
             * to act, and that only ever belongs to the latest one.
             */
            const live = (line.moments ?? []).filter(
              (m) =>
                !lines.some((l, j) => j > i && l.moments?.some((n) => retires(n.kind, m.kind))),
            );

            const paying = live.find((m) => m.kind === "deposit");
            const shown = paying ? withoutLink(line.text, paying.url) : line.text;

            return (
              <div key={i} className="contents">
                <Bubble
                  from={line.from}
                  first={first}
                  last={last}
                  who={who}
                  photoUrl={photoUrl}
                  at={last ? line.at : undefined}
                  photos={line.photos}
                >
                  {shown}
                </Bubble>

                {live.length ? (
                  <div className="flex flex-col gap-2 pl-9 pt-0.5">
                    {live.map((moment, m) => (
                      <MomentCard
                        key={m}
                        moment={moment}
                        brand={brand}
                        onBrand={onBrand}
                        disabled={sending}
                        onPick={(message) => send(undefined, message)}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}

          {sending && (
            <div className="flex items-end gap-2 pt-1">
              <Face who={who} photoUrl={photoUrl} />
              {/* No bubble here either — the assistant has none, and a box
                  that appears only while it is thinking would flash a
                  container in and out on every reply. */}
              <div className="py-2.5">
                <span className="flex gap-1" role="status" aria-label="Typing">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="size-1.5 rounded-full bg-muted/70 motion-safe:animate-bounce"
                      style={{ animationDelay: `${i * 140}ms`, animationDuration: "1s" }}
                    />
                  ))}
                </span>
              </div>
            </div>
          )}

          {error && (
            <div className="mx-auto w-fit rounded-full bg-warn/10 px-3 py-1.5 text-xs text-warn">
              {error}
            </div>
          )}
        </div>

        {/* Tells you there is more above without a scrollbar doing it. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-16 bg-gradient-to-b from-background via-background/85 to-transparent" />
      </div>

      {/* ───────────────────────────────────────────────────────── composer */}
      {pending.length > 0 && (
        <div className="flex shrink-0 flex-wrap gap-2 border-t border-border px-3.5 pt-3">
          {pending.map((file, i) => (
            <span key={i} className="group relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previews[i]}
                alt={file.name}
                className="size-14 rounded-xl border border-border object-cover"
              />
              <button
                type="button"
                onClick={() => setPending((p) => p.filter((_, j) => j !== i))}
                className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-foreground text-background shadow"
                aria-label={`Remove ${file.name}`}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" {...stroke} strokeWidth={3}>
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}

      <form onSubmit={send} className="shrink-0 px-3.5 pb-3.5 pt-3">
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

        <div className="flex items-end gap-1.5 rounded-2xl border border-border bg-surface p-1.5 transition-colors focus-within:border-[var(--brand)]">
          <button
            type="button"
            onClick={() => picker.current?.click()}
            className="grid size-9 shrink-0 place-items-center rounded-xl text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
            aria-label="Attach photos"
            title="Attach photos"
          >
            <ClipIcon />
          </button>

          {/*
           * A textarea rather than an input, so a long message is readable
           * while it is being typed. Enter sends, shift-enter makes a new line,
           * which is what every other chat they use does.
           */}
          <textarea
            value={draft}
            rows={1}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Write a message…"
            className="max-h-28 flex-1 resize-none border-0 bg-transparent py-2 text-sm text-foreground outline-none placeholder:text-muted/70"
            style={{ fontSize: "max(0.875rem, 16px)" }}
            ref={(el) => {
              if (!el) return;
              el.style.height = "auto";
              el.style.height = Math.min(el.scrollHeight, 112) + "px";
            }}
            maxLength={2000}
          />

          <button
            type="submit"
            className="grid size-11 shrink-0 place-items-center rounded-xl transition-all disabled:opacity-35"
            style={{ background: brand, color: onBrand }}
            aria-label="Send"
            disabled={sending || (!draft.trim() && pending.length === 0)}
          >
            <SendIcon />
          </button>
        </div>

        <p className="mt-2 text-center text-[11px] text-muted">
          Answered by an assistant · a human sees everything
        </p>
      </form>
    </div>
  );
}

/** The face beside a group of replies. */
function Face({ who, photoUrl }: { who: string; photoUrl: string | null }) {
  return (
    <span
      className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-full text-[10px] font-semibold text-white"
      style={{ background: "var(--brand)" }}
      aria-hidden
    >
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt="" className="size-full object-cover" />
      ) : (
        initialsFor(who)
      )}
    </span>
  );
}

/**
 * One message.
 *
 * The shape carries the grouping: a tail only on the last bubble of a run, and
 * the avatar only beside it, so five replies in a row read as one person
 * talking rather than five separate notifications.
 */
function Bubble({
  from,
  first,
  last,
  who,
  photoUrl,
  at,
  photos,
  children,
}: {
  from: "client" | "studio";
  first: boolean;
  last: boolean;
  who: string;
  photoUrl: string | null;
  at?: number;
  photos?: string[];
  children: string;
}) {
  const mine = from === "client";

  return (
    <div className={`flex items-end gap-2 ${mine ? "flex-row-reverse" : ""} ${first ? "pt-2" : ""}`}>
      {!mine && (last ? <Face who={who} photoUrl={photoUrl} /> : <span className="size-7 shrink-0" />)}

      {/*
        * Only the customer gets a bubble.
        *
        * Two columns of opposing capsules is the visual language of SMS, and
        * it is what every chat widget on the internet uses — but this is not
        * two people texting. It is a business talking to somebody who came to
        * its website, and those two voices are not the same kind of thing.
        *
        * So the business speaks as text on the page, the way the rest of the
        * site does, and the customer's own words arrive as objects placed on
        * it. The asymmetry says who is speaking more clearly than two colours
        * of bubble ever did, and it reads better: a reply about prices and
        * times is no longer squeezed into eighty per cent of a phone.
        *
        * The same reasoning as the missing title bar above — the widget stops
        * announcing itself as a widget, and the conversation is just the
        * conversation.
        */}
      <div
        className={`flex min-w-0 flex-col ${
          mine ? "max-w-[85%] items-end" : "min-w-0 flex-1 items-start"
        }`}
      >
        {photos?.length ? (
          <div className={`mb-1 flex flex-wrap gap-1.5 ${mine ? "justify-end" : ""}`}>
            {photos.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={src}
                alt="Attached"
                className="size-24 rounded-xl border border-border object-cover"
              />
            ))}
          </div>
        ) : null}

        {children ? (
          <div
            className={`whitespace-pre-wrap break-words motion-safe:animate-[rise_200ms_ease-out] ${
              mine
                ? "rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed text-[var(--on-brand)] " +
                  (last ? "rounded-br-md" : "")
                : // Set as reading matter, not as a label in a box: a size up,
                  // looser leading, and the width of the panel to breathe in.
                  "py-1 pr-2 text-[0.9375rem] leading-[1.62] text-foreground"
            }`}
            style={mine ? { background: "var(--brand)" } : undefined}
          >
            {withLinks(children, mine)}
          </div>
        ) : null}

        {at != null && (
          <div
            className={`mt-1 flex items-center gap-1 text-[10px] text-muted ${
              mine ? "px-1" : ""
            }`}
          >
            <span className="tabular-nums">{clock(at)}</span>
            {mine && (
              <span className="text-[var(--brand)]">
                <TickIcon />
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
