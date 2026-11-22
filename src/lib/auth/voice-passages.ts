/**
 * Short original passages for consent voice enrollment.
 * Ethics Bowl themed, phonetically varied, plain words.
 * Not quoted from any book or case packet.
 */

export type VoicePassage = {
  id: string;
  title: string;
  text: string;
};

export const VOICE_ENROLLMENT_PASSAGES: VoicePassage[] = [
  {
    id: "thesis",
    title: "Opening",
    text: "Judges look for a clear moral question. State your thesis early so the room can follow the case from the first minute.",
  },
  {
    id: "objection",
    title: "Commentary",
    text: "The other team may raise a sharp objection. Answer the strongest version of their point, not a weaker one you prefer.",
  },
  {
    id: "evidence",
    title: "Evidence",
    text: "Facts from the packet matter more than clever lines. When you cite a source, say why it changes the judgment.",
  },
  {
    id: "qa",
    title: "Judges' questions",
    text: "During questions, pause, then answer. Name the tension you see, and keep jargon out unless you explain it.",
  },
];

/** Target voiced speech for a stable text-independent enrollment. */
export const VOICED_TARGET_SECONDS = 30;

export function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}
