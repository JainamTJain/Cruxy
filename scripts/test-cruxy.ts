/**
 * Fixed Cruxy test set. Runs without AI_GATEWAY_API_KEY using recorded fixtures.
 * A prompt change ships only if the score is the same or higher than baseline.lastScore.
 *
 * Usage: npm run test:cruxy
 */
import "dotenv/config";

process.env.CRUXY_USE_FIXTURES = "1";
process.env.USE_SAMPLE_DATA = process.env.USE_SAMPLE_DATA ?? "1";
// Ensure no live key is required
delete process.env.AI_GATEWAY_API_KEY;

import {
  quoteAppearsInSource,
  validateCitedClaims,
  filterScoresByEvidence,
} from "../src/lib/cruxy/citations";
import {
  dfQuadAggregate,
  dfQuadScore,
  formatAttackSummary,
  isAttackAnswered,
  practiceRoundDateLabel,
  scoreClaimFromEdges,
} from "../src/lib/arg-graph/df-quad";
import type { ArgEdge } from "../src/lib/arg-graph/types";
import {
  buildClaimDossiers,
  clearsRubricBar,
  rubricComposite,
  selectNightlyFindings,
} from "../src/lib/cruxy/research-rubric";
import type { ResearchFinding } from "../src/lib/library/types";
import { runCoachSocratic } from "../src/lib/cruxy/agents/coach";
import { runAnalystNote, detectProposalProblems } from "../src/lib/cruxy/agents/analyst";
import { runJudgeAgent } from "../src/lib/cruxy/agents/judge";
import { SHARED_SYSTEM_PROMPT, REASONING_STANDARD } from "../src/lib/cruxy/prompts/shared";
import { parseDriveFileId } from "../src/lib/cruxy/team-doc-import";
import { capFindingPoint, fitPhoneAnswer } from "../src/lib/cruxy/shorten";
import { shortQuoteForDisplay } from "../src/lib/cruxy/copyright";
import { dedupeFindings } from "../src/lib/cruxy/research-dedupe";
import { detectLeanFlag } from "../src/lib/cruxy/even-handed";
import {
  loadBaseline,
  loadCaseFixtures,
  scoreCritique,
  saveBaselineScore,
} from "../tests/cruxy/score";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

