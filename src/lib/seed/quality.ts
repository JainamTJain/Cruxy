/** Seed quality checks: no placeholders, no mid-word truncation. */

const BANNED = /\bValue A\b|\bValue B\b|\bTODO\b|\blorem\b/i;

/**
 * A string "ends mid-word" when it looks cut off:
 * - unmatched double quote, or
 * - Title-Case fragment cut short (e.g. "Killer Rob", "Robert Spar").
 */
export function endsMidWord(value: string): boolean {
  const t = value.trim();
  if (t.length < 6) return false;

  // Truncated Title Case fragment: "Killer Rob" / "Robert Sp" (2–3 letter stub).
  // Avoid false hits on "Presentation A" or "Sister City No More".
  if (
    /[A-Z][a-z]+ [A-Z][a-z]{1,2}$/.test(t) &&
    !/[.!?)\]…]["”']?$/.test(t)
  ) {
    return true;
  }
  // Obvious cut: ends with a single lowercase letter after a space ("post h").
  if (/ [a-z]$/.test(t)) return true;
  // Unmatched quote only when the string also looks cut off.
  const asciiQuotes = (t.match(/"/g) || []).length;
  if (asciiQuotes % 2 === 1 && /[A-Za-z]$/.test(t) && !/[.!?)]$/.test(t)) {
    return true;
  }
  return false;
}

function walkStrings(
  value: unknown,
  path: string,
  out: { path: string; text: string }[],
): void {
  if (typeof value === "string") {
    out.push({ path, text: value });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => walkStrings(v, `${path}[${i}]`, out));
    return;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      walkStrings(v, path ? `${path}.${k}` : k, out);
    }
  }
}

export function assertSeedQuality(bundle: unknown): void {
  const strings: { path: string; text: string }[] = [];
  walkStrings(bundle, "", strings);
  const failures: string[] = [];

  for (const { path, text } of strings) {
    if (BANNED.test(text)) {
      failures.push(
        `${path}: banned placeholder in ${JSON.stringify(text.slice(0, 80))}`,
      );
    }
    if (endsMidWord(text)) {
      failures.push(
        `${path}: ends mid-word ${JSON.stringify(text.slice(0, 100))}`,
      );
    }
  }

  if (failures.length) {
    throw new Error(
      `Seed quality failed (${failures.length}):\n${failures.slice(0, 40).join("\n")}`,
    );
  }
}
