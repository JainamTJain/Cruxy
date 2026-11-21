import {
  getGlossary,
  getRecordingForRound,
  getRoundById,
  getTranscript,
  getTranscriptLineById,
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
import {
  filterCitedFeedback,
  proposeBankEntry,
} from "@/lib/practice/feedback";
import {
  getPersonById,
  listTeams,
  logActivity,
} from "@/lib/db/repository";
import { saveBankEntry } from "@/lib/db/practice-repository";
import { nowIso } from "@/lib/utils";

/** Cite-or-quiet: keep only feedback that links to a real transcript line. */
async function citeOrQuietFeedback<T extends { quote_line_id: string | null }>(
  feedback: T[],
  lines: { id: string; text: string }[],
): Promise<T[]> {
  return filterCitedFeedback(
    feedback as unknown as Parameters<typeof filterCitedFeedback>[0],
    lines as unknown as Parameters<typeof filterCitedFeedback>[1],
  ) as unknown as T[];
}

/**
 * End-of-round pipeline:
 * 1. Concat chunks → AssemblyAI (or stub)
 * 2. Glossary correction + speaker match
 * 3. Save transcript
 * 4. Delete audio immediately
 * 5. If no human judges (or cruxy requested), run Cruxy judge for every team
 * 6. Seed "Things to take care of" bank from fix feedback
 */
export async function finalizeRound(opts: {
  roundId: string;
  personId?: string | null;
  forceCruxy?: boolean;
  /** Fail instead of stubbing when AssemblyAI / Cruxy keys should be live. */
  requireLive?: boolean;
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
    speakersExpected: Math.max(presentIds.length, 2),
    requireLive: opts.requireLive,
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
        : (await listTeams()).slice(0, 1).map((t) => t.id);
    const roundForJudge = { ...round, team_ids: teams };
    judgment = await runCruxyJudge({
      round: roundForJudge,
      lines,
      personId: opts.personId,
    });
    // Cite-or-quiet on feedback (H citation validator when available)
    judgment.feedback = await citeOrQuietFeedback(judgment.feedback, lines);
    await saveJudgmentBundle(judgment);

    // Bank: one "Things to take care of" entry per fix that still has a citation.
    let bankAdded = 0;
    for (const f of judgment.feedback.filter((x) => x.kind === "fix")) {
      const entry = proposeBankEntry({
        lesson: f.reasoning.slice(0, 200) || "Answer the moral tension first.",
        exampleLineId: f.quote_line_id,
        why: f.reasoning,
        improved: f.better_version ?? "",
        caseId: round.case_id,
        createdBy: opts.personId ?? null,
      });
      await saveBankEntry(entry);
      bankAdded += 1;
    }

    await logActivity({
      person_id: opts.personId ?? null,
      action: "cruxy_judge_completed",
      target: opts.roundId,
      meta: {
        teams: teams.length,
        cards: judgment.cards.length,
        stub: judgment.stub,
        bankAdded,
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
  const line = await getTranscriptLineById(opts.lineId);
  if (!line) throw new Error("Line not found");
  const glossary = await getGlossary(opts.caseId);
  const learned = learnMisheard(glossary, opts.correctTerm, opts.misheardForm);
  await updateGlossary(learned);
  const next = { ...line, text: opts.newText, corrected: true };
  await saveTranscriptLines([next]);
  return next;
}