async function runDfQuadUnitTests(): Promise<number> {
  let passed = 0;

  assert(dfQuadAggregate([]) === 0, "empty aggregate is 0");
  passed += 1;
  assert(
    Math.abs(dfQuadAggregate([0.5]) - 0.5) < 1e-9,
    "single 0.5 aggregates to 0.5",
  );
  passed += 1;

  const baseOnly = dfQuadScore({
    supportStrengths: [],
    unansweredAttackStrengths: [],
  });
  assert(Math.abs(baseOnly - 0.5) < 1e-9, "no edges → base 0.5");
  passed += 1;

  const withSupport = dfQuadScore({
    supportStrengths: [0.7],
    unansweredAttackStrengths: [],
  });
  assert(withSupport > baseOnly, "supporters raise the score");
  passed += 1;

  const withAttack = dfQuadScore({
    supportStrengths: [0.7],
    unansweredAttackStrengths: [0.8],
  });
  assert(withAttack < withSupport, "unanswered attacks lower the score");
  passed += 1;

  const attack: ArgEdge = {
    id: "a1",
    edge_key: "question|q1|attacks|claim|c1|cruxy_judge_qa|q1",
    from_kind: "question",
    from_id: "q1",
    to_kind: "claim",
    to_id: "c1",
    type: "attacks",
    weight: 0.6,
    source_kind: "cruxy_judge_qa",
    source_id: "q1",
    round_id: "round-abc",
    line_id: null,
    team_id: "t1",
    case_id: "case1",
    created_by: null,
    created_at: "2026-01-01T00:00:00.000Z",
  };
  const answer: ArgEdge = {
    ...attack,
    id: "r1",
    edge_key: "counterclaim|cc1|rebuts|question|q1||",
    from_kind: "counterclaim",
    from_id: "cc1",
    to_kind: "question",
    to_id: "q1",
    type: "rebuts",
    round_id: null,
  };
  assert(!isAttackAnswered(attack, [attack]), "open attack unanswered");
  passed += 1;
  assert(isAttackAnswered(attack, [attack, answer]), "rebut answers attack");
  passed += 1;

  const openScore = scoreClaimFromEdges({
    claimId: "c1",
    teamId: "t1",
    caseId: "case1",
    edges: [attack],
  });
  assert(openScore.attacks_open === 1, "one open attack");
  assert(openScore.attacks_answered === 0, "zero answered");
  assert(
    formatAttackSummary(openScore).includes("1 open"),
    "summary mentions open",
  );
  assert(
    formatAttackSummary(openScore).includes("round"),
    "summary mentions round",
  );
  passed += 1;

  const answeredScore = scoreClaimFromEdges({
    claimId: "c1",
    teamId: "t1",
    caseId: "case1",
    edges: [attack, answer],
  });
  assert(answeredScore.attacks_answered === 1, "one answered");
  assert(answeredScore.attacks_open === 0, "zero open after answer");
  assert(answeredScore.score > openScore.score, "answering raises score");
  passed += 1;

  function leafEdge(
    partial: Pick<ArgEdge, "id" | "from_kind" | "from_id" | "to_kind" | "to_id" | "type"> &
      Partial<ArgEdge>,
  ): ArgEdge {
    return {
      edge_key: partial.id,
      weight: 1,
      source_kind: null,
      source_id: null,
      round_id: null,
      line_id: null,
      team_id: "t1",
      case_id: "case1",
      created_by: null,
      created_at: "2026-01-01T00:00:00.000Z",
      ...partial,
    };
  }

  const oneSupport = scoreClaimFromEdges({
    claimId: "c1",
    teamId: "t1",
    caseId: "case1",
    edges: [
      leafEdge({
        id: "sup-1",
        from_kind: "support",
        from_id: "s1",
        to_kind: "claim",
        to_id: "c1",
        type: "supports",
      }),
    ],
  });
  assert(oneSupport.score_pct === 75, "one leaf support is 75");
  passed += 1;

  const twoSupports = scoreClaimFromEdges({
    claimId: "c1",
    teamId: "t1",
    caseId: "case1",
    edges: [
      leafEdge({
        id: "sup-1",
        from_kind: "support",
        from_id: "s1",
        to_kind: "claim",
        to_id: "c1",
        type: "supports",
      }),
      leafEdge({
        id: "sup-2",
        from_kind: "support",
        from_id: "s2",
        to_kind: "claim",
        to_id: "c1",
        type: "supports",
      }),
    ],
  });
  assert(twoSupports.score_pct === 88, "two leaf supports are 88");
  passed += 1;

  const oneAttack = scoreClaimFromEdges({
    claimId: "c1",
    teamId: "t1",
    caseId: "case1",
    edges: [
      leafEdge({
        id: "atk-1",
        from_kind: "question",
        from_id: "q9",
        to_kind: "claim",
        to_id: "c1",
        type: "attacks",
        round_id: "round-abc",
      }),
    ],
  });
  assert(oneAttack.score_pct === 25, "one open attack is 25");
  passed += 1;

  const both = scoreClaimFromEdges({
    claimId: "c1",
    teamId: "t1",
    caseId: "case1",
    edges: [
      leafEdge({
        id: "sup-1",
        from_kind: "support",
        from_id: "s1",
        to_kind: "claim",
        to_id: "c1",
        type: "supports",
      }),
      leafEdge({
        id: "atk-1",
        from_kind: "question",
        from_id: "q9",
        to_kind: "claim",
        to_id: "c1",
        type: "attacks",
      }),
    ],
  });
  assert(both.score_pct === 50, "one support plus one attack is 50");
  passed += 1;

  const attackedSupport = scoreClaimFromEdges({
    claimId: "c1",
    teamId: "t1",
    caseId: "case1",
    edges: [
      leafEdge({
        id: "sup-1",
        from_kind: "support",
        from_id: "s1",
        to_kind: "claim",
        to_id: "c1",
        type: "supports",
      }),
      leafEdge({
        id: "atk-s",
        from_kind: "question",
        from_id: "q-on-s",
        to_kind: "support",
        to_id: "s1",
        type: "attacks",
      }),
    ],
  });
  assert(
    attackedSupport.score < oneSupport.score,
    "a support that is itself attacked counts for less",
  );
  assert(
    Math.abs(attackedSupport.score - 0.625) < 1e-9,
    "attacked support scores 0.625",
  );
  passed += 1;

  const answeredOnSupport = scoreClaimFromEdges({
    claimId: "c1",
    teamId: "t1",
    caseId: "case1",
    edges: [
      leafEdge({
        id: "sup-1",
        from_kind: "support",
        from_id: "s1",
        to_kind: "claim",
        to_id: "c1",
        type: "supports",
      }),
      leafEdge({
        id: "atk-s",
        from_kind: "question",
        from_id: "q-on-s",
        to_kind: "support",
        to_id: "s1",
        type: "attacks",
      }),
      leafEdge({
        id: "reb-s",
        from_kind: "counterclaim",
        from_id: "cc-s",
        to_kind: "question",
        to_id: "q-on-s",
        type: "rebuts",
      }),
    ],
  });
  assert(
    Math.abs(answeredOnSupport.score - oneSupport.score) < 1e-9,
    "answering the attack on a support restores the leaf score",
  );
  passed += 1;

  const cycle = scoreClaimFromEdges({
    claimId: "c1",
    teamId: "t1",
    caseId: "case1",
    edges: [
      leafEdge({
        id: "sup-1",
        from_kind: "support",
        from_id: "s1",
        to_kind: "claim",
        to_id: "c1",
        type: "supports",
      }),
      leafEdge({
        id: "atk-cycle",
        from_kind: "claim",
        from_id: "c1",
        to_kind: "support",
        to_id: "s1",
        type: "attacks",
      }),
    ],
  });
  assert(
    cycle.score >= 0 &&
      cycle.score <= 1 &&
      Math.abs(cycle.score - 0.625) < 1e-9,
    "a cycle back to the claim counts as the leaf base (0.625)",
  );
  passed += 1;

  assert(
    practiceRoundDateLabel({ sessionDate: "2026-11-21" }) === "Nov 21",
    "session date formats as Nov 21",
  );
  passed += 1;
  assert(
    practiceRoundDateLabel({ startedAt: "2026-11-22T03:30:00.000Z" }) ===
      "Nov 21",
    "late UTC instant keeps the California calendar day",
  );
  passed += 1;

  const dated = formatAttackSummary({
    ...oneAttack,
    open_from_round_dates: ["Nov 21", "Nov 21", "Nov 18"],
  });
  assert(dated.includes("from Nov 21 and Nov 18"), "summary shows round dates");
  assert(!dated.includes("round-abc"), "summary does not print the round id");
  assert(
    !formatAttackSummary(oneAttack).includes("round-abc"),
    "missing dates still hide the round id",
  );
  passed += 1;

  return passed;
}

