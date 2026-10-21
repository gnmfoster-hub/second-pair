/*
 * A promise where a string belongs.
 *
 *   node scripts/check-awaited.cjs
 *
 * `${siteOrigin()}/a/${token}` is legal TypeScript, compiles without a
 * murmur, and produces the string "[object Promise]/a/4f3a…". Nothing catches
 * it: the types are satisfied, the tests do not call it because it needs a
 * request context, and the result is a URL that looks wrong only to whoever
 * receives it.
 *
 * Found on 21 October, in three places at once, every one of them a link
 * somebody was being asked to follow:
 *
 *   forms/afterSigning   "X has completed your form" → open their record
 *   admin/agreementActions   the agreement a new client is emailed to sign
 *   agreements/read      the link beside every agreement in the admin list
 *
 * The agreement one is the worst of them: the whole email is a link, and the
 * link was dead.
 *
 * So the rule is narrow and about this one shape. Every async helper that
 * returns a string and gets interpolated goes in the list; using one without
 * `await` is a fault unless it is being collected by Promise.all, which is
 * the one honest reason to hold the promise itself.
 */
const fs = require("node:fs");
const path = require("node:path");

/** Async functions that return a string and are read as one. */
const MUST_AWAIT = ["siteOrigin"];

const ROOTS = ["src"];
const LOOK_AT = /\.(tsx|ts)$/;

function files(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...files(full));
    else if (LOOK_AT.test(entry.name)) out.push(full);
  }
  return out;
}

const found = [];

for (const root of ROOTS) {
  if (!fs.existsSync(root)) continue;
  for (const file of files(root)) {
    const source = fs.readFileSync(file, "utf8");
    source.split("\n").forEach((line, n) => {
      for (const name of MUST_AWAIT) {
        const at = line.indexOf(`${name}(`);
        if (at === -1) continue;

        /*
         * A comment about it, which is not a use of it. Line-based rather
         * than a proper strip, because this codebase writes the body of a
         * block comment with a leading star and the only false positive
         * this check has ever had was a sentence explaining the bug.
         */
        const start = line.trimStart();
        if (start.startsWith("*") || start.startsWith("//") || start.startsWith("/*")) continue;

        /* Its own declaration, and the import that brings it in. */
        if (/\b(function|import)\b/.test(line)) continue;
        /* Awaited, which is the whole point. */
        if (line.slice(0, at).trimEnd().endsWith("await")) continue;
        /*
         * Handed to Promise.all as a promise, on purpose. Written as a line
         * of its own in every case in this codebase, which is also how
         * anybody writes it.
         */
        if (/^\s*[A-Za-z.]+\(\),?\s*$/.test(line)) continue;
        if (line.includes("Promise.all") || line.includes("Promise.allSettled")) continue;

        found.push({ file: file.replaceAll("\\", "/"), line: n + 1, text: line.trim().slice(0, 96) });
      }
    });
  }
}

if (!found.length) {
  console.log("Nothing reads a promise as though it were a string.");
  process.exit(0);
}

console.log(`${found.length} place${found.length === 1 ? "" : "s"} using an async helper without await.`);
console.log("Each one produces the literal text [object Promise] wherever it is read.\n");
for (const f of found) {
  console.log(`  ${f.file}:${f.line}`);
  console.log(`    ${f.text}`);
}
console.log("\nPut `await` in front of it, and make the function around it async if it is not.");
process.exit(1);
