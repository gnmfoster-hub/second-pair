// Writes .env.local from the linked Supabase project.
// Deliberately prints nothing but key names, so secrets stay out of terminal
// scrollback and logs. Run: node scripts/pull-env.mjs

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function projectRef() {
  const tomlPath = join(root, "supabase", ".temp", "project-ref");
  if (existsSync(tomlPath)) return readFileSync(tomlPath, "utf8").trim();
  throw new Error("No linked project. Run: npx supabase link --project-ref <ref>");
}

const ref = projectRef();

// execSync, not execFileSync: Node refuses to spawn .cmd shims on Windows
// without a shell.
const raw = execSync(
  `npx --yes supabase@latest projects api-keys --project-ref ${ref} -o json`,
  { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
);

let keys;
try {
  keys = JSON.parse(raw);
} catch {
  throw new Error("Supabase CLI did not return JSON. Is the project still linked?");
}

// Tolerate either shape the CLI has used: a bare array, or { keys: [...] }.
const list = Array.isArray(keys) ? keys : (keys.keys ?? []);
const find = (name) => {
  const row = list.find((k) => k.name === name);
  return row?.api_key ?? row?.apiKey ?? row?.value;
};

const anon = find("anon");
const service = find("service_role");
if (!anon || !service) {
  // Names only. Never the values.
  throw new Error(
    `Could not find anon and service_role keys. Names returned: ${
      list.map((k) => k.name).join(", ") || "(none)"
    }`,
  );
}

// Preserve any non-Supabase values already in .env.local.
const existing = existsSync(join(root, ".env.local"))
  ? readFileSync(join(root, ".env.local"), "utf8")
  : "";

const managed = new Set([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
]);

const kept = existing
  .split(/\r?\n/)
  .filter((line) => {
    const key = line.split("=")[0]?.trim();
    return line.trim() && !managed.has(key);
  })
  .join("\n");

writeFileSync(
  join(root, ".env.local"),
  [
    `NEXT_PUBLIC_SUPABASE_URL=https://${ref}.supabase.co`,
    `NEXT_PUBLIC_SUPABASE_ANON_KEY=${anon}`,
    `SUPABASE_SERVICE_ROLE_KEY=${service}`,
    kept,
    "",
  ].join("\n"),
  "utf8",
);

console.log(`Wrote .env.local for project ${ref}: ${[...managed].join(", ")}`);
