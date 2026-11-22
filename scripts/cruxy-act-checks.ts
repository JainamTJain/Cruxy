/**
 * Cruxy page-action checks (sample mode). Detectors, planners, apply paths.
 * NODE_OPTIONS='--require ./scripts/preload-server-only.cjs' npx tsx scripts/cruxy-act-checks.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
process.env.USE_SAMPLE_DATA = "1";
process.env.SESSION_SECRET =
  process.env.SESSION_SECRET ?? "test-session-secret-for-cruxy-act";

import { randomUUID } from "crypto";
import { resetSampleStore, readStore, updateStore } from "../src/lib/db/sample-store";
import {
  looksLikeActRequest,
  looksLikeBriefDecide,
  looksLikeDrillStart,
  looksLikeEvidenceQueue,
  looksLikeFlashcards,
  looksLikeLeadsCount,
  looksLikeRolesRequest,
  looksLikeTodayPlan,
} from "../src/lib/cruxy/actions/detect";
import {
  cannotDoYet,
  suggestionChipsForPage,
} from "../src/lib/cruxy/actions/types";
import { answerWhoHasMostLeads } from "../src/lib/cruxy/actions/roles-info";
import {
  applyBriefDecide,
  planBriefDecide,
  planEvidenceQueue,
  planFlashcards,
  applyEvidenceQueue,
  applyFlashcards,
} from "../src/lib/cruxy/actions/case-actions";
import { planDrillStart, applyDrillStart } from "../src/lib/cruxy/actions/drill";
import {
  planToday20,
  applyTodayPlan,
} from "../src/lib/cruxy/actions/today-plan";
import { planPageAction } from "../src/lib/cruxy/actions/dispatch";
import { signPlan, readPlan } from "../src/lib/cruxy/actions/plan-token";
import { getRolesBoard } from "../src/lib/team/roles-board-repository";
import type { Proposal } from "../src/lib/case-brain/types";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`ok - ${msg}`);
}

async function main() {
  await resetSampleStore();
  const store = await readStore();
  const team3 = store.teams.find((t) => t.name.includes("3")) ?? store.teams[2]!;
  const people = store.people.filter((p) => p.team_id === team3.id);
  const actor = people[0]!;
  const cases = store.cases.filter((c) => c.active);
  const caseRow = cases[0]!;

  // Detectors
  assert(looksLikeRolesRequest("Shuffle the rest fairly"), "roles shuffle");
  assert(looksLikeLeadsCount("Who has the most leads?"), "leads count");
  assert(
    looksLikeBriefDecide("Accept this Team Brief suggestion"),
    "brief accept",
  );
  assert(
    looksLikeEvidenceQueue("Add a fact to the Evidence Library: robots need rest"),
    "evidence queue",
  );
  assert(
    looksLikeFlashcards("Make flashcards from the key points"),
    "flashcards",
  );
  assert(looksLikeDrillStart("Start a 10 minute drill"), "drill start");
  assert(looksLikeTodayPlan("Plan my next 20 minutes"), "today plan");
  assert(looksLikeActRequest("Shuffle the rest fairly"), "act request roles");
  assert(!looksLikeActRequest("Quiz me on this case"), "quiz is not an act");

  // Chips
  assert(
    suggestionChipsForPage("/team/roles").includes("Shuffle the rest fairly"),
    "roles chips",
  );
  assert(
    suggestionChipsForPage(`/case-brain/${caseRow.id}`).includes(
      "Quiz me on this case",
    ),
    "case chips quiz",
  );
  assert(
    suggestionChipsForPage("/practice").includes("Start a 10 minute drill"),
    "practice chips",
  );
  assert(
    suggestionChipsForPage("/today").includes("Plan my next 20 minutes"),
    "today chips",
  );

  // No-deflection copy
  const soft = cannotDoYet(
    "start a drill",
    "Open Practice, then ask me again, or tap a drill such as Judges' Q&A.",
  );
  assert(soft.includes("I cannot start a drill from here yet."), "cannotDoYet");
  assert(soft.includes("Open Practice"), "cannotDoYet tap path");

  // Roles info
  const board = await getRolesBoard({ teamId: team3.id, canEdit: true });
  const leadsAnswer = answerWhoHasMostLeads(board);
  assert(typeof leadsAnswer === "string" && leadsAnswer.length > 0, "leads answer");

  const leadsPlan = await planPageAction({
    message: "Who has the most leads?",
    page: "/team/roles",
    caseId: null,
    teamId: team3.id,
    personId: actor.id,
    rolesBoard: board,
  });
  assert(leadsPlan.kind === "say", "leads is say not plan");

  // Off-page: exact tap, not a soft deflection
  const offDrill = await planPageAction({
    message: "Start a 10 minute drill",
    page: "/today",
    caseId: null,
    teamId: team3.id,
    personId: actor.id,
  });
  assert(offDrill.kind === "say", "off-page drill says");
  if (offDrill.kind === "say") {
    assert(offDrill.text.includes("Open Practice"), "off-page drill tap");
    assert(!/sorry|not sure|maybe/i.test(offDrill.text), "no soft deflection");
  }

  // Evidence queue plan + apply
  const evidencePlan = await planEvidenceQueue({
    message: "Add a fact to the Evidence Library: consent must be clear",
    page: `/case-brain/${caseRow.id}`,
    caseId: caseRow.id,
    teamId: team3.id,
  });
  assert(evidencePlan.kind === "plan", "evidence plan");
  if (evidencePlan.kind === "plan") {
    assert(evidencePlan.action === "evidence.queue", "evidence action id");
    const applied = await applyEvidenceQueue({
      data: evidencePlan.data as {
        caseId: string;
        text: string;
      },
      personId: actor.id,
      teamId: team3.id,
    });
    assert(applied.message.includes("Queued"), "evidence applied");
  }

  // Brief decide: inject pending rows directly so fire-and-forget notify
  // from createProposal cannot race the sample store between plan calls.
  async function injectPending(text: string): Promise<Proposal> {
    const now = new Date().toISOString();
    const proposal: Proposal = {
      id: randomUUID(),
      team_id: team3.id,
      case_id: caseRow.id,
      idea_key: `act-check-${randomUUID()}`,
      origin: "member",
      origin_ref: "cruxy:act:check",
      inspired_from_team_id: null,
      text,
      kind: "fact",
      citation_ids: [],
      cruxy_note: null,
      socratic_question: null,
      socratic_answered: true,
      status: "pending",
      created_at: now,
      created_by: actor.id,
      updated_at: now,
    };
    await updateStore((s) => {
      s.proposals.push(proposal);
    });
    return proposal;
  }

  // Plan+apply each verdict on its own clean store. Accept fan-out fires
  // createProposal notifies that race later writes if we keep going.
  {
    const acceptTarget = await injectPending(
      "Teams should publish consent language before recording.",
    );
    const acceptPlan = await planBriefDecide({
      message: `Accept this Team Brief suggestion: ${acceptTarget.text}`,
      page: `/case-brain/${caseRow.id}`,
      caseId: caseRow.id,
      teamId: team3.id,
      personId: actor.id,
    });
    assert(acceptPlan.kind === "plan", "brief accept plan");
    if (acceptPlan.kind === "plan") {
      assert(acceptPlan.action === "brief.accept", "brief accept action");
      assert(
        (acceptPlan.data as { proposalId: string }).proposalId ===
          acceptTarget.id,
        "brief picks a proposal",
      );
    }
  }

  await resetSampleStore();
  {
    const rejectTarget = await injectPending(
      "Reject-me: recording without a clear opt-in is not fine.",
    );
    const rejectPlan = await planBriefDecide({
      message: `Reject this Team Brief suggestion: ${rejectTarget.text}`,
      page: `/case-brain/${caseRow.id}`,
      caseId: caseRow.id,
      teamId: team3.id,
      personId: actor.id,
    });
    assert(rejectPlan.kind === "plan", "brief reject plan");
    if (rejectPlan.kind === "plan") {
      assert(rejectPlan.action === "brief.reject", "brief reject action");
      assert(
        (rejectPlan.data as { proposalId: string }).proposalId ===
          rejectTarget.id,
        "brief reject picks the new proposal",
      );
      const rejected = await applyBriefDecide({
        data: rejectPlan.data as {
          proposalId: string;
          verdict: "accept" | "reject";
          text: string;
          caseId: string;
        },
        personId: actor.id,
        teamId: team3.id,
      });
      assert(rejected.message.includes("Rejected"), "brief reject applied");
    }
  }

  await resetSampleStore();
  {
    const acceptApplyTarget = await injectPending(
      "Apply-accept: consent language belongs in the brief.",
    );
    const acceptApplyPlan = await planBriefDecide({
      message: `Accept this Team Brief suggestion: ${acceptApplyTarget.text}`,
      page: `/case-brain/${caseRow.id}`,
      caseId: caseRow.id,
      teamId: team3.id,
      personId: actor.id,
    });
    assert(acceptApplyPlan.kind === "plan", "brief accept apply plan");
    if (acceptApplyPlan.kind === "plan") {
      const accepted = await applyBriefDecide({
        data: acceptApplyPlan.data as {
          proposalId: string;
          verdict: "accept" | "reject";
          text: string;
          caseId: string;
        },
        personId: actor.id,
        teamId: team3.id,
      });
      assert(accepted.message.includes("Accepted"), "brief accept applied");
    }
  }
  await resetSampleStore();

  // Flashcards: may say cannot if no claims; still a valid action path
  const flashPlan = await planFlashcards({
    message: "Make flashcards from the key points",
    page: `/case-brain/${caseRow.id}`,
    caseId: caseRow.id,
    teamId: team3.id,
  });
  assert(
    flashPlan.kind === "plan" || flashPlan.kind === "say",
    "flashcards plan or cannot",
  );
  if (flashPlan.kind === "plan") {
    assert(flashPlan.action === "flashcards.make", "flashcards action");
    const before = (await readStore()).flashcards.filter(
      (f) => f.team_id === team3.id,
    ).length;
    await applyFlashcards({
      data: flashPlan.data as {
        caseId: string;
        cards: { front: string; back: string; claimId: string | null }[];
      },
      personId: actor.id,
      teamId: team3.id,
    });
    const after = (await readStore()).flashcards.filter(
      (f) => f.team_id === team3.id,
    ).length;
    assert(after > before, "flashcards saved");
  } else if (flashPlan.kind === "say") {
    assert(
      flashPlan.text.includes("I cannot") || flashPlan.text.includes("Revision"),
      "flashcards exact tap",
    );
  }

  // Drill plan + apply
  const drillPlan = await planDrillStart({
    message: `Start a 10 minute drill on case ${caseRow.number}`,
  });
  assert(drillPlan.kind === "plan", "drill plan");
  if (drillPlan.kind === "plan") {
    assert(drillPlan.action === "drill.start", "drill action");
    const started = await applyDrillStart({
      data: drillPlan.data as {
        mode: "judges_qa_drill";
        caseId: string | null;
        caseNumber: number | null;
        caseTitle: string | null;
        label: string;
      },
      personId: actor.id,
    });
    assert(started.navigate.includes("/practice/"), "drill navigate");
  }

  // Today plan + apply
  const todayPlan = await planToday20();
  assert(todayPlan.kind === "plan", "today plan");
  if (todayPlan.kind === "plan") {
    assert(todayPlan.action === "today.plan20", "today action");
    assert(todayPlan.lines.length >= 1, "today has steps");
    const applied = applyTodayPlan(
      todayPlan.data as {
        steps: { label: string; detail: string; href: string; minutes: number }[];
      },
    );
    assert(Boolean(applied.navigate), "today navigate");
  }

  // Dispatch: case flashcards on case page
  const dispatched = await planPageAction({
    message: "Make flashcards from the key points",
    page: `/case-brain/${caseRow.id}`,
    caseId: caseRow.id,
    teamId: team3.id,
    personId: actor.id,
  });
  assert(
    dispatched.kind === "plan" || dispatched.kind === "say",
    "dispatch flashcards",
  );

  // Plan token round-trip
  const token = await signPlan({
    action: "today.plan20",
    personId: actor.id,
    teamId: team3.id,
    data: { steps: [{ label: "CARDS", detail: "Due cards", href: "/revision/flashcards", minutes: 8 }] },
  });
  const read = await readPlan(token);
  assert(read?.action === "today.plan20", "plan token round-trip");
  assert(read?.personId === actor.id, "plan token person");

  // Missing case id: exact tap
  const noCase = await planBriefDecide({
    message: "Accept this Team Brief suggestion",
    page: "/case-brain",
    caseId: null,
    teamId: team3.id,
    personId: actor.id,
  });
  assert(noCase.kind === "say", "brief without case says");
  if (noCase.kind === "say") {
    assert(noCase.text.includes("Open a case"), "brief without case tap");
  }

  console.log("\nAll cruxy-act checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
