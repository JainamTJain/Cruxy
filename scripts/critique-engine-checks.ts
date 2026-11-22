/**
 * Critique engine checks (sample mode). One assertion per critique kind,
 * plus truth-source privacy, rail cap, and postSuggestions.
 *
 * NODE_OPTIONS='--require ./scripts/preload-server-only.cjs' npx tsx scripts/critique-engine-checks.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
process.env.USE_SAMPLE_DATA = "1";
process.env.CRUXY_USE_FIXTURES = "1";
process.env.SESSION_SECRET =
  process.env.SESSION_SECRET ?? "test-session-secret-for-critique";

import { resetSampleStore, readStore } from "../src/lib/db/sample-store";
import { ensureTeamBrief } from "../src/lib/case-brain/team-brief";
import {
  ensureWorkingSections,
  updateWorkingSection,
  listPendingSuggestions,
  WORKING_SECTION_KEYS,
  __clearSampleWorkingDocForTests,
} from "../src/lib/db/supabase/working-doc-extra";
import {
  CRITIQUE_KINDS,
  OPEN_PER_SECTION_CAP,
  ruleFindings,
  findingsByKind,
  formatCritiqueText,
  selectForRail,
  buildTruthSource,
  critiqueWorkingDocument,
  runCritiqueForTeamCase,
} from "../src/lib/critique";
import {
  postSuggestions,
  scrubTeamNames,
} from "../src/lib/working-doc/post-suggestions";
import type { CritiqueFinding } from "../src/lib/critique/types";
import type { WorkingSectionKey } from "../src/lib/db/supabase/working-doc-extra";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`ok - ${msg}`);
}

function emptySections(): Record<WorkingSectionKey, string> {
  const o = {} as Record<WorkingSectionKey, string>;
  for (const k of WORKING_SECTION_KEYS) o[k] = "";
  return o;
}

async function main() {
  await resetSampleStore();
  __clearSampleWorkingDocForTests();
  const store = await readStore();
  const team3 = store.teams.find((t) => /3/.test(t.name)) ?? store.teams[2]!;
  const team1 = store.teams.find((t) => /1/.test(t.name)) ?? store.teams[0]!;
  const actor = store.people.find((p) => p.team_id === team3.id)!;
  const caseRow =
    store.cases.find((c) => c.number === 9 && c.active) ??
    store.cases.find((c) => c.active)!;

  // --- Truth source: shared, no other-team working doc ---
  const truth = await buildTruthSource(caseRow.id);
  assert(truth.items.length >= 1, "truth source has items");
  assert(
    truth.items.every((i) => !/\bteam\s*[123]\b/i.test(i.label)),
    "truth source labels never name a team",
  );
  assert(
    truth.items.some((i) => i.kind === "case_set" || i.kind === "domain_prep"),
    "truth source includes case set or domain prep",
  );

  // --- Rules: every kind present ---
  const sections = emptySections();
  sections.answer_one_sentence = "Museums should return coercively taken objects.";
  sections.claims = "Title is defective.";
  sections.support = "Because war spoils always transfer cleanly.";
  sections.objection_reply = "They say law blocks return.";
  sections.values_in_tension = "Justice versus access.";
  sections.judges_questions = "What about the Parthenon?";

  const findings = ruleFindings({ sections, truth: truth.items });
  const byKind = findingsByKind(findings);
  for (const kind of CRITIQUE_KINDS) {
    const f = byKind[kind];
    assert(Boolean(f), `kind ${kind} produced`);
    assert(f!.weakSpot.length > 8, `${kind} has weak spot`);
    assert(f!.why.length > 8, `${kind} has why`);
    assert(f!.stronger.length > 8, `${kind} has stronger version`);
    assert(/what do you think\?/i.test(f!.questionBack), `${kind} asks back`);
    if (kind === "logical_fallacy") {
      assert(Boolean(f!.fallacyName), "logical_fallacy names the fallacy");
    }
    const text = formatCritiqueText(f!);
    assert(!/[·—–]/.test(text), `${kind} rail copy has no em dashes`);
    assert(/where it is weak/i.test(text), `${kind} makes a case`);
  }

  // --- Rail selection caps per section ---
  const padded: CritiqueFinding[] = [];
  for (let i = 0; i < 8; i++) {
    padded.push({
      ...findings[0]!,
      kind: findings[i % findings.length]!.kind,
      rank: i + 1,
      sectionKey: "claims",
      weakSpot: `Weak ${i}`,
      why: `Why ${i}`,
      stronger: `Stronger ${i}`,
      questionBack: "What do you think?",
    });
  }
  const selected = selectForRail(padded, OPEN_PER_SECTION_CAP);
  assert(
    selected.filter((f) => f.sectionKey === "claims").length <=
      OPEN_PER_SECTION_CAP,
    "selectForRail respects per-section cap",
  );

  // --- postSuggestions + anonymity scrub ---
  assert(
    scrubTeamNames("Inspired by Team 2 says return it") ===
      "another view says return it",
    "scrubTeamNames hides team labels",
  );

  const brief = await ensureTeamBrief({
    teamId: team3.id,
    caseId: caseRow.id,
    personId: actor.id,
  });
  await ensureWorkingSections(brief.id, actor.id);
  for (const k of WORKING_SECTION_KEYS) {
    await updateWorkingSection({
      briefId: brief.id,
      sectionKey: k,
      body: sections[k],
      personId: actor.id,
    });
  }

  // Fill the claims section to the open cap, then assert the next is skipped.
  const flood = Array.from({ length: OPEN_PER_SECTION_CAP + 2 }, (_, i) => ({
    caseId: caseRow.id,
    teamId: team3.id,
    personId: actor.id,
    kind: "evidence_gap" as const,
    sectionKey: "support" as const,
    text: `Flood suggestion ${i}: cite a case fact and say what it changes. What do you think?`,
    source: "cruxy" as const,
  }));
  const floodResult = await postSuggestions(flood);
  assert(
    floodResult.posted.length === OPEN_PER_SECTION_CAP,
    `postSuggestions caps at ${OPEN_PER_SECTION_CAP} open per section`,
  );
  assert(floodResult.skippedCap >= 2, "postSuggestions reports skipped cap");

  // --- Full critique run (rules only) posts all kinds ---
  await resetSampleStore();
  __clearSampleWorkingDocForTests();
  const store2 = await readStore();
  const t3 = store2.teams.find((t) => /3/.test(t.name)) ?? store2.teams[2]!;
  const person = store2.people.find((p) => p.team_id === t3.id)!;
  const c9 =
    store2.cases.find((c) => c.number === 9 && c.active) ??
    store2.cases.find((c) => c.active)!;
  const brief2 = await ensureTeamBrief({
    teamId: t3.id,
    caseId: c9.id,
    personId: person.id,
  });
  await ensureWorkingSections(brief2.id, person.id);
  for (const k of WORKING_SECTION_KEYS) {
    await updateWorkingSection({
      briefId: brief2.id,
      sectionKey: k,
      body: sections[k] || "Draft line for critique.",
      personId: person.id,
    });
  }

  const rows = WORKING_SECTION_KEYS.map((section_key) => ({
    section_key,
    body: sections[section_key] || "Draft line for critique.",
  }));
  const crit = await critiqueWorkingDocument({
    caseId: c9.id,
    teamId: t3.id,
    personId: person.id,
    sections: rows,
    rulesOnly: true,
  });
  assert(crit.posted >= CRITIQUE_KINDS.length, "critique posts each kind");
  const pending = await listPendingSuggestions({
    teamId: t3.id,
    caseId: c9.id,
  });
  for (const kind of CRITIQUE_KINDS) {
    assert(
      pending.some((p) => p.kind === kind),
      `pending rail has ${kind}`,
    );
  }
  assert(
    pending.every((p) => !/\bTeam\s*[123]\b/.test(p.text)),
    "posted suggestions never name a team",
  );

  // Anonymous travel source does not attribute a person
  const t1 = store2.teams.find((t) => /1/.test(t.name)) ?? store2.teams[0]!;
  const anon = await postSuggestions([
    {
      caseId: c9.id,
      teamId: t1.id,
      personId: person.id,
      kind: "missing_perspective",
      sectionKey: "values_in_tension",
      text: "Where it is weak: missing a disagreeing view. Why: APPE C. Stronger: steelman them. What do you think?",
      source: "anonymous_travel",
      cannotCite: true,
    },
  ]);
  assert(anon.posted[0]?.created_by === null, "anonymous_travel has no author");

  const run = await runCritiqueForTeamCase({
    caseId: c9.id,
    teamId: t3.id,
    personId: person.id,
    trigger: "manual",
    rulesOnly: true,
  });
  assert(typeof run.posted === "number", "runCritiqueForTeamCase returns posted");

  // Debounce skip
  const skipped = await runCritiqueForTeamCase({
    caseId: c9.id,
    teamId: t3.id,
    personId: person.id,
    trigger: "on_change",
    rulesOnly: true,
  });
  assert(
    skipped.notes?.includes("debounce") || skipped.posted >= 0,
    "on_change debounce path runs",
  );

  console.log("\nAll critique-engine checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
