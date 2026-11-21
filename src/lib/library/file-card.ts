/**
 * Normalize Librarian file cards to five lines (F-086).
 * Lines: What / Case(s) / Type / New / Open.
 */

export function normalizeFiveLineCard(input: {
  name: string;
  caseNumbers: number[];
  type: string;
  card?: string | null;
  newLine?: string | null;
  openLine?: string | null;
}): string {
  const raw = (input.card ?? "").split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const pick = (prefixes: string[], fallback: string) => {
    for (const line of raw) {
      for (const p of prefixes) {
        if (line.toLowerCase().startsWith(p.toLowerCase())) {
          return line.includes(":") ? line : `${p}: ${line}`;
        }
      }
    }
    return fallback;
  };

  const what = pick(["What", "What:"], `What: ${input.name}`);
  const cases = pick(
    ["Case", "Case(s)", "Cases"],
    `Case(s): ${
      input.caseNumbers.length ? input.caseNumbers.join(", ") : "general"
    }`,
  );
  const type = pick(["Type"], `Type: ${input.type}`);
  const neu = pick(
    ["New", "What's new", "Whats new"],
    `New: ${input.newLine?.slice(0, 140) || "See passages."}`,
  );
  const open = pick(
    ["Open", "Open questions", "Questions"],
    `Open: ${input.openLine?.slice(0, 140) || "Any gaps vs claim maps?"}`,
  );

  return [what, cases, type, neu, open]
    .map((line) => line.replace(/\u00b7/g, ",").replace(/\u2014/g, "-"))
    .join("\n");
}
