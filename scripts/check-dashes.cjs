/*
 * The long dash, in anything a person reads on a screen.
 *
 *   node scripts/check-dashes.cjs
 *
 * Giles, on a week of real replies: "it makes it look very AI." It was taken out
 * of the assistant, out of the website's own copy, and out of ninety-five places
 * across the dashboard.
 *
 * The assistant is guarded — neverSay checks every reply on its way out, and the
 * shipped reminder wordings have a test. The app's own screens had nothing. All
 * ninety-five were removed by hand, and nothing has stopped a single one coming
 * back since.
 *
 * Which is not theoretical: writing the Facebook booking panel on 29 September,
 * having just read the rule, I put two straight back in. That is what this is
 * for.
 *
 * ── The hard part, and why this is a script rather than a test ──────────────
 *
 * This codebase uses the long dash heavily and deliberately in comments, which
 * nobody reads on a screen. A naive grep reports several hundred of those and is
 * therefore worse than nothing — a check that cries wolf teaches whoever reads
 * it to skim the line that matters.
 *
 * So comments are stripped before looking: block comments, line comments, and
 * JSX comment braces. What is left is code and the strings inside it. There is
 * no attempt to work out which of those strings reach a screen, because the
 * honest answer is that nearly all of them in these files do, and the few that
 * do not are cheap to look at.
 *
 * Also checked: &mdash;, which is the same character wearing a hat, and is how
 * two of mine got past a search for the character itself.
 */
const fs = require("node:fs");
const path = require("node:path");

/*
 * Where a person reads text.
 *
 * lib is deliberately included: the trade packs, the reminder wordings and the
 * words helper all live there and all of them end up in front of somebody. The
 * marketing site is included too — it was part of the original sweep.
 */
const ROOTS = ["src/app", "src/components", "src/lib"];
const LOOK_AT = /\.(tsx|ts)$/;
const SKIP = /\.test\.ts$/;

const DASH = "—";
const ENTITY = "&mdash;";

/**
 * The file with its comments taken out, and the line numbers kept.
 *
 * Replaced with spaces rather than removed so that a reported line number still
 * matches the file somebody then opens. Strings are deliberately left alone: a
 * `//` inside a URL would otherwise swallow the rest of the line, which is how a
 * checker quietly stops looking at the half of the file after every link.
 */
