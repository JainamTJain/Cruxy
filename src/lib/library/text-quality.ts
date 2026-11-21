/** True when text is mostly readable characters (not binary junk). */
export function looksLikeReadableText(text: string): boolean {
  const sample = text.slice(0, 4000);
  if (sample.length < 20) return true;
  const readable = sample.match(/[\p{L}\p{N}\s.,;:'"()\-!?%$&/]/gu)?.length ?? 0;
  return readable / sample.length >= 0.85;
}
