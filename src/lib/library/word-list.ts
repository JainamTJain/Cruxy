/**
 * Compact English word set for passage text repair (ingest + one-off script).
 * Loaded once per process from the bundled generated list.
 */
import { ENGLISH_WORDS_RAW } from "@/lib/library/data/english-words.generated";

let cached: Set<string> | null = null;

export function englishWordSet(): Set<string> {
  if (cached) return cached;
  cached = new Set(
    ENGLISH_WORDS_RAW.split(/\n+/)
      .map((w) => w.trim().toLowerCase())
      .filter(Boolean),
  );
  return cached;
}

/** True when `token` (letters / apostrophes only) is in the word list. */
export function isDictionaryWord(token: string): boolean {
  const key = token
    .toLowerCase()
    .replace(/['\u2019]/g, "")
    .replace(/[^a-z]/g, "");
  if (!key) return false;
  return englishWordSet().has(key);
}