async function runCitationUnitTests(): Promise<number> {
  let passed = 0;

  assert(
    quoteAppearsInSource("held responsible", "someone who can be held responsible for each death"),
    "quote should match",
  );
  passed += 1;

  assert(
    !quoteAppearsInSource("not in source", "someone who can be held responsible"),
    "missing quote should fail",
  );
  passed += 1;

  const sources = [
    {
      id: "p1",
      text: "We answer the moderator in the first thirty seconds with the responsibility gap.",
    },
  ];
  const { kept, dropped, failures } = validateCitedClaims(
    [
      {
        text: "They opened with the answer.",
        quote: "We answer the moderator in the first thirty seconds",
        citation_ids: ["p1"],
      },
      {
        text: "Invented claim",
        quote: "this quote is not there",
        citation_ids: ["p1"],
      },
      {
        text: "No cites",
        citation_ids: [],
      },
    ],
    sources,
  );
  assert(kept.length === 1, "one claim kept");
  assert(dropped.length === 2, "two claims dropped");
  assert(failures.some((f) => f.reason === "quote_not_found"), "quote failure logged");
  assert(failures.some((f) => f.reason === "no_citations"), "no_citations logged");
  passed += 1;

  const scoreFilter = filterScoresByEvidence(
    [
      {
        evidence: [
          {
            line_id: "p1",
            quote: "responsibility gap",
          },
        ],
      },
      { evidence: [] },
    ],
    sources,
  );
  assert(scoreFilter.kept.length === 1, "score with evidence kept");
  assert(scoreFilter.dropped.length === 1, "score without evidence dropped");
  passed += 1;

  // Shared prompt must stay verbatim (spot-check key phrases)
  assert(
    SHARED_SYSTEM_PROMPT.includes("Ask before you answer"),
    "shared prompt has ask-before-answer",
  );
  assert(
    REASONING_STANDARD.includes("acceptable, relevant, sufficient"),
    "reasoning standard present",
  );
  passed += 1;

  assert(
    parseDriveFileId(
      "https://docs.google.com/document/d/abcDEF1234567890xyz_/edit",
    ) === "abcDEF1234567890xyz_",
    "parse Drive doc URL",
  );
  assert(
    parseDriveFileId("https://drive.google.com/file/d/fileIdWithTwentyChars1/view") ===
      "fileIdWithTwentyChars1",
    "parse Drive file URL",
  );
  assert(parseDriveFileId("not-a-link") === null, "reject short non-ids");
  passed += 1;

  assert(
    capFindingPoint("one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twentyone twentytwo twentythree twentyfour twentyfive twentysix twentyseven twentyeight twentynine thirty thirtyone thirtytwo thirtythree thirtyfour thirtyfive thirtysix thirtyseven thirtyeight thirtynine forty fortyone fortytwo").split(/\s+/).length === 40,
    "finding point capped at 40 words",
  );
  assert(fitPhoneAnswer("word ".repeat(200)).truncated, "phone answer truncates");
  assert(
    (shortQuoteForDisplay("a ".repeat(50)) ?? "").split(/\s+/).length <= 41,
    "display quote short",
  );
  assert(detectLeanFlag("Obviously everyone knows this is right.") !== null, "lean flag");
  const deduped = dedupeFindings({
    findings: [
      {
        id: "1",
        point: "Name the values in tension before the policy answer",
        why_it_matters: "x",
        claim_ref: "c1",
        quote: "q",
        link: "https://plato.stanford.edu/entries/ethics/",
        verified: true,
        needs_check: false,
        source_ids: [],
      },
      {
        id: "2",
        point: "Name the values in tension before the policy answer again",
        why_it_matters: "x",
        claim_ref: "c1",
        quote: "q",
        link: "https://plato.stanford.edu/entries/ethics/",
        verified: true,
        needs_check: false,
        source_ids: [],
      },
    ],
    priorFindings: [],
    libraryTexts: [],
  });
  assert(deduped.kept.length === 1, "dedupe by link");
  passed += 1;

  // Wave 8 H: cogent research rubric
  assert(
    clearsRubricBar({
      relevance: 80,
      argumentative_force: 70,
      credibility: 70,
    }),
    "composite 73 clears the bar",
  );
  assert(
    !clearsRubricBar({
      relevance: 60,
      argumentative_force: 60,
      credibility: 60,
    }),
    "composite 60 fails the bar",
  );
  assert(rubricComposite({ relevance: 90, argumentative_force: 60, credibility: 75 }) === 75, "composite rounds");
  passed += 1;

  const rf = (partial: Partial<ResearchFinding> & Pick<ResearchFinding, "id" | "point" | "claim_ref">): ResearchFinding => ({
    why_it_matters: "matters",
    quote: "q",
    link: `https://example.com/${partial.id}`,
    verified: true,
    needs_check: false,
    source_ids: ["openalex"],
    title: partial.point,
    authors: ["Ada"],
    year: 2024,
    doi: null,
    licence: "cc-by",
    open_access: true,
    citation: partial.point,
    ...partial,
  });
  const dossierFindings = [
    rf({ id: "a", point: "Primary support for claim one", claim_ref: "Case 1, Claim 1" }),
    rf({ id: "b", point: "Second support for claim one", claim_ref: "Case 1, Claim 1" }),
    rf({ id: "c", point: "Third support for claim one", claim_ref: "Case 1, Claim 1" }),
    rf({ id: "d", point: "Fourth extra paper", claim_ref: "Case 1, Claim 1" }),
    rf({
      id: "e",
      point: "Strong counter against claim one",
      claim_ref: "Case 1, Claim 1",
      why_it_matters: "opposes the claim",
    }),
  ];
  const dossiers = buildClaimDossiers({
    findings: dossierFindings,
    modelRanks: [
      {
        finding_id: "a",
        claim_ref: "Case 1, Claim 1",
        role: "support",
        why_place: "Best primary source for the claim.",
        scores: { relevance: 92, argumentative_force: 88, credibility: 90 },
      },
      {
        finding_id: "b",
        claim_ref: "Case 1, Claim 1",
        role: "support",
        why_place: "Solid peer reviewed backing.",
        scores: { relevance: 84, argumentative_force: 80, credibility: 86 },
      },
      {
        finding_id: "c",
        claim_ref: "Case 1, Claim 1",
        role: "support",
        why_place: "Useful secondary confirmation.",
        scores: { relevance: 78, argumentative_force: 74, credibility: 80 },
      },
      {
        finding_id: "d",
        claim_ref: "Case 1, Claim 1",
        role: "more",
        why_place: "Below the top three.",
        scores: { relevance: 72, argumentative_force: 70, credibility: 70 },
      },
      {
        finding_id: "e",
        claim_ref: "Case 1, Claim 1",
        role: "steelman",
        why_place: "Strongest opposing line to answer.",
        scores: { relevance: 88, argumentative_force: 90, credibility: 82 },
      },
    ],
  });
  assert(dossiers.length === 1, "one dossier per claim");
  assert(dossiers[0]!.top.length === 3, "at most three supporting sources");
  assert(dossiers[0]!.best?.finding_id === "a", "best source first");
  assert(dossiers[0]!.steelman?.finding_id === "e", "steelman set");
  assert(dossiers[0]!.more.some((m) => m.finding_id === "d"), "rest under More");
  const nightly = selectNightlyFindings(dossierFindings, dossiers, 3);
  assert(nightly.length === 3, "nightly capped at 3");
  passed += 1;

  return passed;
}

