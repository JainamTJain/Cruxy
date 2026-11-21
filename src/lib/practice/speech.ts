/** Browser SpeechSynthesis helpers for drill read-aloud. */

export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function speakText(text: string, opts?: { rate?: number }): void {
  if (!canSpeak() || !text.trim()) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.trim());
  u.rate = opts?.rate ?? 1;
  window.speechSynthesis.speak(u);
}

export function stopSpeaking(): void {
  if (!canSpeak()) return;
  window.speechSynthesis.cancel();
}
