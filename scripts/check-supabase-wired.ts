/**
 * Fail if any exported repository (or listed data) function can hit the sample
 * store without an isSampleDataMode() guard — that mkdirs .data on Vercel.
 *
 * Run: npm run check:supabase-wired
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const BAN = "Supabase path not wired yet";

const EXTRA_FILES = [
  "src/lib/library/sync.ts",
  "src/lib/library/researcher.ts",
  "src/lib/practice/pipeline.ts",
  "src/lib/case-brain/service.ts",
  "src/app/api/team/alignment/route.ts",
  "src/app/api/team/claim-maps/route.ts",
  "src/app/api/case-brain/[caseId]/route.ts",
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name.endsWith("repository.ts")) out.push(p);
  }
  return out;
}

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Top-level export async function bodies (brace-balanced). */
function exportedAsyncFunctions(
  src: string,
): { name: string; body: string }[] {
  const out: { name: string; body: string }[] = [];
  const re = /export\s+async\s+function\s+([A-Za-z0-9_]+)\s*\([^)]*\)[^{]*\{/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(src))) {
    const name = match[1];
    const start = match.index + match[0].length - 1; // at '{'
    let depth = 0;
    let i = start;
    for (; i < src.length; i++) {
      const ch = src[i];
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          i++;
          break;
        }
      }
    }
    out.push({ name, body: src.slice(start, i) });
  }
  return out;
}

function usesSampleStore(body: string): boolean {
  return (
    /\breadStore\s*\(/.test(body) || /\bupdateStore\s*\(/.test(body)
  );
}

function hasSampleGuard(body: string): boolean {
  return /isSampleDataMode\s*\(/.test(body);
}

let failed = false;

function fail(msg: string) {
  console.error(`FAIL: ${msg}`);
  failed = true;
}

for (const file of walk(join(SRC, "lib"))) {
  const text = readFileSync(file, "utf8");
  const rel = relative(ROOT, file);
  if (text.includes(BAN)) {
    fail(`${rel} still contains "${BAN}"`);
  }
}

const targets = [
  ...walk(join(SRC, "lib")),
  join(SRC, "lib", "case-brain", "service.ts"),
  ...EXTRA_FILES.map((f) => join(ROOT, f)),
];
const seen = new Set<string>();

for (const file of targets) {
  if (seen.has(file)) continue;
  seen.add(file);
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    fail(`missing file ${relative(ROOT, file)}`);
    continue;
  }
  const rel = relative(ROOT, file);
  const cleaned = stripComments(text);

  // Non-repository helpers must not import sample-store at all.
  const isRepoLike =
    rel.endsWith("repository.ts") ||
    rel.endsWith(join("case-brain", "service.ts")) ||
    rel.includes(`${join("case-brain")}${join("service.ts")}`);
  if (
    !isRepoLike &&
    /from\s+["']@\/lib\/db\/sample-store["']/.test(cleaned)
  ) {
    fail(`${rel} imports sample-store (use repository helpers instead)`);
  }

  for (const fn of exportedAsyncFunctions(cleaned)) {
    if (!usesSampleStore(fn.body)) continue;
    if (!hasSampleGuard(fn.body)) {
      fail(
        `${rel} :: ${fn.name}() reads readStore/updateStore without isSampleDataMode() guard`,
      );
    }
  }

  console.log(`ok: ${rel}`);
}

if (failed) {
  console.error("check-supabase-wired: FAILED");
  process.exit(1);
}
console.log("check-supabase-wired: all repository exports guarded");
