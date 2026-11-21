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

export function backingChip(text: string): string {
  const short = text.replace(/\s+/g, " ").trim();
  if (short.length <= 42) return short;
  const cut = short.slice(0, 42);
  const at = cut.lastIndexOf(" ");
  return `${(at > 16 ? cut.slice(0, at) : cut).trim()}…`;
}
