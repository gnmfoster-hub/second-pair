import { NextResponse, type NextRequest } from "next/server";
import { runTurn } from "@/lib/engine/run";
import { serverTiming } from "@/lib/engine/clock";
import { hasAnthropicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { NotAnswering } from "@/lib/engine/errors";
import { Limiter } from "@/lib/askingTooMuch";
import { createAdminClient } from "@/lib/supabase/admin";
import { handOverAfterFailure } from "@/lib/engine/turnFailed";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_MESSAGE_LENGTH = 2000;

/**
 * What one caller may ask for. See lib/askingTooMuch.
 *
 * This was a gap between messages keyed on the session — and the session is a
 * string the caller invents, so a new one each time walked straight past it.
 * Every message costs the business money at the model and lands in an inbox
 * somebody reads.
 */
const limiter = new Limiter();

/**
 * Who is asking, as far as we can tell.
 *
 * The first address in the forwarded chain is the client; the rest are
 * proxies. Taken from the headers rather than the body, so it is not a thing
 * the caller can simply change.
 */
function addressOf(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  return (forwarded.split(",")[0] ?? "").trim() || (request.headers.get("x-real-ip") ?? "").trim();
}

export async function POST(request: NextRequest) {
  let body: {
    studio?: string;
    session?: string;
    message?: string;
    media?: string[];
    with?: string | null;
    test?: boolean;
    /** Send the reply a piece at a time rather than all at the end. */
    stream?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const studio = String(body.studio ?? "").trim();
  const session = String(body.session ?? "").trim();
  const message = String(body.message ?? "").trim();

  if (!studio || !session) {
    return NextResponse.json({ error: "Missing studio or session" }, { status: 400 });
  }
  const media = Array.isArray(body.media)
    ? body.media.filter((m): m is string => typeof m === "string").slice(0, 6)
    : [];

  if (!message && media.length === 0) {
    return NextResponse.json({ error: "Empty message" }, { status: 400 });
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json({ error: "Message too long" }, { status: 413 });
  }
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(session)) {
    return NextResponse.json({ error: "Invalid session" }, { status: 400 });
  }
  /*
   * Is this the owner rehearsing, or a real customer?
   *
   * This can only ever be believed from somebody signed in as a member of the
   * business being messaged. Taking the browser's word for it would let a
   * stranger mark their own enquiry as a test and hide it from the owner —
   * which is a way to make a complaint disappear.
   */
  const isTest = body.test === true ? await isOwnerOf(studio) : false;

  /*
   * Are they a customer, or somebody deciding whether to become one?
   *
   * The support assistant takes both, and they need opposite answers: telling
   * a visitor to open Settings is useless because they have no account, and
   * treating a paying owner as a prospect — pitching at them, asking for their
   * details — is worse, because we already know exactly who they are.
   *
   * Read from the session rather than the request body. It is only tone and
   * knowledge, not permission, but a widget that answered "I am a customer"
   * from a browser would be taking the browser's word for something the server
   * already knows for certain.
   *
   * Null for every ordinary business: a salon's enquiries are from customers,
   * and telling its assistant otherwise would be noise in the prompt.
   */
  const signedIn = studio === process.env.NEXT_PUBLIC_SUPPORT_SLUG ? await hasSession() : null;

  /*
   * Whose business is asking, so a request can be filed where they will look
   * for it.
   *
   * Read from the session, never from the request. The browser saying which
   * business it belongs to would let anybody raise requests inside somebody
   * else's account, and the widget is on a public route.
   *
   * Null for an ordinary business and for a signed-out visitor, and nothing
   * downstream depends on it — an unattributed support conversation still
   * works exactly as it did, it just cannot open a request on its own.
   */
  const raisedFor = signedIn ? await studioOfCaller() : null;

  const forArtist =
    typeof body.with === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.with)
      ? body.with
      : null;

  if (limiter.tooMuch(`${studio}:${session}`, addressOf(request))) {
    return NextResponse.json({ error: "Slow down" }, { status: 429 });
  }

  /*
   * Never a developer's sentence to a customer.
   *
   * This said "Add ANTHROPIC_API_KEY to .env.local and restart", and the
   * widget draws whatever comes back in `error` — so somebody messaging a
   * salon about their hair was told to edit an environment file. What is
   * wrong at our end is ours to read in the log; what they get is the same
   * honest sentence as any other failure, and their message still lands in
   * the business's inbox.
   */
  if (!hasAnthropicEnv()) {
    console.error("[widget/chat] ANTHROPIC_API_KEY is not set");
    return NextResponse.json({
      reply:
        "Sorry — I can't get to the diary this minute, so I don't want to guess at times. " +
        "I've passed this straight to the team and somebody will come back to you shortly.",
      paused: true,
      handedOver: true,
    });
  }

  /*
   * One answer, however it is delivered.
   *
   * The words a customer gets when the model falls over are careful, and they
   * were written once. Streaming the reply meant a second route to the same
   * outcome, and a second copy of those sentences is a second copy to keep
   * right — the sort of duplication that ends with one path apologising
   * properly and the other showing a stack trace. So the turn is run in one
   * place and both paths ask it for the same object.
   */
  async function answer(onText?: (chunk: string) => void): Promise<{
    payload: Record<string, unknown>;
    status: number;
    timing?: string;
  }> {
    try {
      const result = await runTurn({
        studioSlug: studio,
        sessionKey: session,
        channel: "web",
        origin: request.nextUrl.origin,
        message: message || "(sent an image)",
        mediaUrls: media,
        // Which person this link belongs to. Validated as a uuid rather than
        // trusted: it arrives from the browser, and it decides whose diary gets
        // booked.
        forArtistId: forArtist,
        isTest,
        signedIn,
        raisedFor,
        onText,
      });

      return {
        payload: {
          reply: result.reply,
          paused: result.paused,
          /*
           * What it did, so the widget can draw it instead of asking the
           * customer to type the answer back. Nothing here grants the browser
           * anything: it describes decisions already written to the database,
           * and a tapped time comes back as an ordinary message and is booked
           * the ordinary way.
           */
          moments: result.moments,
        },
        status: 200,
        timing: result.spent ? serverTiming(result.spent) : undefined,
      };
    } catch (error) {
      /*
       * One kind of failure is worth explaining.
       *
       * "Try again" is right for almost everything, because trying again is
       * genuinely what to do. It is wrong for a business that has been stopped:
       * nothing is broken, retrying will never work, and the script is often
       * still on a website whose owner is no longer a customer.
       */
      if (error instanceof NotAnswering) {
        console.warn("[widget/chat]", error.message);
        return { payload: { error: error.visitorMessage }, status: 503 };
      }

      /*
       * Everything else: answer like a business, not like a website.
       *
       * A red error box under a message somebody has just typed tells the
       * customer the company is broken, and tells the owner nothing at all. It
       * happened for real — the model's account ran out of credit and every
       * business on here showed "Something went wrong. Please try again." to
       * every customer, for as long as it took somebody to notice.
       *
       * So the customer is told, in words, that their message has landed and
       * somebody will come back to them — which is true, because the same call
       * hands the conversation to the owner and buzzes their phone. Their words
       * are already saved; the reply is the only thing missing.
       */
      console.error("[widget/chat]", error);

      const { handed } = await handOverAfterFailure(createAdminClient(), {
        studioId: await studioIdOf(studio),
        channel: "web",
        externalRef: session,
        error,
      });

      /*
       * Only promise what happened.
       *
       * "I've passed this straight to the team" was said whether or not the
       * handover worked — and it cannot work if the studio could not be looked
       * up, which is the same failure that would have caused this. A customer
       * told somebody will come back to them, when nobody has been told
       * anything, is worse off than one who is asked to try again.
       */
      return {
        payload: {
          reply: handed
            ? "Sorry — I can't get to the diary this minute, so I don't want to guess at times. " +
              "I've passed this straight to the team and somebody will come back to you shortly. " +
              "Your message has been saved, so there's no need to write it again."
            : "Sorry — something is wrong at our end and I can't answer properly just now. " +
              "Please try again in a few minutes, or contact the business directly if it is urgent.",
          paused: true,
          handedOver: handed,
        },
        status: 200,
      };
    }
  }

  /*
   * The words as they are written, for the one channel with somebody watching.
   *
   * Measured: ninety per cent of the eight seconds a customer waits is the
   * model writing the reply. Nothing about that is fixable by being cleverer
   * with the database — the only thing that shortens the wait from where the
   * customer sits is not making them wait for the full stop.
   *
   * Asked for rather than assumed. An old widget script cached on somebody's
   * website carries on posting without `stream` and carries on getting the
   * single JSON object it has always got, so nobody's site breaks on a deploy
   * they did not make.
   *
   * One JSON object per line: `{"t":"…"}` for each piece of the reply and a
   * final `{"done":{…}}` carrying everything the plain answer carries. A line
   * at a time because a half-received line is easy to hold onto and finish,
   * which matters on a phone changing masts halfway through a sentence.
   */
  if (body.stream === true) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const line = (value: unknown) => {
          try {
            controller.enqueue(encoder.encode(JSON.stringify(value) + "\n"));
          } catch {
            // The customer closed the tab mid-reply. The turn still finishes
            // and is still saved; there is simply nobody left to send it to.
          }
        };

        const { payload } = await answer((chunk) => line({ t: chunk }));
        line({ done: payload });
        controller.close();
      },
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
        // Vercel and most proxies hold a response back to buffer it, which
        // would deliver the whole thing at once and undo the entire point.
        "X-Accel-Buffering": "no",
        /*
         * And this is the one that actually did it.
         *
         * With X-Accel-Buffering alone the stream reached node in twenty-six
         * pieces and reached Chrome in exactly one, six seconds in — every
         * word correct, in order, nothing missing, and the customer waiting
         * precisely as long as before. The difference is that a browser asks
         * for compression and node does not, and the compressor at the edge
         * holds the whole body to compress it.
         *
         * Saying the body is already encoded stops it being compressed again,
         * so it goes out as it is written. A reply is a few hundred bytes of
         * text; there was nothing worth compressing anyway.
         *
         * Worth knowing because the failure is invisible: it looks exactly
         * like success unless you time the first piece against the last, which
         * is what check-stream.mjs now does.
         */
        "Content-Encoding": "none",
      },
    });
  }

  const { payload, status, timing } = await answer();
  return NextResponse.json(payload, {
    status,
    /*
     * Where the wait went, on the one channel where somebody is watching.
     *
     * A browser draws this in its network tab as bars against the request, so
     * a slow reply can be taken apart by anybody who opens dev tools — no
     * instrumentation to switch on and nothing to remember to run. It carries
     * no customer data, only durations in milliseconds.
     */
    headers: timing ? { "Server-Timing": timing } : undefined,
  });

}

