/*
 * Which brand files anything actually asks for.
 *
 *   node scripts/brand-what-is-used.cjs
 *
 * Written before deleting any of them, because a missing logo is the kind of
 * fault nobody reports: the page still loads, the alt text still reads, and the
 * business's own customers see a broken square for a fortnight.
 *
 * It searches every place a path can be written down, not only the app: the
 * source, the manifest, the service worker, the scripts, and the brand folder's
 * own files, which reference each other. Anything named anywhere is kept.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const BRAND = path.join(ROOT, "public", "brand");

/** Every file under public/brand, as the path a page would write. */
function brandFiles(dir = BRAND, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) brandFiles(full, out);
    else out.push(full.slice(path.join(ROOT, "public").length + 1).replace(/\\/g, "/"));
  }
  return out;
}

/** Every file worth searching, which is everything but node_modules and .next. */
function searchable(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (["node_modules", ".next", ".git", "dist"].includes(name)) continue;
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) searchable(full, out);
    else if (/\.(tsx?|jsx?|css|json|webmanifest|md|html|mjs|cjs)$/.test(name) && stat.size < 2_000_000) {
      out.push(full);
    }
  }
  return out;
}

const files = brandFiles();
const haystack = searchable(ROOT);

/* Read once; there are a hundred names to look for. */
const texts = haystack.map((f) => ({ f, text: fs.readFileSync(f, "utf8") }));

const used = new Map();
for (const file of files) {
  const name = file.split("/").pop();
  const hits = [];
  for (const { f, text } of texts) {
    /* Its own file does not count as a reference to itself. */
    if (f.endsWith(file.replace(/\//g, path.sep))) continue;
    if (text.includes(file) || text.includes(name)) {
      hits.push(f.slice(ROOT.length + 1).replace(/\\/g, "/"));
    }
  }
  used.set(file, hits);
}

const live = [...used].filter(([, hits]) => hits.length);
const orphans = [...used].filter(([, hits]) => !hits.length);

console.log(`\n${files.length} brand files. ${live.length} are named somewhere, ${orphans.length} are not.\n`);

console.log("REFERENCED");
for (const [file, hits] of live) {
  const where = [...new Set(hits.map((h) => (h.startsWith("public/brand") ? "the brand folder" : h)))];
  console.log(`  ${file}`);
  console.log(`      ${where.slice(0, 3).join(", ")}${where.length > 3 ? ` and ${where.length - 3} more` : ""}`);
}

console.log("\nNAMED BY NOTHING");
for (const [file] of orphans) console.log(`  ${file}`);

/*
 * Said out loud, because "nothing references it" is a claim about a search and
 * not about the world. A file built into a page by a loop, or asked for by a
 * URL somebody typed into a browser once, would not show up here.
 */
console.log(
  `\nThis is a text search. A path built up in pieces would not be found, so read the list before deleting.\n`,
);
