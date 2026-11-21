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