/**
 * The id behind the slug, for handing a failed conversation over.
 *
 * Its own small query because by the time it is needed the turn has already
 * thrown, so nothing it looked up can be trusted to have come back.
 */
async function studioIdOf(slug: string): Promise<string> {
  const { data } = await createAdminClient()
    .from("studios")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  return (data?.id as string) ?? "";
}

/**
 * Whether the caller is signed in as a member of this business.
 *
 * Uses the session client rather than the admin one, so row-level security
 * does the checking: a non-member simply sees no membership row.
 */
/** Whether anybody is signed in to Second Pair on this request. */
async function hasSession(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return Boolean(user);
  } catch {
    // No session, an expired one, or cookies the browser would not send from a
    // third-party frame. All of those mean "treat them as a visitor", which is
    // the safer of the two answers to be wrong about.
    return false;
  }
}

/**
 * The business the person talking to support belongs to.
 *
 * Only ever from their own session — this decides which account a request
 * lands in, and that is not something to take a browser's word for.
 */
async function studioOfCaller(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data } = await supabase
      .from("studio_members")
      .select("studio_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    return data?.studio_id ?? null;
  } catch {
    // Support still works; it just cannot open a request by itself.
    return null;
  }
}

async function isOwnerOf(slug: string): Promise<boolean> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;

    const { data } = await supabase
      .from("studios")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();

    return Boolean(data);
  } catch {
    return false;
  }
}