function withoutComments(source) {
  /*
   * ── Why this is a stack and not a boolean ─────────────────────────────────
   *
   * The first version tracked one "am I inside a string" flag, and it was wrong
   * in a way that took a suspicious-looking result to find. A template literal
   * can hold `${ ... }`, and what is inside those braces is *code* — which can
   * hold a comment, and in this codebase very often does:
   *
   *     className={`... ${isToday
   *       ? \/*
   *          * ... so the entire grid came out blue — a tint that
   *          *\/
   *         "bg-accent/[0.022]"
   *
   * With one flag, the opening backtick put it "inside a string" until the
   * closing backtick, so that comment was never stripped and its long dash was
   * reported as something a customer reads. It is a comment about a shade of
   * blue.
   *
   * So: a stack. Code, a plain string, a template, and code again inside a
   * template's braces, as deep as it goes. Nested template literals inside
   * interpolations work for the same reason.
   */
  let out = "";
  let i = 0;
  /* Each frame is { kind: "code" | "template", quote?, braces? } */
  const stack = [{ kind: "code", braces: 0 }];
  const top = () => stack[stack.length - 1];

  const blank = (from, to) => {
    for (let j = from; j < to; j++) out += source[j] === "\n" ? "\n" : " ";
  };

  while (i < source.length) {
    const here = top();
    const ch = source[i];
    const next = source[i + 1];

    // ------------------------------------------------- inside a plain string
    if (here.kind === "string") {
      out += ch;
      if (ch === "\\") {
        /* Whatever follows an escape is literal, newline included. */
        out += source[i + 1] ?? "";
        i += 2;
        continue;
      }
      if (ch === here.quote) stack.pop();
      i++;
      continue;
    }

    // ---------------------------------------------------- inside a template
    if (here.kind === "template") {
      if (ch === "\\") {
        out += ch + (source[i + 1] ?? "");
        i += 2;
        continue;
      }
      if (ch === "`") {
        out += ch;
        stack.pop();
        i++;
        continue;
      }
      /* An interpolation is code again, however deep. */
      if (ch === "$" && next === "{") {
        out += "${";
        stack.push({ kind: "code", braces: 0 });
        i += 2;
        continue;
      }
      out += ch;
      i++;
      continue;
    }

    // -------------------------------------------------------------- in code
    if (ch === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end === -1 ? source.length : end + 2;
      /* Blanked rather than removed, so later line numbers still match. */
      blank(i, stop);
      i = stop;
      continue;
    }

    if (ch === "/" && next === "/") {
      const stop = source.indexOf("\n", i);
      const end = stop === -1 ? source.length : stop;
      blank(i, end);
      i = end;
      continue;
    }

    /*
     * A regular expression, which is neither code nor a string.
     *
     * The second flaw this checker had, found the same way as the first: by a
     * result that looked wrong. neverSay.ts is full of patterns like
     * /\b(one'?s|it'?s)\b/ — and that apostrophe was taken as the start of a
     * string, which then swallowed everything to the next apostrophe, comments
     * included. So comments about the long dash, in the file whose job is to
     * catch the long dash, were reported as customer-facing prose.
     *
     * Telling a regex from a division is not decidable without a real parser, so
     * this uses the usual heuristic: after an operator, an opening bracket, a
     * comma, a colon or a keyword, a slash starts a pattern; after a value it is
     * division. Division by something is vanishingly rare in this codebase and a
     * misread would only ever blank a little code, never a string.
     */
    if (ch === "/") {
      const lastReal = /([^\s])\s*$/.exec(out)?.[1] ?? "";
      const startsPattern = lastReal === "" || /[=(,:[!&|?{};+*<>~^-]/.test(lastReal);
      if (startsPattern) {
        let j = i + 1;
        let inClass = false;
        let done = false;
        while (j < source.length) {
          const c = source[j];
          if (c === "\\") {
            j += 2;
            continue;
          }
          if (c === "\n") break; // not a regex after all
          if (c === "[") inClass = true;
          else if (c === "]") inClass = false;
          else if (c === "/" && !inClass) {
            done = true;
            j++;
            break;
          }
          j++;
        }
        if (done) {
          /* Blanked: a pattern is machinery, and nobody reads one on a screen. */
          blank(i, j);
          i = j;
          continue;
        }
      }
    }

    if (ch === '"' || ch === "'") {
      stack.push({ kind: "string", quote: ch });
      out += ch;
      i++;
      continue;
    }

    if (ch === "`") {
      stack.push({ kind: "template" });
      out += ch;
      i++;
      continue;
    }

    /*
     * Braces, so the end of an interpolation can be told from a brace inside it.
     * Only pops back into the template when this frame is one that was opened by
     * a `${`, which is every code frame except the outermost.
     */
    if (ch === "{") {
      here.braces++;
    } else if (ch === "}") {
      if (here.braces === 0 && stack.length > 1) {
        out += ch;
        stack.pop();
        i++;
        continue;
      }
      here.braces--;
    }

    out += ch;
    i++;
  }

  return out;
}

function* files(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* files(full);
    else if (LOOK_AT.test(entry.name) && !SKIP.test(entry.name)) yield full;
  }
}

/*
 * ── Two different things wear the same character ────────────────────────────
 *
 * The first version of this reported 239 and was therefore useless, because
 * roughly half of them are not what Giles objected to.
 *
 * What he objected to is the long dash in *prose* — "nothing went out — usually
 * because", "Yes, that is right — confirm it". Writing joined that way is the
 * commonest tell there is, which is the whole reason it came out of the
 * assistant.
 *
 * What is also in here, and is not that:
 *
 *   • A lone em dash standing in for a value nobody filled in: `{value || "—"}`.
 *     That is a table convention older than any of this and it is correct.
 *   • A separator between a label and a figure: `Complete — Dawn Pethick`,
 *     `The usual — a half head`, `£30 — paid`. It is punctuation doing a
 *     layout job, not a sentence hiding a splice.
 *
 * Telling them apart is done by what sits either side. Prose has a word before
 * and a word after. A placeholder has nothing either side. A separator has an
 * interpolation within a character or two, which is what makes it a label and a
 * value rather than a clause.
 *
 * Reported separately rather than silently allowed, because "45 of these are
 * separators" is a judgement somebody may disagree with, and hiding it would
 * make this check a claim rather than a count.
 */
function kindOf(line, at) {
  const before = line.slice(0, at);
  const after = line.slice(at + 1);

  /*
   * A line that is about dashes, showing one on purpose.
   *
   * The assistant's own instructions say "Never use a dash to join two halves
   * of a sentence" and then quote one so the model knows what is meant.
   * Reporting that as a fault asks for the example to be deleted, which would
   * leave a rule with nothing to point at, and it is the rule that stops the
   * dashes being written in the first place.
   */
  if (/\bdash(es)?\b/i.test(line)) return "placeholder";

  /* The whole of the string is the dash: a stand-in for nothing. */
  if (/["'`]\s*$/.test(before) && /^\s*["'`]/.test(after)) return "placeholder";

  /* A label and a value: an interpolation all but touching it. */
  if (/\$\{[^}]*\}\s*$/.test(before) || /^\s*\$\{/.test(after)) return "separator";
  if (/\{\s*$/.test(before) || /^\s*\{/.test(after)) return "separator";
  if (/<\/?[A-Za-z][^>]*>\s*$/.test(before) || /^\s*<\/?[A-Za-z]/.test(after)) return "separator";

  /* A word each side, with the spaces that make it a clause. */
  if (/[\w.,!?)"']\s$/.test(before) && /^\s[\w"'(]/.test(after)) return "prose";

  return "other";
}

const prose = [];
const allowed = [];

for (const root of ROOTS) {
  if (!fs.existsSync(root)) continue;
  for (const file of files(root)) {
    const cleaned = withoutComments(fs.readFileSync(file, "utf8"));
    cleaned.split("\n").forEach((line, n) => {
      /* The entity is the same character wearing a hat, and is how two of mine
       * got past a search for the character itself. Always prose in practice. */
      const hits = [];
      let from = 0;
      for (;;) {
        const at = line.indexOf(DASH, from);
        if (at === -1) break;
        hits.push({ at, kind: kindOf(line, at) });
        from = at + 1;
      }
      if (line.includes(ENTITY)) hits.push({ at: line.indexOf(ENTITY), kind: "prose" });

      for (const hit of hits) {
        const where = {
          file: file.replaceAll("\\", "/"),
          line: n + 1,
          text: line.trim().slice(0, 96),
          kind: hit.kind,
        };
        if (hit.kind === "prose" || hit.kind === "other") prose.push(where);
        else allowed.push(where);
      }
    });
  }
}

const found = prose;

const only = process.argv.includes("--all") ? null : process.argv[2];
const listed = only ? found.filter((f) => f.file.includes(only)) : found;

console.log("");
if (found.length === 0) {
  console.log("No long dash in prose on any screen. Comments are left alone.");
} else {
  console.log(`${found.length} long dash${found.length === 1 ? "" : "es"} in prose a person reads.`);
  console.log(
    `${allowed.length} more are a stand-in for an empty value or a separator between a label and a figure, and are left alone.\n`,
  );
  for (const f of listed) console.log(`  ${f.file}:${f.line}\n    ${f.text}`);
  if (only) console.log(`\n(Showing only ${only}. Run with no argument for all of them.)`);
  console.log("\nGiles's rule: it makes it look very AI. A comma, a full stop, or two");
  console.log("sentences. Read each one rather than replacing in bulk: a dash joining two");
  console.log("whole sentences becomes a comma splice, which reads worse than the dash did.");
  console.log("A bulk pass over the last lot got eleven wrong in exactly that way.");
  process.exitCode = 1;
}
