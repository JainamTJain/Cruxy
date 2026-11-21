import {
  caseId,
  SEED_PERSON_IDS,
  SEED_TEAM_IDS,
  seedUuid,
} from "@/lib/seed/ids";
import { hashSessionCode } from "@/lib/practice/session-codes";
import {
  PRACTICE_FIXTURE_CODE,
  PRACTICE_FIXTURE_IDS as BASE_IDS,
} from "@/lib/practice/fixture-ids";

// Keep seedUuid keys aligned with fixture-ids.ts hard-coded values.
import type {
  AttendanceRow,
  BankEntry,
  CardScore,
  FeedbackItem,
  JudgeCard,
  JudgeRow,
  PracticeRound,
  PracticeSession,
  RecordingRow,
  RedoRow,
  RoundReport,
  SkillChart,
  TalkAnalytics,
  TranscriptLine,
} from "@/lib/practice/types";
import { DEFAULT_ROUND_TIMINGS } from "@/lib/practice/types";

export { PRACTICE_FIXTURE_CODE };

/** Stable fixture ids for design parity screens and shots. */
export const PRACTICE_FIXTURE_IDS = {
  ...BASE_IDS,
  recordingLive: seedUuid("practice:recording:live"),
  recordingReport: seedUuid("practice:recording:report"),
  judgeLehar: seedUuid("practice:judge:lehar"),
  judgeGuest: seedUuid("practice:judge:guest"),
  cardLehar: seedUuid("practice:card:lehar:t3"),
  cardCruxy: seedUuid("practice:card:cruxy:t3"),
  cardCruxyOpp: seedUuid("practice:card:cruxy:opp"),
  report: seedUuid("practice:report:case9"),
  bank: seedUuid("practice:bank:answer-first"),
  lineNick: seedUuid("practice:line:nick-open"),
  lineJainamWorked: seedUuid("practice:line:jainam-worked"),
  lineDaniel: seedUuid("practice:line:daniel"),
  lineLeharQ: seedUuid("practice:line:lehar-q"),
  lineJainamFix: seedUuid("practice:line:jainam-fix"),
  lineKatie: seedUuid("practice:line:katie"),
  lineJainamConsistency: seedUuid("practice:line:jainam-consistency"),
  fbWorked: seedUuid("practice:fb:worked"),
  fbFix: seedUuid("practice:fb:fix"),
  redo: seedUuid("practice:redo:kant"),
} as const;

export type PracticeFixtureBundle = {
  practice_sessions: PracticeSession[];
  practice_rounds: PracticeRound[];
  attendance: AttendanceRow[];
  recordings: RecordingRow[];
  transcript_lines: TranscriptLine[];
  judges: JudgeRow[];
  judge_cards: JudgeCard[];
  card_scores: CardScore[];
  feedback_items: FeedbackItem[];
  redos: RedoRow[];
  bank_entries: BankEntry[];
  round_reports: RoundReport[];
  skill_charts: SkillChart[];
  talk_analytics: TalkAnalytics[];
  guest_judge_tokens: {
    token_hash: string;
    judge_id: string;
    round_id: string;
    expires_at: string;
  }[];
  session_code_attempts: {
    key: string;
    failures: number;
    locked_until: string | null;
  }[];
  /** Sample-mode only: plaintext codes for admin reveal. Never sent to clients except via admin routes. */
  session_admin_codes: Record<string, string>;
};