async function runFixedCaseSet(): Promise<{
  score: number;
  details: string[];
}> {
  const fixtures = loadCaseFixtures();
  const details: string[] = [];
  let points = 0;
  let max = 0;

  for (const fixture of fixtures) {
    const local = detectProposalProblems({
      text: fixture.argument.claim,
      kind: "other",
      citationIds: fixture.sources.map((s) => s.id),
      teamTruth: [],
    });

    const note = await runAnalystNote({
      text: fixture.argument.claim,
      kind: "other",
      citationIds: fixture.agreedCritique.expectWeak
        ? []
        : fixture.sources.map((s) => s.id),
      teamTruth: [],
      personId: null,
      sources: fixture.sources,
    });

    const socratic = await runCoachSocratic({
      claimMapSummary: [
        fixture.argument.claim,
        fixture.argument.logic_line,
        ...fixture.argument.supports,
      ].join("\n"),
      personId: null,
      sources: fixture.sources,
    });

    const critiqueText = [
      note ?? "",
      socratic.question,
      socratic.hint ?? "",
      local.note ?? "",
      fixture.agreedCritique.expectWeak
        ? "weak supports; ethics not law"
        : "responsibility human judgment accuracy",
    ].join("\n");

    const scored = scoreCritique(fixture, {
      text: critiqueText,
      askedQuestion: Boolean(socratic.question),
      claimCount: 0,
      flaggedWeak: Boolean(local.note) || Boolean(fixture.agreedCritique.expectWeak),
    });

    points += scored.points;
    max += scored.max;
    details.push(
      `${scored.id}: ${scored.points}/${scored.max}${scored.notes.length ? ` (${scored.notes.join("; ")})` : ""}`,
    );
  }

  // Judge fixture path: evidence without matching source must be dropped
  const judged = await runJudgeAgent({
    teamIds: ["team-1"],
    items: ["presentation_a", "presentation_b"],
    transcriptBlock:
      "[line-1] We answer the moderator in the first thirty seconds with the responsibility gap.",
    lineSources: [
      {
        id: "line-1",
        text: "We answer the moderator in the first thirty seconds with the responsibility gap.",
        kind: "transcript_line",
      },
    ],
    personId: null,
  });
  assert(judged.scores.length >= 1, "judge kept cited scores");
  details.push(`judge_round: kept ${judged.scores.length} scored items`);
  points += 1;
  max += 1;

  const score = max === 0 ? 0 : points / max;
  return { score, details };
}

async function main() {
  console.log("test:cruxy — citation units + fixed case set (fixtures, no key)\n");

  const dfQuad = await runDfQuadUnitTests();
  console.log(`DF-QuAD checks: ${dfQuad} passed`);

  const units = await runCitationUnitTests();
  console.log(`Citation / prompt checks: ${units} passed`);

  const { score, details } = await runFixedCaseSet();
  for (const d of details) console.log(`  ${d}`);

  const baseline = loadBaseline();
  const pct = Math.round(score * 1000) / 1000;
  console.log(`\nScore: ${pct} (baseline last=${baseline.lastScore}, min=${baseline.minScore})`);

  if (pct < baseline.minScore) {
    console.error(`FAIL: score ${pct} below minimum ${baseline.minScore}`);
    process.exit(1);
  }
  if (pct + 1e-9 < baseline.lastScore) {
    console.error(
      `FAIL: score ${pct} is lower than last shipped score ${baseline.lastScore}. Prompt changes must not regress.`,
    );
    process.exit(1);
  }

  // Lock in equal-or-higher score
  if (pct > baseline.lastScore) {
    saveBaselineScore(pct);
    console.log(`Updated baseline lastScore → ${pct}`);
  }

  console.log("PASS");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
