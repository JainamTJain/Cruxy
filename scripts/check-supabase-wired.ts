/**
 * Unit-level check: auth/sign-in repository functions must not throw
 * "Supabase path not wired yet". Broader repos are checked as they land.
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const ROOT = join(process.cwd(), "src/lib");
const BAN = "Supabase path not wired yet";

const AUTH_FILES = [
  "db/repository.ts",
  "db/supabase/foundation.ts",
  "db/supabase/client.ts",
  "db/config.ts",
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name.endsWith("repository.ts") || p.includes(`${join("db", "supabase")}`)) {
      out.push(p);
    }
  }
  return out;
}

let failed = false;

for (const rel of AUTH_FILES) {
  const text = readFileSync(join(ROOT, rel), "utf8");
  if (text.includes(BAN)) {
    console.error(`FAIL: ${rel} still contains "${BAN}"`);
    failed = true;
  } else {
    console.log(`ok: ${rel}`);
  }
}

// Any remaining "not wired yet" in repository files is allowed only outside
 // the sign-in slice for now — report counts, fail if foundation auth still has it.
const repos = walk(ROOT).filter((p) => p.endsWith("repository.ts"));
for (const file of repos) {
  const text = readFileSync(file, "utf8");
  const count = text.split(BAN).length - 1;
  const rel = file.slice(process.cwd().length + 1);
  if (rel.endsWith("db/repository.ts") && count > 0) {
    console.error(`FAIL: ${rel} has ${count} "${BAN}" throw(s)`);
    failed = true;
  } else if (count > 0) {
    console.log(`pending: ${rel} (${count} not-wired throw(s) — follow-up)`);
  } else {
    console.log(`ok: ${rel}`);
  }
}

if (failed) process.exit(1);
console.log("check-supabase-wired: auth slice clean");