export async function buildPracticeFixtures(): Promise<PracticeFixtureBundle> {
  const at = "2026-11-24T18:00:00.000Z";
  const codeHash = await hashSessionCode(PRACTICE_FIXTURE_CODE);
  const t1 = SEED_TEAM_IDS.team1;
  const t2 = SEED_TEAM_IDS.team2;
  const t3 = SEED_TEAM_IDS.team3;
  const case9 = caseId(9);
  const case5 = caseId(5);

  const session: PracticeSession = {
    id: PRACTICE_FIXTURE_IDS.session,
    kind: "admin",
    date: "2026-11-24",
    place: "Taper Hall 101",
    online: true,
    code_hash: codeHash,
    title: "Practice day",
    status: "live",
    created_by: SEED_PERSON_IDS["Dr. B"],
    created_at: at,
    mode: null,
    invite_team_ids: [],
  };

  const timingsLive = {
    ...DEFAULT_ROUND_TIMINGS,
    presentation_max: 10,
    commentary_max: 6,
    qa_max: 12,
  };

  const roundLive: PracticeRound = {
    id: PRACTICE_FIXTURE_IDS.roundLive,
    session_id: session.id,
    case_id: case9,
    case_number: 9,
    team_ids: [t3],
    sides: { presenting: t3, commenting: null },
    moderator: SEED_PERSON_IDS["Dr. B"],
    judges: { humans: [SEED_PERSON_IDS.Lehar], cruxy: true },
    timings: timingsLive,
    phase: "response",
    mode: "full_round",
    order: 0,
    started_at: "2026-11-24T18:05:00.000Z",
    ended_at: null,
    created_at: at,
    created_by: SEED_PERSON_IDS["Dr. B"],
  };

  const round2: PracticeRound = {
    id: PRACTICE_FIXTURE_IDS.round2,
    session_id: session.id,
    case_id: case5,
    case_number: 5,
    team_ids: [t2],
    sides: { presenting: t2, commenting: null },
    moderator: "cruxy",
    judges: { humans: [], cruxy: true },
    timings: {
      ...DEFAULT_ROUND_TIMINGS,
      presentation_max: 8,
      commentary_max: 5,
      qa_max: 10,
    },
    phase: "setup",
    mode: "full_round",
    order: 1,
    started_at: null,
    ended_at: null,
    created_at: at,
    created_by: SEED_PERSON_IDS["Dr. B"],
  };

  const round3: PracticeRound = {
    id: PRACTICE_FIXTURE_IDS.round3,
    session_id: session.id,
    case_id: null,
    case_number: null,
    team_ids: [t1, t2, t3],
    sides: { presenting: null, commenting: null },
    moderator: "cruxy",
    judges: { humans: [], cruxy: false },
    timings: DEFAULT_ROUND_TIMINGS,
    phase: "setup",
    mode: "moderator_drill",
    order: 2,
    started_at: null,
    ended_at: null,
    created_at: at,
    created_by: SEED_PERSON_IDS["Dr. B"],
  };

  /** Completed twin of the Case 9 round for the report screen. */
  const roundReport: PracticeRound = {
    id: PRACTICE_FIXTURE_IDS.roundReport,
    session_id: session.id,
    case_id: case9,
    case_number: 9,
    team_ids: [t3],
    sides: { presenting: t3, commenting: null },
    moderator: SEED_PERSON_IDS["Dr. B"],
    judges: { humans: [SEED_PERSON_IDS.Lehar], cruxy: true },
    timings: timingsLive,
    phase: "done",
    mode: "full_round",
    order: 3,
    started_at: "2026-11-24T17:00:00.000Z",
    ended_at: "2026-11-24T17:45:00.000Z",
    created_at: at,
    created_by: SEED_PERSON_IDS["Dr. B"],
  };

  const attendance: AttendanceRow[] = [
    {
      id: seedUuid("practice:att:jainam"),
      session_id: session.id,
      person_id: SEED_PERSON_IDS.Jainam,
      status: "present",
      source: "voice",
      created_at: at,
    },
    {
      id: seedUuid("practice:att:katie"),
      session_id: session.id,
      person_id: SEED_PERSON_IDS.Katie,
      status: "present",
      source: "voice",
      created_at: at,
    },
    {
      id: seedUuid("practice:att:nick"),
      session_id: session.id,
      person_id: SEED_PERSON_IDS.Nick,
      status: "present",
      source: "join",
      created_at: at,
    },
    {
      id: seedUuid("practice:att:daniel"),
      session_id: session.id,
      person_id: SEED_PERSON_IDS.Daniel,
      status: "present",
      source: "self",
      created_at: at,
    },
    {
      id: seedUuid("practice:att:serena"),
      session_id: session.id,
      person_id: SEED_PERSON_IDS.Serena,
      status: "present",
      source: "voice",
      created_at: at,
    },
    {
      id: seedUuid("practice:att:stolei"),
      session_id: session.id,
      person_id: SEED_PERSON_IDS.Stolei,
      status: "absent",
      source: "admin",
      created_at: at,
    },
    {
      id: seedUuid("practice:att:jade"),
      session_id: session.id,
      person_id: SEED_PERSON_IDS.Jade,
      status: "present",
      source: "self",
      created_at: at,
    },
    {
      id: seedUuid("practice:att:lehar"),
      session_id: session.id,
      person_id: SEED_PERSON_IDS.Lehar,
      status: "present",
      source: "join",
      created_at: at,
    },
    {
      id: seedUuid("practice:att:ivan"),
      session_id: session.id,
      person_id: SEED_PERSON_IDS.Ivan,
      status: "present",
      source: "self",
      created_at: at,
    },
    {
      id: seedUuid("practice:att:ashton"),
      session_id: session.id,
      person_id: SEED_PERSON_IDS.Ashton,
      status: "late",
      source: "self",
      created_at: at,
    },
    {
      id: seedUuid("practice:att:tri"),
      session_id: session.id,
      person_id: SEED_PERSON_IDS.Tri,
      status: "present",
      source: "join",
      created_at: at,
    },
  ];

  const recordingLive: RecordingRow = {
    id: PRACTICE_FIXTURE_IDS.recordingLive,
    round_id: roundLive.id,
    chunk_paths: [],
    chunk_meta: [],
    status: "recording",
    deleted_at: null,
    transcript_job_id: null,
    created_at: at,
    created_by: SEED_PERSON_IDS.Jainam,
  };

  const recordingReport: RecordingRow = {
    id: PRACTICE_FIXTURE_IDS.recordingReport,
    round_id: roundReport.id,
    chunk_paths: [],
    chunk_meta: [],
    status: "ready",
    deleted_at: "2026-11-24T17:46:00.000Z",
    transcript_job_id: "fixture",
    created_at: at,
    created_by: SEED_PERSON_IDS.Jainam,
  };

  const lines: TranscriptLine[] = [
    {
      id: PRACTICE_FIXTURE_IDS.lineNick,
      round_id: roundReport.id,
      start_ms: 12_000,
      end_ms: 28_000,
      speaker_person_id: SEED_PERSON_IDS.Nick,
      speaker_label: "Nick",
      text: "Thank you. The question asks whether museums may keep objects taken in war once the source community can care for them.",
      corrected: false,
      created_at: at,
    },
    {
      id: PRACTICE_FIXTURE_IDS.lineJainamWorked,
      round_id: roundReport.id,
      start_ms: 250_000,
      end_ms: 265_000,
      speaker_person_id: SEED_PERSON_IDS.Jainam,
      speaker_label: "Jainam",
      text: "Whoever benefits from a wrong carries the duty to repair it, even if they didn't commit it.",
      corrected: false,
      created_at: at,
    },
    {
      id: PRACTICE_FIXTURE_IDS.lineDaniel,
      round_id: roundReport.id,
      start_ms: 535_000,
      end_ms: 550_000,
      speaker_person_id: SEED_PERSON_IDS.Daniel,
      speaker_label: "Daniel",
      text: "Some people say too much time has passed for a return claim to hold.",
      corrected: false,
      created_at: at,
    },
    {
      id: PRACTICE_FIXTURE_IDS.lineLeharQ,
      round_id: roundReport.id,
      start_ms: 1_351_000,
      end_ms: 1_358_000,
      speaker_person_id: SEED_PERSON_IDS.Lehar,
      speaker_label: "Lehar (judge)",
      text: "If Egypt never asks, does the museum still owe anything?",
      corrected: false,
      created_at: at,
    },
    {
      id: PRACTICE_FIXTURE_IDS.lineJainamFix,
      round_id: roundReport.id,
      start_ms: 1_360_000,
      end_ms: 1_375_000,
      speaker_person_id: SEED_PERSON_IDS.Jainam,
      speaker_label: "Jainam",
      text: "So, um, the categorical imperative, basically, Kant says...",
      corrected: false,
      created_at: at,
    },
    {
      id: PRACTICE_FIXTURE_IDS.lineKatie,
      round_id: roundReport.id,
      start_ms: 1_378_000,
      end_ms: 1_395_000,
      speaker_person_id: SEED_PERSON_IDS.Katie,
      speaker_label: "Katie",
      text: "We'd apply the test to the Marbles case by case, and yes, we think it likely passes.",
      corrected: false,
      created_at: at,
    },
    {
      id: PRACTICE_FIXTURE_IDS.lineJainamConsistency,
      round_id: roundReport.id,
      start_ms: 1_407_000,
      end_ms: 1_425_000,
      speaker_person_id: SEED_PERSON_IDS.Jainam,
      speaker_label: "Jainam",
      text: "And that's the point of consistency: a principle that only runs against Europe isn't a principle.",
      corrected: false,
      created_at: at,
    },
  ];

  // Live round captions (subset mirrored for the practice room)
  const liveLines: TranscriptLine[] = [
    {
      ...lines[5]!,
      id: seedUuid("practice:line:live:katie"),
      round_id: roundLive.id,
      start_ms: 1_378_000,
    },
    {
      ...lines[6]!,
      id: seedUuid("practice:line:live:jainam"),
      round_id: roundLive.id,
      start_ms: 1_407_000,
    },
  ];

  const judgeLehar: JudgeRow = {
    id: PRACTICE_FIXTURE_IDS.judgeLehar,
    name: "Lehar",
    background: "Team 2 member; past practice judge",
    weight: null,
    person_id: SEED_PERSON_IDS.Lehar,
    guest_token_hash: null,
    created_at: at,
  };

  const cardLehar: JudgeCard = {
    id: PRACTICE_FIXTURE_IDS.cardLehar,
    round_id: roundReport.id,
    judge_id: judgeLehar.id,
    cruxy: false,
    team_id: t3,
    spirit: 4,
    spirit_comment: "Collegial throughout.",
    overall_comment: "Strong principle; open answers sooner.",
    moments: [
      {
        line_id: PRACTICE_FIXTURE_IDS.lineJainamWorked,
        note: "Principle landed cleanly",
      },
    ],
    predictions: null,
    calibration_note:
      "Evidence aligns with transcript; usable for calibration.",
    calibration_use: "full",
    created_at: at,
    created_by: SEED_PERSON_IDS.Lehar,
  };

  const cardCruxy: JudgeCard = {
    id: PRACTICE_FIXTURE_IDS.cardCruxy,
    round_id: roundReport.id,
    judge_id: null,
    cruxy: true,
    team_id: t3,
    spirit: 4,
    spirit_comment: "Respectful engagement.",
    overall_comment:
      "Clear structure; answer the judge before naming the theory.",
    moments: [],
    predictions: null,
    calibration_note: null,
    calibration_use: null,
    created_at: at,
    created_by: null,
  };

  const scoreRows: { item: string; lehar: number; cruxy: number; line: string; why: string }[] =
    [
      {
        item: "presentation_a",
        lehar: 6,
        cruxy: 5,
        line: PRACTICE_FIXTURE_IDS.lineNick,
        why: "Roadmap given; the answer came late, not in the first 30 seconds.",
      },
      {
        item: "presentation_b",
        lehar: 8,
        cruxy: 8,
        line: PRACTICE_FIXTURE_IDS.lineJainamWorked,
        why: "Corrective justice stated plainly and applied to the museum.",
      },
      {
        item: "presentation_c",
        lehar: 6,
        cruxy: 7,
        line: PRACTICE_FIXTURE_IDS.lineDaniel,
        why: "Waldron named but not answered.",
      },
      {
        item: "response_to_commentary",
        lehar: 8,
        cruxy: 8,
        line: PRACTICE_FIXTURE_IDS.lineKatie,
        why: "Took the Parthenon Marbles point head on.",
      },
      {
        item: "response_to_judges",
        lehar: 7,
        cruxy: 5,
        line: PRACTICE_FIXTURE_IDS.lineJainamFix,
        why: "Two answers opened with theory before the answer.",
      },
    ];

  const card_scores: CardScore[] = scoreRows.flatMap((row) => [
    {
      id: seedUuid(`practice:score:lehar:${row.item}`),
      card_id: cardLehar.id,
      item: row.item,
      score: row.lehar,
      comment: row.why,
      evidence_line_ids: [row.line],
      created_at: at,
    },
    {
      id: seedUuid(`practice:score:cruxy:${row.item}`),
      card_id: cardCruxy.id,
      item: row.item,
      score: row.cruxy,
      comment: row.why,
      evidence_line_ids: [row.line],
      created_at: at,
    },
  ]);

  const feedback_items: FeedbackItem[] = [
    {
      id: PRACTICE_FIXTURE_IDS.fbWorked,
      round_id: roundReport.id,
      person_id: SEED_PERSON_IDS.Jainam,
      kind: "worked",
      quote_line_id: PRACTICE_FIXTURE_IDS.lineJainamWorked,
      scoring_item: "presentation_b",
      reasoning:
        "One plain sentence stated the principle and tied it to the British Museum. That is what Presentation B rewards: the moral dimension named, then applied.",
      better_version: null,
      audience_heard: null,
      created_at: at,
    },
    {
      id: PRACTICE_FIXTURE_IDS.fbFix,
      round_id: roundReport.id,
      person_id: SEED_PERSON_IDS.Jainam,
      kind: "fix",
      quote_line_id: PRACTICE_FIXTURE_IDS.lineJainamFix,
      scoring_item: "response_to_judges",
      reasoning:
        "The judge asked a direct question and heard a philosopher's name before an answer. Judges are told theory only counts when it's explained and deepens the case, so naming Kant first spent 20 seconds without scoring. The answer itself was right; it arrived after the judge had started writing.",
      better_version:
        "No. If every museum kept whatever it could care for better, ownership would just go to the richest museum. That's Kant's test: a rule that can't work for everyone isn't a rule.",
      audience_heard: "A philosopher's name before an answer.",
      created_at: at,
    },
  ];

  const redos: RedoRow[] = [
    {
      id: PRACTICE_FIXTURE_IDS.redo,
      feedback_item_id: PRACTICE_FIXTURE_IDS.fbFix,
      person_id: SEED_PERSON_IDS.Jainam,
      transcript_ref: PRACTICE_FIXTURE_IDS.lineJainamFix,
      score_before: 5,
      score_after: null,
      open: true,
      created_at: at,
    },
  ];

  const round_reports: RoundReport[] = [
    {
      id: PRACTICE_FIXTURE_IDS.report,
      round_id: roundReport.id,
      headline:
        "Strong principle, slow start. The one fix: answer the question in the first 30 seconds.",
      socratic_followups: [
        "What would the other side say is your weakest support?",
        "Which stakeholder did you leave out, and why does that matter?",
        "If Egypt never asks, what standing offer keeps the duty alive?",
      ],
      proposal_ids: [],
      created_at: at,
    },
  ];

  const skill_charts: SkillChart[] = [
    {
      person_id: SEED_PERSON_IDS.Jainam,
      skills: {
        answer_first: 4.8,
        explain_frameworks: 6.2,
        engage_objections: 7.4,
        stay_under_time: 8.1,
        commentary_focus: 6.5,
      },
      updated_at: at,
    },
  ];

  const talk_analytics: TalkAnalytics[] = [
    {
      person_id: SEED_PERSON_IDS.Jainam,
      round_id: roundReport.id,
      talk_ms: 372_000,
      words: 920,
      filler_count: 9,
      time_to_first_answer_ms: 41_000,
      interruptions: 0,
    },
  ];

  const bank_entries: BankEntry[] = [
    {
      id: PRACTICE_FIXTURE_IDS.bank,
      lesson: "Answer first, then name the theory.",
      example_line_id: PRACTICE_FIXTURE_IDS.lineJainamFix,
      why: "Response to judges: 20 seconds before an answer. Judges reward theory only once it's explained.",
      improved:
        "No. If every museum kept what it cared for best, the richest museum would own everything.",
      drill_id: "thesis_30",
      seen_count: 3,
      case_id: case9,
      created_at: at,
      created_by: null,
    },
  ];

  return {
    practice_sessions: [session],
    practice_rounds: [roundLive, round2, round3, roundReport],
    attendance,
    recordings: [recordingLive, recordingReport],
    transcript_lines: [...lines, ...liveLines],
    judges: [judgeLehar],
    judge_cards: [cardLehar, cardCruxy],
    card_scores,
    feedback_items,
    redos,
    bank_entries,
    round_reports,
    skill_charts,
    talk_analytics,
    guest_judge_tokens: [],
    session_code_attempts: [],
    session_admin_codes: {
      [session.id]: PRACTICE_FIXTURE_CODE,
    },
  };
}
