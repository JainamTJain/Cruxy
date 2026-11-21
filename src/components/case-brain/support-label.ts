/** Split "Short title. Longer body…" for claim-map support cards. */
export function supportLabel(text: string): { title: string; body: string } {
  const trimmed = text.trim();
  const dot = trimmed.indexOf(". ");
  if (dot > 0 && dot < 72) {
    return {
      title: trimmed.slice(0, dot).trim(),
      body: trimmed.slice(dot + 2).trim(),
    };
  }
  return { title: trimmed, body: "" };
}

type BackingLike = {
  kind?: string;
  text: string;
};

/** Short mono chip for a backing (prefer source label over a long sentence). */
export function backingChip(backing: string | BackingLike): string {
  const kind = typeof backing === "string" ? undefined : backing.kind;
  const text = (typeof backing === "string" ? backing : backing.text)
    .replace(/\s+/g, " ")
    .trim();

  if (kind === "case_fact" || /\bcase set\b/i.test(text)) {
    const head = text.split(/[.;]/)[0]?.trim() ?? text;
    const short = head.length <= 28 ? head : `${head.slice(0, 24).trim()}…`;
    return /\bcase set\b/i.test(short) ? short : `${short}, case set`;
  }

  // Prefer a short proper-noun / Act / year label before the first period.
  const first = text.split(/[.;:]/)[0]?.trim() ?? text;
  if (first.length > 0 && first.length <= 42) return first;

  const cut = text.slice(0, 42);
  const at = cut.lastIndexOf(" ");
  return `${(at > 16 ? cut.slice(0, at) : cut).trim()}…`;
}
