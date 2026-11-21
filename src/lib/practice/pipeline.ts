import {
  getGlossary,
  getRecordingForRound,
  getRoundById,
  getTranscript,
  listAttendance,
  saveJudgmentBundle,
  saveRecording,
  saveSpeakerConfirm,
  saveTranscriptLines,
  updateGlossary,
} from "@/lib/db/practice-repository";
import { learnMisheard, keyTermsForRound } from "@/lib/practice/glossary";
import {
  concatChunksToBuffer,
  deleteRecordingAudio,
} from "@/lib/practice/recording";
import {
  matchSpeakersByRole,
  transcribeWithSpeakerLabels,
  utterancesToLines,
} from "@/lib/practice/transcription";
import { runCruxyJudge } from "@/lib/practice/cruxy-judge";
import { filterCitedFeedback } from "@/lib/practice/feedback";
import { getPersonById, logActivity } from "@/lib/db/repository";
import { readStore } from "@/lib/db/sample-store";
import { nowIso } from "@/lib/utils";

/**
 * End-of-round pipeline:
 * 1. Concat chunks → AssemblyAI (or stub)
 * 2. Glossary correction + speaker match
 * 3. Save transcript
 * 4. Delete audio immediately
 * 5. If no human judges (or cruxy requested), run Cruxy judge for every team
 */
export async function finalizeRound(opts: {
  roundId: string;
  personId?: string | null;
  forceCruxy?: boolean;
}) {
  const round = await getRoundById(opts.roundId);
  if (!round) throw new Error("Round not found");

  let recording = await getRecordingForRound(opts.roundId);
  if (!recording || recording.chunk_paths.length === 0) {
    // Allow finalize without audio (text-only / stub path) by synthesizing empty job
    recording = {
      id: recording?.id ?? `no-audio-${opts.roundId}`,
      round_id: opts.roundId,
      chunk_paths: [],
      chunk_meta: [],
      status: "transcribing",
      deleted_at: null,
      transcript_job_id: null,
      created_at: nowIso(),
      created_by: opts.personId ?? null,
    };
  } else {
    recording = { ...recording, status: "transcribing" };
    await saveRecording(recording);
  }

  const attendance = await listAttendance(round.session_id);
  const presentIds = attendance
    .filter((a) => a.status === "present" || a.status === "late")
    .map((a) => a.person_id);
  const store = await readStore();
  const presentNames = (
    await Promise.all(presentIds.map((id) => getPersonById(id)))
  )
    .filter(Boolean)
    .map((p) => p!.name);

  const glossary = await getGlossary(round.case_id);
  const keyTerms = keyTermsForRound(glossary, presentNames);

  let audio: Buffer = Buffer.from("stub");
  if (recording.chunk_paths.length > 0) {
    audio = Buffer.from(await concatChunksToBuffer(recording));
  }

  const transcript = await transcribeWithSpeakerLabels({
    audio,
    keyTerms,
    roundId: opts.roundId,
  });

  const speakerMap = matchSpeakersByRole(transcript.utterances, presentIds);
  const lines = utterancesToLines(
    opts.roundId,
    transcript.utterances,
    glossary,
    speakerMap,
  );
  await saveTranscriptLines(lines);

  await saveSpeakerConfirm({
    round_id: opts.roundId,
    mappings: Object.entries(speakerMap).map(([speaker_label, person_id]) => ({
      speaker_label,
      person_id,
    })),
    confirmed_by: null,
    confirmed_at: null,
  });

  // Audio deleted immediately after transcript saved
  if (recording.chunk_paths.length > 0) {
    recording = await deleteRecordingAudio({
      ...recording,
      transcript_job_id: transcript.jobId,
    });
  } else {
    recording = {
      ...recording,
      status: "ready",
      deleted_at: nowIso(),
      transcript_job_id: transcript.jobId,
      chunk_paths: [],
      chunk_meta: [],
    };
  }
  await saveRecording(recording);

  await logActivity({
    person_id: opts.personId ?? null,
    action: "transcript_saved_audio_deleted",
    target: opts.roundId,
    meta: {
      lines: lines.length,
      stub: transcript.stub,
      audio_gone: Boolean(recording.deleted_at),
    },
  });

  const wantCruxy =
    opts.forceCruxy ||
    round.judges.cruxy ||
    round.judges.humans.length === 0;

  let judgment = null;
  if (wantCruxy) {
    // Ensure every team gets a Cruxy card
    const teams =
      round.team_ids.length > 0
        ? round.team_ids
        : store.teams.slice(0, 1).map((t) => t.id);
    const roundForJudge = { ...round, team_ids: teams };
    judgment = await runCruxyJudge({
      round: roundForJudge,
      lines,
      personId: opts.personId,
    });
    // Cite-or-quiet on feedback
    judgment.feedback = filterCitedFeedback(judgment.feedback, lines);
    // Drop feedback without citations entirely from display bundle
    await saveJudgmentBundle(judgment);
    await logActivity({
      person_id: opts.personId ?? null,
      action: "cruxy_judge_completed",
      target: opts.roundId,
      meta: {
        teams: teams.length,
        cards: judgment.cards.length,
        stub: judgment.stub,
      },
    });
  }

  return {
    recording,
    lines,
    judgment,
    transcriptStub: transcript.stub,
  };
}

export async function confirmSpeakerLabels(opts: {
  roundId: string;
  mappings: { speaker_label: string; person_id: string | null }[];
  confirmedBy: string;
}) {
  const lines = await getTranscript(opts.roundId);
  const updated = lines.map((l) => {
    const m = opts.mappings.find((x) => x.speaker_label === l.speaker_label);
    if (!m) return l;
    return { ...l, speaker_person_id: m.person_id };
  });
  await saveTranscriptLines(updated);
  await saveSpeakerConfirm({
    round_id: opts.roundId,
    mappings: opts.mappings,
    confirmed_by: opts.confirmedBy,
    confirmed_at: nowIso(),
  });
  return updated;
}

export async function fixTranscriptWord(opts: {
  lineId: string;
  newText: string;
  correctTerm: string;
  misheardForm: string;
  caseId: string | null;
}) {
  const store = await readStore();
  const line = store.transcript_lines.find((l) => l.id === opts.lineId);
  if (!line) throw new Error("Line not found");
  const glossary = await getGlossary(opts.caseId);
  const learned = learnMisheard(glossary, opts.correctTerm, opts.misheardForm);
  await updateGlossary(learned);
  const next = { ...line, text: opts.newText, corrected: true };
  await saveTranscriptLines([next]);
  return next;
}
