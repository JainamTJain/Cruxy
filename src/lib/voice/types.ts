/** Voiceprint / speaker-matching types (Workstream D, migration 00076). */

export const VOICEPRINT_DIM = 192;

export type EnrollmentPartId = "read" | "natural" | "competition";

export type EnrollmentPartQuality = {
  part: EnrollmentPartId;
  ok: boolean;
  voiced_seconds: number;
  level_ok: boolean;
  clipping: boolean;
  noisy: boolean;
  /** Read part only: fraction of expected words heard. */
  word_match?: number;
  redo_reason: string | null;
};

export type VoiceprintMeta = {
  parts: EnrollmentPartQuality[];
  consistency: number;
  model: "ecapa-onnx" | "spectral-fallback";
  enrolled_at: string;
};

export type SpeakerMatchSource = "voiceprint" | "name" | "role" | "manual";

export type SpeakerMapping = {
  speaker_label: string;
  person_id: string | null;
  confidence?: number;
  source?: SpeakerMatchSource;
};

export type SpeakerMatchPending = {
  id: string;
  round_id: string;
  speaker_label: string;
  clip_path: string | null;
  candidates: { person_id: string; name: string; score: number }[];
  embedding: number[] | null;
  created_at: string;
  resolved_at: string | null;
  resolved_person_id: string | null;
};

export type MatchResult = {
  mappings: SpeakerMapping[];
  pending: Omit<
    SpeakerMatchPending,
    "id" | "created_at" | "resolved_at" | "resolved_person_id"
  >[];
};
