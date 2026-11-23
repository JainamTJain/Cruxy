/**
 * Text people read must never show database ids or stray markdown.
 * AI agents cite sources by id in structured fields; when an id slips into a
 * sentence, it is replaced by the source's name (when known) or dropped.
 * Pure: safe on client and server.
 */

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const LIST = `${UUID}(?:\\s*[,;]\\s*${UUID})*`;
const LABEL = "(?:(?:source|sources|id|ids|ref|refs|cite|citation)\\s*[:#]?\\s*)?";
const WRAPPED = new RegExp(`\\s*[\\[(]${LABEL}(${LIST})[\\])]`, "gi");
const BARE = new RegExp(UUID, "gi");

export function cleanReaderText(
  text: string,
  names?: ReadonlyMap<string, string>,
): string {
  if (!text) return text;
  let t = text.replace(WRAPPED, (_m, ids: string) => {
    if (!names) return "";
    const named = ids
      .split(/\s*[,;]\s*/)
      .map((id) => names.get(id.toLowerCase()))
      .filter((n): n is string => Boolean(n));
    const unique = [...new Set(named)];
    return unique.length ? ` (${unique.join("; ")})` : "";
  });
  t = t.replace(BARE, (id) => names?.get(id.toLowerCase()) ?? "");
  // Markdown emphasis that renders as literal asterisks.
  t = t.replace(/\*\*(.+?)\*\*/g, "$1").replace(/__(.+?)__/g, "$1");
  // Tidy spacing left behind by removals.
  t = t
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    .replace(/\(\s*\)/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+$/gm, "");
  return t.trim();
}

const SKIP_KEY = /(^id$|_id$|^ids$|_ids$|citation|anchor|url|link|href|source_ref|^ref$)/i;

function scrubValue(v: unknown, key: string | null): unknown {
  if (typeof v === "string") {
    return key && SKIP_KEY.test(key) ? v : cleanReaderText(v);
  }
  if (Array.isArray(v)) {
    return key && SKIP_KEY.test(key) ? v : v.map((x) => scrubValue(x, null));
  }
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = scrubValue(x, k);
    return out;
  }
  return v;
}

/**
 * Clean an AI reply before it is stored or shown. JSON replies keep their id
 * and citation fields; every other string field is cleaned. Plain replies are
 * cleaned whole. Anything ambiguous is left as it was.
 */
export function scrubAiText(text: string): string {
  if (!text || !new RegExp(UUID, "i").test(text) && !text.includes("**")) {
    return text;
  }
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const body = fenced ? fenced[1]! : trimmed;
  if (body.startsWith("{") || body.startsWith("[")) {
    try {
      return JSON.stringify(scrubValue(JSON.parse(body), null));
    } catch {
      return text;
    }
  }
  if (body.includes("{")) return text;
  return cleanReaderText(text);
}
