import { promises as fs } from "fs";
import path from "path";
import { CASE_TITLES } from "@/lib/constants";
import {
  caseId,
  CONTENT_ORIGIN,
  SEED_CREATED_AT,
  SEED_PERSON_IDS,
  SEED_TEAM_IDS,
  seedUuid,
} from "@/lib/seed/ids";
import { parseCaseMarkdown, type ParsedCase } from "@/lib/seed/parse-case";
import { buildScoringCardItems } from "@/lib/seed/scoring-card";
import type {
  Backing,
  CaseRole,
  Claim,
  Counterclaim,
  OpposingPosition,
  Proposal,
  Support,
  TruthItem,
} from "@/lib/case-brain/types";
import type { Flashcard } from "@/lib/library/types";
import type {
  ModeratorQuestion,
  OnePager,
  OnePagerBody,
} from "@/lib/revision/types";
import type { CaseRow } from "@/lib/types";

const TEAM3 = SEED_TEAM_IDS.team3;
const TEAM1 = SEED_TEAM_IDS.team1;
const TEAM2 = SEED_TEAM_IDS.team2;
const NICK = SEED_PERSON_IDS.Nick;
const DANIEL = SEED_PERSON_IDS.Daniel;
const KATIE = SEED_PERSON_IDS.Katie;
const JAINAM = SEED_PERSON_IDS.Jainam;
const NOW = SEED_CREATED_AT;

const TEAM3_MEMBERS = [NICK, DANIEL, KATIE, JAINAM] as const;
const ROLE_CYCLE = [
  "lead_1",
  "lead_2",
  "counter_arguer",
  "supporter",
] as const;

export interface CaseStakeholderSeed {
  id: string;
  case_id: string;
  who: string;
  stake: string;
  voice_in_case: string | null;
  ord: number;
  origin: string;
  created_at: string;
  created_by: string | null;
}

export interface ContentSeedBundle {
  cases: CaseRow[];
  stakeholders: CaseStakeholderSeed[];
  claims: Claim[];
  supports: Support[];
  backings: Backing[];
  counterclaims: Counterclaim[];
  truth_items: TruthItem[];
  opposing_positions: OpposingPosition[];
  questions: ModeratorQuestion[];
  one_pagers: OnePager[];
  flashcards: Flashcard[];
  case_roles: CaseRole[];
  deck_opt_ins: {
    id: string;
    person_id: string;
    team_id: string;
    case_id: string;
    assigned: boolean;
    created_at: string;
  }[];
  proposals: Proposal[];
  scoring_card_items: ReturnType<typeof buildScoringCardItems>;
  parsed: ParsedCase[];
}

