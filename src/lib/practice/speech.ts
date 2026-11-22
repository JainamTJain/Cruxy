/** Browser SpeechSynthesis helpers for drill read-aloud. */

export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function speakText(text: string, opts?: { rate?: number }): void {
  if (!canSpeak() || !text.trim()) return;
  const trimmed = text.trim();
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(trimmed);
  u.rate = opts?.rate ?? 1;
  window.speechSynthesis.speak(u);
  // Wave 9 I: always show a transcript when audio plays.
  try {
    window.dispatchEvent(
      new CustomEvent("crux-speech-caption", { detail: { text: trimmed } }),
    );
  } catch {
    /* ignore */
  }
}

export function stopSpeaking(): void {
  if (!canSpeak()) return;
  window.speechSynthesis.cancel();
}
