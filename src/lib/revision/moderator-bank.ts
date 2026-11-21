import type { QuestionType } from "@/lib/revision/types";

const TYPE_HINTS: { type: QuestionType; patterns: RegExp[] }[] = [
  {
    type: "change_facts",
    patterns: [
      /what if/i,
      /suppose/i,
      /change the facts/i,
      /hypothetic/i,
      /if instead/i,
    ],
  },
  {
    type: "pushback",
    patterns: [
      /isn't that/i,
      /how do you respond/i,
      /objection/i,
      /push\s*back/i,
      /challenge/i,
    ],
  },
  {
    type: "other_team",
    patterns: [
      /other team/i,
      /opposing/i,
      /their claim/i,
      /they argue/i,
      /commentary/i,
    ],
  },
  {
    type: "state_view",
    patterns: [
      /state your (view|position)/i,
      /main reasons/i,
      /in one sentence/i,
      /what is your (view|position)/i,
    ],
  },
  {
    type: "closing",
    patterns: [/closing/i, /final question/i, /wrap.?up/i],
  },
  {
    type: "follow_up",
    patterns: [/follow.?up/i, /you skipped/i, /earlier you/i, /go back/i],
  },
];

/**
 * Split unstructured paste (email, list, transcript) into single questions.
 * Used when Dr. B pastes into the moderator bank.
 */
export function splitPasteIntoQuestions(raw: string): {
  text: string;
  type: QuestionType;
  difficulty: 1 | 2 | 3;
}[] {
  const cleaned = raw.replace(/\r\n/g, "\n").trim();
  if (!cleaned) return [];

  // Prefer numbered / bulleted lines; else split on ? or blank lines
  let chunks: string[] = [];
  const lineSplit = cleaned
    .split(/\n+/)
    .map((l) => l.replace(/^\s*[-*•\d.)]+\s*/, "").trim())
    .filter(Boolean);

  if (lineSplit.length >= 2) {
    chunks = lineSplit;
  } else {
    chunks = cleaned
      .split(/(?<=\?)\s+/)
      .map((c) => c.trim())
      .filter(Boolean);
  }

  // Merge fragments that don't look like questions into previous
  const merged: string[] = [];
  for (const c of chunks) {
    if (
      merged.length &&
      !/[?]/.test(c) &&
      c.length < 40 &&
      !/^(what|why|how|who|when|where|is|are|do|does|did|can|could|should|would)\b/i.test(
        c,
      )
    ) {
      merged[merged.length - 1] = `${merged[merged.length - 1]} ${c}`.trim();
    } else {
      merged.push(c);
    }
  }

  return merged
    .map((text) => {
      let t = text.trim();
      if (!t.endsWith("?") && /^(what|why|how|who|when|where|is|are|do|does|should|would|can|could)\b/i.test(t)) {
        t = `${t}?`;
      }
      return {
        text: t,
        type: inferType(t),
        difficulty: inferDifficulty(t),
      };
    })
    .filter((q) => q.text.length >= 8);
}

function inferType(text: string): QuestionType {
  for (const hint of TYPE_HINTS) {
    if (hint.patterns.some((p) => p.test(text))) return hint.type;
  }
  return "follow_up";
}

function inferDifficulty(text: string): 1 | 2 | 3 {
  if (/change the facts|hypothetic|second.?order|slippery/i.test(text)) {
    return 3;
  }
  if (/why|how would|respond|distinguish|counter/i.test(text)) return 2;
  return 1;
}

/**
 * Weighted random serve: prefer unseen, low-scored, and person's cases.
 * Never repeats a question id already in `seenInSession`.
 */
export function pickWeightedQuestion<
  T extends {
    id: string;
    case_id: string;
    difficulty: number;
  },
>(args: {
  pool: T[];
  seenInSession: Set<string>;
  caseIdsPreferred: string[];
  scoresByQuestion: Map<string, number[]>;
}): T | null {
  const candidates = args.pool.filter((q) => !args.seenInSession.has(q.id));
  if (candidates.length === 0) return null;

  const preferred = new Set(args.caseIdsPreferred);
  const weights = candidates.map((q) => {
    let w = 1;
    if (preferred.has(q.case_id)) w += 3;
    const scores = args.scoresByQuestion.get(q.id) ?? [];
    if (scores.length === 0) w += 4; // unseen
    else {
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      if (avg < 0.6) w += 3; // weak area
    }
    w += q.difficulty * 0.25;
    return w;
  });

  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}
