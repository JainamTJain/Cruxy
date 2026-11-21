import {
  getGlossary,
  getRecordingForRound,
  getRoundById,
  getTranscript,
  getTranscriptLineById,
  listAttendance,
  listRecordingsForRound,
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
import {
  queueRoundIdeasToTruthSources,
  suggestIdeasFromTranscript,
  updateSkillsAfterRound,
} from "@/lib/practice/wave5";
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

  // F-219 / F-220: own-device and mixed may have several recordings lined up by started_at.
  let recordings = await listRecordingsForRound(opts.roundId);
  if (recordings.length === 0) {
    const single = await getRecordingForRound(opts.roundId);
    if (single) recordings = [single];
  }
  let recording = recordings[0] ?? null;
  if (!recording || recordings.every((r) => r.chunk_paths.length === 0)) {
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
      owner_person_id: recording?.owner_person_id ?? null,
      started_at: recording?.started_at ?? nowIso(),
    };
    recordings = [recording];
  } else {
    recordings = recordings.map((r) => ({ ...r, status: "transcribing" as const }));
    for (const r of recordings) await saveRecording(r);
    recording = recordings[0]!;
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

  // Line mixed device audio up by wall-clock start (F-220).
  const parts: Buffer[] = [];
  const ownerOffsets: { ownerId: string | null; offsetMs: number }[] = [];
  let cursorMs = 0;
  const baseStart = recordings
    .map((r) => (r.started_at ? Date.parse(r.started_at) : NaN))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b)[0];

  for (const r of recordings) {
    if (r.chunk_paths.length === 0) continue;
    const buf = Buffer.from(await concatChunksToBuffer(r));
    const startMs =
      r.started_at && Number.isFinite(baseStart)
        ? Math.max(0, Date.parse(r.started_at) - (baseStart as number))
        : cursorMs;
    ownerOffsets.push({
      ownerId: r.owner_person_id ?? null,
      offsetMs: startMs,
    });
    parts.push(buf);
    cursorMs = startMs + 1000;
  }
  const audio: Buffer =
    parts.length > 0 ? Buffer.concat(parts) : Buffer.from("stub");

  const transcript = await transcribeWithSpeakerLabels({
    audio,
    keyTerms,
    roundId: opts.roundId,
    speakersExpected: Math.max(presentIds.length, 2),
    requireLive: opts.requireLive,
  });

  const speakerMap = matchSpeakersByRole(transcript.utterances, presentIds);
  // Own-device: prefer the recording owner as the speaker for that stream.
  for (const o of ownerOffsets) {
    if (o.ownerId && !Object.values(speakerMap).includes(o.ownerId)) {
      const label = Object.keys(speakerMap).find((k) => !speakerMap[k]);
      if (label) speakerMap[label] = o.ownerId;
      else speakerMap[`A${Object.keys(speakerMap).length + 1}`] = o.ownerId;
    }
  }
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

  // Audio deleted immediately after transcript saved (every device stream).
  const cleaned = [];
  for (const r of recordings) {
    if (r.chunk_paths.length > 0) {
      cleaned.push(
        await deleteRecordingAudio({
          ...r,
          transcript_job_id: transcript.jobId,
        }),
      );
    } else {
      cleaned.push({
        ...r,
        status: "ready" as const,
        deleted_at: nowIso(),
        transcript_job_id: transcript.jobId,
        chunk_paths: [],
        chunk_meta: [],
      });
    }
  }
  for (const r of cleaned) await saveRecording(r);
  recording = cleaned[0]!;

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

    // F-278: update skills and promote stalls to roadmap drills.
    const speakerIds = [
      ...new Set(
        lines
          .map((l) => l.speaker_person_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    for (const personId of speakerIds.length ? speakerIds : presentIds) {
      const improved = judgment.feedback.some(
        (f) => f.person_id === personId && f.kind === "worked",
      );
      await updateSkillsAfterRound({
        personId,
        caseId: round.case_id,
        improved,
      });
    }
  }

  // F-276: ideas from the transcript → Truth Sources queue.
  const ideas = suggestIdeasFromTranscript(lines);
  if (ideas.length && round.team_ids[0]) {
    await queueRoundIdeasToTruthSources({
      roundId: opts.roundId,
      teamId: round.team_ids[0],
      personId: opts.personId ?? presentIds[0] ?? round.created_by ?? "",
      ideas: ideas.map((i) => ({ text: i.text, lineId: i.lineId })),
    });
  }

  // Wave 6: personal Brier from required predictions vs judged scores.
  if (wantCruxy && judgment) {
    const { computeBrierAfterJudging } = await import(
      "@/lib/practice/predictions"
    );
    await computeBrierAfterJudging({ roundId: opts.roundId });
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