function guessQuestionType(
  text: string,
): ModeratorQuestion["type"] {
  const t = text.toLowerCase();
  if (/what if|suppose|change the facts|hypothetic|if .* were/.test(t))
    return "change_facts";
  if (/isn't|how do you respond|objection|push/.test(t)) return "pushback";
  if (/other team|opposing|they argue|their claim/.test(t)) return "other_team";
  if (/state your|main reasons|in one sentence|what is your view/.test(t))
    return "state_view";
  if (/closing|case's own|case's question|framing question/.test(t))
    return "closing";
  if (/follow.?up|skipped|earlier you/.test(t)) return "follow_up";
  return "follow_up";
}

function difficultyFor(text: string, index: number): 1 | 2 | 3 {
  if (/what would change|flip test|provably|always/.test(text.toLowerCase()))
    return 3;
  if (index === 0) return 1;
  return index % 3 === 2 ? 3 : 2;
}

/** Split a crux written as "X *versus* Y" (or plain versus) into scale poles. */
export function splitCruxValues(crux: string): { left: string; right: string } {
  const cleaned = crux.replace(/\*+/g, "").replace(/\s+/g, " ").trim();
  const parts = cleaned.split(/\s+versus\s+/i);
  if (parts.length >= 2 && parts[0]!.trim() && parts[1]!.trim()) {
    return {
      left: parts[0]!.trim().replace(/[.,;:]+$/, ""),
      right: parts.slice(1).join(" versus ").trim().replace(/[.,;:]+$/, ""),
    };
  }
  const vs = cleaned.split(/\s+vs\.?\s+/i);
  if (vs.length >= 2 && vs[0]!.trim() && vs[1]!.trim()) {
    return {
      left: vs[0]!.trim().replace(/[.,;:]+$/, ""),
      right: vs.slice(1).join(" vs ").trim().replace(/[.,;:]+$/, ""),
    };
  }
  throw new Error(`Crux has no versus split: ${cleaned.slice(0, 120)}`);
}

/** Turn a framework backing / sentence into a short name + full one-liner. */
export function nameFramework(text: string): { name: string; one_line: string } {
  const one_line = text.replace(/\s+/g, " ").trim();

  const quoted = one_line.match(
    /([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)\s*'s\s+[“"']([^”"']+)[”"']\s*(\(\d{4}\))?/,
  );
  if (quoted) {
    const year = quoted[3] ? ` ${quoted[3]}` : "";
    return { name: `${quoted[1]}, ${quoted[2]}${year}`, one_line };
  }

  // Named works in italics: Margalit's *The Ethics of Memory*
  const ital = one_line.match(
    /([A-Z][a-zA-Z]+)\s*'s\s+\*([^*]+)\*/,
  );
  if (ital) return { name: `${ital[1]}, ${ital[2]}`, one_line };

  if (/humanity formula/i.test(one_line)) {
    return { name: "Kant, humanity formula", one_line };
  }
  if (/harm principle/i.test(one_line)) {
    return { name: "Mill, harm principle", one_line };
  }
  if (/virtue ethics/i.test(one_line)) {
    return { name: "Virtue ethics", one_line };
  }
  if (/corrective justice/i.test(one_line)) {
    return { name: "Corrective justice", one_line };
  }
  if (/precautionary principle/i.test(one_line)) {
    return { name: "Precautionary principle", one_line };
  }
  if (/social model of disability/i.test(one_line)) {
    return { name: "Social model of disability", one_line };
  }
  if (/chilling.?effect/i.test(one_line)) {
    return { name: "Chilling-effect argument", one_line };
  }
  if (/soft paternalism/i.test(one_line)) {
    return { name: "Soft paternalism", one_line };
  }
  if (/ought implies can/i.test(one_line)) {
    return { name: "Kant, ought implies can", one_line };
  }
  if (/entitlement theory/i.test(one_line)) {
    return { name: "Nozick, entitlement theory", one_line };
  }
  if (/universalizability/i.test(one_line)) {
    return { name: "Kant, universalizability", one_line };
  }
  if (/On Liberty/i.test(one_line)) {
    return { name: "Mill, On Liberty", one_line };
  }
  if (/equal consideration/i.test(one_line)) {
    return { name: "Singer, equal consideration of interests", one_line };
  }
  if (/social connection model/i.test(one_line)) {
    return { name: "Young, social connection model", one_line };
  }
  if (/Goodhart/i.test(one_line)) {
    return { name: "Goodhart's law", one_line };
  }
  if (/Crip Technoscience/i.test(one_line)) {
    return { name: "Hamraie & Fritsch, Crip Technoscience", one_line };
  }
  if (/mistakes in moral mathematics/i.test(one_line)) {
    return { name: "Parfit, mistakes in moral mathematics (1984)", one_line };
  }
  if (/leveling down/i.test(one_line)) {
    return { name: "Parfit, leveling down", one_line };
  }
  if (/universal.?museum/i.test(one_line)) {
    return { name: "Universal-museum argument", one_line };
  }
  if (/\bRegan\b/i.test(one_line) && /\bSinger\b/i.test(one_line)) {
    return { name: "Singer and Regan (animal ethics)", one_line };
  }
  if (/\bWaldron\b/i.test(one_line)) {
    return { name: "Waldron, dignity", one_line };
  }
  if (/\bNguyen\b/i.test(one_line)) {
    return { name: "Nguyen, trust", one_line };
  }

  const thinker = one_line.match(
    /\b(Kant|Mill|Nozick|Aristotle|Rawls|Sandel|Sparrow|Margalit|Khader|Young|Nguyen|Waldron|Parfit|Singer|Regan)\b(?:'s)?(?:\s+|,)\s*([A-Za-z][A-Za-z -]{0,40})?/i,
  );
  if (thinker) {
    const label = (thinker[2] ?? "").trim().replace(/[,:;]+$/, "");
    if (label && label.length >= 3) {
      return { name: `${thinker[1]}, ${label}`, one_line };
    }
    return { name: thinker[1]!, one_line };
  }

  // First short clause, cut only at a word boundary.
  const clause = one_line.split(/[:.]/)[0]!.trim();
  if (clause.length <= 48) return { name: clause, one_line };
  const cut = clause.slice(0, 48);
  const at = cut.lastIndexOf(" ");
  return { name: (at > 20 ? cut.slice(0, at) : cut).trim(), one_line };
}

function extractFrameworks(
  parsed: ParsedCase,
): { name: string; one_line: string }[] {
  const seen = new Set<string>();
  const out: { name: string; one_line: string }[] = [];
  const push = (raw: string) => {
    const item = nameFramework(raw);
    const key = item.name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(item);
  };
  for (const claim of [parsed.claim1, parsed.claim2]) {
    for (const s of claim.supports) {
      if (s.backing.kind === "framework") push(s.backing.text);
    }
    if (claim.ethicalAnalysis) {
      const named = claim.ethicalAnalysis.match(
        /(?:Kant|Mill|Nozick|Sparrow|Margalit|Khader|Young|Nguyen|virtue ethics|utilitarian)[^.]*\./gi,
      );
      if (named) for (const n of named) push(n.trim());
    }
  }
  return out.slice(0, 6);
}

function buildOnePagerBody(parsed: ParsedCase): OnePagerBody {
  const claims = [parsed.claim1, parsed.claim2].map((c) => ({
    text: c.title,
    logic_line: c.logicLine,
    supports: [
      ...c.supports.map((s) => s.text),
      "",
      "",
      "",
    ].slice(0, 3),
  }));
  const cc = parsed.counterclaims[0];
  const frameworks = extractFrameworks(parsed);
  const { left, right } = splitCruxValues(parsed.crux);
  return {
    claims,
    counterclaim: cc
      ? {
          text: cc.text,
          concede: cc.concede,
          distinguish: cc.distinguish,
          rebut: cc.rebut,
        }
      : null,
    visuals: [
      {
        kind: "claim_map",
        title: "Claim map",
        payload: {
          nodes: claims.map((c, i) => ({
            id: `c${i + 1}`,
            label: c.text,
            supports: c.supports.filter(Boolean),
          })),
          counter: cc?.text ?? null,
          crux: parsed.crux,
          trap: parsed.trap,
          thesis: parsed.thesis,
        },
      },
      {
        kind: "values_scale",
        title: "Values in tension",
        payload: {
          left,
          right,
          // Trap belongs in note; never invent a values placeholder note.
          note: parsed.trap || null,
        },
      },
      {
        kind: "stakeholder_grid",
        title: "Stakeholders",
        payload: {
          cells: parsed.stakeholders.map((s) => ({
            who: s.who,
            stake: s.stake,
            voice: s.voice,
          })),
        },
      },
      {
        kind: "fact_timeline",
        title: "Case facts",
        payload: {
          events: parsed.facts.slice(0, 8).map((f, i) => ({
            order: i + 1,
            text: f.fact,
            source: f.source,
          })),
        },
      },
      {
        kind: "framework_strip",
        title: "Frameworks",
        payload: {
          items: frameworks.map((f) => ({
            name: f.name,
            one_line: f.one_line,
          })),
        },
      },
      {
        kind: "question_table",
        title: "Likely questions",
        payload: {
          rows: [
            ...parsed.moderatorQuestions.slice(0, 3),
            ...parsed.judgeQuestions.slice(0, 3),
          ].map((q) => ({ q: q.question, a: q.answer })),
        },
      },
    ],
    empty_rows: [],
  };
}

function cardFront(kind: TruthItem["kind"]): string {
  if (kind === "framework") return "Framework (one sentence)";
  if (kind === "quote") return "Who said / where: recall this quote";
  if (kind === "example") return "Vivid example for this case";
  return "Fact with citation";
}

async function loadParsedCases(repoRoot: string): Promise<ParsedCase[]> {
  const dir = path.join(repoRoot, "docs/domain/cases");
  const files = (await fs.readdir(dir))
    .filter((f) => /^case-\d+\.md$/.test(f))
    .sort();
  const out: ParsedCase[] = [];
  for (const file of files) {
    const md = await fs.readFile(path.join(dir, file), "utf8");
    const parsed = parseCaseMarkdown(md);
    if (!parsed.number) {
      throw new Error(`Could not parse case number from ${file}`);
    }
    out.push(parsed);
  }
  return out;
}

/** Build the full content seed bundle from docs/domain/cases. */
export async function buildContentSeed(
  repoRoot: string = process.cwd(),
): Promise<ContentSeedBundle> {
  const parsed = await loadParsedCases(repoRoot);

  const cases: CaseRow[] = CASE_TITLES.map((c) => {
    const p = parsed.find((x) => x.number === c.number);
    const closing =
      p?.moderatorQuestions.find((q) =>
        /case's (own )?question|framing question|closing/i.test(q.question),
      )?.question ??
      p?.moderatorQuestions[0]?.question ??
      null;
    return {
      id: caseId(c.number),
      number: c.number,
      title: c.title,
      case_set_page: c.active ? `Case ${c.number}` : null,
      crux: p?.crux ?? null,
      trap: p?.trap ?? null,
      closing_question: closing,
      active: c.active,
      created_at: NOW,
    };
  });

  const stakeholders: CaseStakeholderSeed[] = [];
  const claims: Claim[] = [];
  const supports: Support[] = [];
  const backings: Backing[] = [];
  const counterclaims: Counterclaim[] = [];
  const truth_items: TruthItem[] = [];
  const opposing_positions: OpposingPosition[] = [];
  const questions: ModeratorQuestion[] = [];
  const one_pagers: OnePager[] = [];
  const flashcards: Flashcard[] = [];
  const case_roles: CaseRole[] = [];
  const deck_opt_ins: ContentSeedBundle["deck_opt_ins"] = [];
  const proposals: Proposal[] = [];

  const activeParsed = parsed.filter((p) =>
    CASE_TITLES.some((c) => c.number === p.number && c.active),
  );

  for (const [caseIndex, p] of activeParsed.entries()) {
    const cid = caseId(p.number);
    const createdBy = TEAM3_MEMBERS[caseIndex % TEAM3_MEMBERS.length]!;
    for (const [i, s] of p.stakeholders.entries()) {
      stakeholders.push({
        id: seedUuid(`stake:${p.number}:${i}`),
        case_id: cid,
        who: s.who,
        stake: s.stake,
        voice_in_case: s.voice || null,
        ord: i,
        origin: CONTENT_ORIGIN,
        created_at: NOW,
        created_by: createdBy,
      });
    }

    // Case roles for Team 3
    for (let r = 0; r < 4; r++) {
      const person = TEAM3_MEMBERS[(caseIndex + r) % TEAM3_MEMBERS.length]!;
      const role = ROLE_CYCLE[r]!;
      case_roles.push({
        id: seedUuid(`role:t3:${p.number}:${role}`),
        team_id: TEAM3,
        case_id: cid,
        person_id: person,
        role,
        created_at: NOW,
        created_by: NICK,
      });
      if (role === "lead_1" || role === "lead_2") {
        deck_opt_ins.push({
          id: seedUuid(`deck:t3:${p.number}:${person}`),
          person_id: person,
          team_id: TEAM3,
          case_id: cid,
          assigned: true,
          created_at: NOW,
        });
      }
    }

    const claimDefs = [
      { ord: 0, claim: p.claim1 },
      { ord: 1, claim: p.claim2 },
    ];
    const claimIds: string[] = [];

    for (const entry of claimDefs) {
      const ord = entry.ord;
      const claimData = entry.claim;
      const claimId = seedUuid(`claim:t3:${p.number}:${ord}`);
      claimIds.push(claimId);
      claims.push({
        id: claimId,
        team_id: TEAM3,
        case_id: cid,
        text: claimData.title,
        logic_line: claimData.logicLine || null,
        ord,
        citation_ids: [],
        created_at: NOW,
        created_by: createdBy,
        updated_at: NOW,
      });

      for (const [si, s] of claimData.supports.entries()) {
        const supportId = seedUuid(`support:t3:${p.number}:${ord}:${si}`);
        supports.push({
          id: supportId,
          claim_id: claimId,
          team_id: TEAM3,
          case_id: cid,
          text: s.text,
          logic_line: null,
          ord: si,
          citation_ids: [],
          created_at: NOW,
          created_by: createdBy,
          updated_at: NOW,
        });
        backings.push({
          id: seedUuid(`backing:t3:${p.number}:${ord}:${si}`),
          support_id: supportId,
          team_id: TEAM3,
          case_id: cid,
          kind: s.backing.kind,
          text: s.backing.text,
          citation_ids: [],
          created_at: NOW,
          created_by: createdBy,
          updated_at: NOW,
        });
      }
    }

    for (const [i, cc] of p.counterclaims.entries()) {
      counterclaims.push({
        id: seedUuid(`cc:t3:${p.number}:${i}`),
        team_id: TEAM3,
        case_id: cid,
        claim_id: claimIds[Math.min(i, claimIds.length - 1)] ?? null,
        text: cc.text,
        concede: cc.concede,
        distinguish: cc.distinguish,
        rebut: cc.rebut,
        citation_ids: [],
        created_at: NOW,
        created_by: createdBy,
        updated_at: NOW,
      });
    }

    // Truth items: facts, frameworks, examples from backings
    let truthOrd = 0;
    for (const f of p.facts) {
      const id = seedUuid(`truth:t3:${p.number}:fact:${truthOrd}`);
      truth_items.push({
        id,
        team_id: TEAM3,
        case_id: cid,
        kind: "fact",
        text: `${f.fact} (${f.source})`,
        citation_ids: [id],
        status: "accepted",
        created_at: NOW,
        created_by: createdBy,
        updated_at: NOW,
      });
      truthOrd++;
    }
    for (const fw of extractFrameworks(p)) {
      const id = seedUuid(`truth:t3:${p.number}:fw:${truthOrd}`);
      truth_items.push({
        id,
        team_id: TEAM3,
        case_id: cid,
        kind: "framework",
        text: `${fw.name}: ${fw.one_line}`,
        citation_ids: [id],
        status: "accepted",
        created_at: NOW,
        created_by: createdBy,
        updated_at: NOW,
      });
      truthOrd++;
    }
    for (const claim of [p.claim1, p.claim2]) {
      for (const s of claim.supports) {
        if (s.backing.kind === "example") {
          const id = seedUuid(`truth:t3:${p.number}:ex:${truthOrd}`);
          truth_items.push({
            id,
            team_id: TEAM3,
            case_id: cid,
            kind: "example",
            text: s.backing.text,
            citation_ids: [id],
            status: "accepted",
            created_at: NOW,
            created_by: createdBy,
            updated_at: NOW,
          });
          truthOrd++;
        }
        if (
          s.backing.kind === "source" &&
          /["“]/.test(s.backing.text)
        ) {
          const id = seedUuid(`truth:t3:${p.number}:qt:${truthOrd}`);
          truth_items.push({
            id,
            team_id: TEAM3,
            case_id: cid,
            kind: "quote",
            text: s.backing.text,
            citation_ids: [id],
            status: "accepted",
            created_at: NOW,
            created_by: createdBy,
            updated_at: NOW,
          });
          truthOrd++;
        }
      }
    }

    // Tag origin on truth items via a parallel field when sample store supports it
    // (DB column added in 00009). Sample TruthItem type has no origin — keep as-is.

    // Questions: moderator versions + judge bank, origin member
    let qi = 0;
    for (const q of p.moderatorQuestions) {
      questions.push({
        id: seedUuid(`q:mod:${p.number}:${qi}`),
        case_id: cid,
        text: q.question,
        type: guessQuestionType(q.question),
        difficulty: difficultyFor(q.question, qi),
        origin: "member",
        origin_label: "Team 3 · case prep doc",
        status: "active",
        asked_at_tag: null,
        created_at: NOW,
        created_by: createdBy,
      });
      qi++;
    }
    for (const q of p.judgeQuestions) {
      questions.push({
        id: seedUuid(`q:judge:${p.number}:${qi}`),
        case_id: cid,
        text: q.question,
        type: guessQuestionType(q.question),
        difficulty: difficultyFor(q.question, qi),
        origin: "member",
        origin_label: "Team 3 · case prep doc",
        status: "active",
        asked_at_tag: null,
        created_at: NOW,
        created_by: createdBy,
      });
      qi++;
    }

    // Commentary kit → opposing positions
    for (const [i, line] of p.commentaryKit.entries()) {
      const ifMatch = line.match(/^If they\s+(.+?):\s*(.+)$/i);
      const title = ifMatch ? `They ${ifMatch[1]!.trim()}` : line.trim();
      const angle = (ifMatch?.[2] ?? line).trim();
      const weak =
        p.counterclaims[0]?.rebut ??
        "Pressure this against our claim map and the case facts.";
      const nextAngle =
        p.commentaryKit[(i + 1) % Math.max(p.commentaryKit.length, 1)] ??
        "Ask what their principle would require in a flipped case.";
      opposing_positions.push({
        id: seedUuid(`opp:${p.number}:${i}`),
        case_id: cid,
        title,
        strongest_support:
          p.counterclaims[0]?.theirSupports ||
          p.counterclaims[0]?.text ||
          "Their strongest reading of the case facts.",
        weak_point: weak,
        commentary_angles: [angle, nextAngle.trim()],
        origin: "team",
        added_by_team_id: TEAM3,
        created_at: NOW,
        created_by: createdBy,
      });
    }

    // v1 one pager
    const body = buildOnePagerBody(p);
    one_pagers.push({
      id: seedUuid(`onepager:t3:${p.number}:v1`),
      team_id: TEAM3,
      case_id: cid,
      version: 1,
      body,
      previous_body: null,
      change_note: "Imported from Team 3 case prep doc",
      signed_off_by: [],
      drive_doc_id: null,
      drive_pdf_exported: false,
      origin_tag: "case prep doc" as OnePager["origin_tag"],
      created_at: NOW,
      created_by: createdBy,
    });
  }

  // Flashcards from truth items
  for (const item of truth_items) {
    flashcards.push({
      id: seedUuid(`card:${item.id}`),
      team_id: item.team_id,
      case_id: item.case_id,
      deck: `case-${cases.find((c) => c.id === item.case_id)?.number ?? "?"}`,
      front: cardFront(item.kind),
      back: item.text,
      citation_ids: item.citation_ids.length ? item.citation_ids : [item.id],
      truth_item_id: item.id,
      source_kind: "truth",
      created_at: NOW,
      created_by: item.created_by,
      updated_at: NOW,
    });
  }

  // Inspired by Team 3 proposals for Teams 1 and 2 (a few cases)
  const inspireCases = activeParsed.filter((p) =>
    [1, 5, 12].includes(p.number),
  );
  for (const p of inspireCases) {
    const cid = caseId(p.number);
    const idea = p.claim1.title || p.facts[0]?.fact || "Team 3 Claim 1 framing";
    for (const teamId of [TEAM1, TEAM2] as const) {
      proposals.push({
        id: seedUuid(`prop:${teamId}:${p.number}:claim1`),
        team_id: teamId,
        case_id: cid,
        idea_key: `inspired-t3-case${p.number}-claim1`,
        origin: "inspired_by_team",
        origin_ref: `Team 3 case prep · Case ${p.number}`,
        inspired_from_team_id: TEAM3,
        text: `${idea} (Inspired by Team 3)`,
        kind: "claim_edit",
        citation_ids: [],
        cruxy_note: null,
        socratic_question: `Does this fit your Claim 1 on Case ${p.number}, or does it pull against a principle you already use?`,
        socratic_answered: false,
        status: "pending",
        created_at: NOW,
        created_by: NICK,
        updated_at: NOW,
      });
      const fact = p.facts[1]?.fact ?? p.facts[0]?.fact;
      if (fact) {
        proposals.push({
          id: seedUuid(`prop:${teamId}:${p.number}:fact`),
          team_id: teamId,
          case_id: cid,
          idea_key: `inspired-t3-case${p.number}-fact`,
          origin: "inspired_by_team",
          origin_ref: `Team 3 case prep · Case ${p.number}`,
          inspired_from_team_id: TEAM3,
          text: fact,
          kind: "fact",
          citation_ids: [],
          cruxy_note: null,
          socratic_question: `Which of your supports on Case ${p.number} would this fact back?`,
          socratic_answered: false,
          status: "pending",
          created_at: NOW,
          created_by: NICK,
          updated_at: NOW,
        });
      }
    }
  }

  return {
    cases,
    stakeholders,
    claims,
    supports,
    backings,
    counterclaims,
    truth_items,
    opposing_positions,
    questions,
    one_pagers,
    flashcards,
    case_roles,
    deck_opt_ins,
    proposals,
    scoring_card_items: buildScoringCardItems(),
    parsed,
  };
}
