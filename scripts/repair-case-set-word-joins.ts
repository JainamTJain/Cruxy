/**
 * One-off: repair run-together words in stored case_set passages (and file
 * text_content) for all 12 active cases.
 *
 * Dry run by default (prints before/after). Pass --write to persist.
 * Do not run --write against production from an agent; Jainam runs that.
 *
 * Usage:
 *   NODE_OPTIONS='--require ./scripts/preload-server-only.cjs' \
 *     tsx scripts/repair-case-set-word-joins.ts
 *   ... --write
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

import { createClient } from "@supabase/supabase-js";
import { repairRunTogetherWordsDetailed } from "../src/lib/library/repair-run-together";
import { normalizeExtractedText } from "../src/lib/library/join-extracted-text";

const WRITE = process.argv.includes("--write");

type FileRow = {
  id: string;
  name: string;
  type: string | null;
  text_content: string | null;
  case_numbers: number[] | null;
};

type PassageRow = {
  id: string;
  file_id: string;
  text: string;
  ord: number;
  anchor: string | null;
};

function preview(s: string, n = 160): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length <= n ? one : `${one.slice(0, n)}…`;
}

async function main() {
  if (process.env.USE_SAMPLE_DATA === "1") {
    console.log("USE_SAMPLE_DATA=1; refusing live repair.");
    process.exit(1);
  }
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.log(
      "Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY. Skip.",
    );
    process.exit(0);
  }

  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: files, error: fileErr } = await sb
    .from("files")
    .select("id,name,type,text_content,case_numbers")
    .eq("type", "case_set")
    .neq("status", "removed");
  if (fileErr) throw new Error(`files: ${fileErr.message}`);

  const caseSets = (files ?? []) as FileRow[];
  if (caseSets.length === 0) {
    console.log("No case_set files found.");
    process.exit(0);
  }

  console.log(
    `Mode: ${WRITE ? "WRITE" : "dry-run"} · case_set files: ${caseSets.length}`,
  );

  let passageUpdates = 0;
  let fileUpdates = 0;
  let changeCount = 0;

  for (const file of caseSets) {
    console.log(`\n## ${file.name} (${file.id})`);

    if (file.text_content) {
      const next = normalizeExtractedText(file.text_content);
      if (next !== file.text_content) {
        fileUpdates += 1;
        console.log("  file text_content:");
        console.log(`    before: ${preview(file.text_content)}`);
        console.log(`    after:  ${preview(next)}`);
        if (WRITE) {
          const { error } = await sb
            .from("files")
            .update({ text_content: next })
            .eq("id", file.id);
          if (error) throw new Error(`update file: ${error.message}`);
        }
      }
    }

    const { data: passages, error: pErr } = await sb
      .from("passages")
      .select("id,file_id,text,ord,anchor")
      .eq("file_id", file.id)
      .order("ord", { ascending: true });
    if (pErr) throw new Error(`passages: ${pErr.message}`);

    for (const row of (passages ?? []) as PassageRow[]) {
      const detailed = repairRunTogetherWordsDetailed(row.text);
      // Also collapse any residual soft wraps left in stored text.
      const next = normalizeExtractedText(row.text);
      if (next === row.text) continue;

      passageUpdates += 1;
      changeCount += detailed.changes.length;
      console.log(`  passage ord=${row.ord} ${row.anchor ?? ""}`);
      // Show only the first few local before/after windows around changes.
      const shown = detailed.changes.slice(0, 8);
      for (const c of shown) {
        const start = Math.max(0, c.index - 40);
        const end = Math.min(row.text.length, c.index + c.from.length + 40);
        const beforeSlice = row.text.slice(start, end);
        const afterSlice = next.slice(
          start,
          Math.min(next.length, start + beforeSlice.length + 8),
        );
        console.log(`    - ${JSON.stringify(c.from)} → ${JSON.stringify(c.to)}`);
        console.log(`      before: …${beforeSlice.replace(/\s+/g, " ")}…`);
        console.log(`      after:  …${afterSlice.replace(/\s+/g, " ")}…`);
      }
      if (detailed.changes.length > shown.length) {
        console.log(`    … ${detailed.changes.length - shown.length} more`);
      }

      if (WRITE) {
        const { error } = await sb
          .from("passages")
          .update({ text: next })
          .eq("id", row.id);
        if (error) throw new Error(`update passage: ${error.message}`);
      }
    }
  }

  if (WRITE) {
    const { randomUUID } = await import("crypto");
    await sb.from("activity_log").insert({
      id: randomUUID(),
      person_id: null,
      action: "repair_case_set_word_joins",
      target: "passages",
      meta: {
        passage_updates: passageUpdates,
        file_updates: fileUpdates,
        change_count: changeCount,
      },
      at: new Date().toISOString(),
    });
  }

  console.log(
    `\nDone. passages touched: ${passageUpdates}, files touched: ${fileUpdates}, token fixes: ${changeCount}${WRITE ? " (written)" : " (dry-run only)"}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
