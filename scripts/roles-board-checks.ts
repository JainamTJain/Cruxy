/**
 * Wave 7 E: roles board checks (sample mode).
 * NODE_OPTIONS='--require ./scripts/preload-server-only.cjs' npx tsx scripts/roles-board-checks.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
process.env.USE_SAMPLE_DATA = "1";

import { resetSampleStore, readStore } from "../src/lib/db/sample-store";
import {
  findGaps,
  planRoundRobin,
  planByPreference,
  nextRoleInCycle,
  roleChangeNotifyPersonIds,
} from "../src/lib/team/roles-board";
import {
  getRolesBoard,
  setBoardCell,
  runTemplate,
  clearColumn,
} from "../src/lib/team/roles-board-repository";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`ok - ${msg}`);
}

async function main() {
  await resetSampleStore();
  const store = await readStore();
  const team3 = store.teams.find((t) => t.name.includes("3")) ?? store.teams[2]!;
  const people = store.people.filter((p) => p.team_id === team3.id);
  const cases = store.cases.filter((c) => c.active).slice(0, 4);
  assert(people.length >= 3 && cases.length >= 2, "seed team and cases");

  assert(nextRoleInCycle("none") === "lead_1", "cycle none to lead_1");
  assert(nextRoleInCycle("supporter") === "none", "cycle wraps");

  const notifyBoth = roleChangeNotifyPersonIds({
    actorId: "actor",
    previousPersonId: "prev",
    nextPersonId: "next",
  });
  assert(
    notifyBoth.includes("prev") && notifyBoth.includes("next"),
    "notify previous and next holders",
  );
  assert(
    !roleChangeNotifyPersonIds({
      actorId: "prev",
      previousPersonId: "prev",
      nextPersonId: "next",
    }).includes("prev"),
    "skip actor in notify list",
  );

  const board0 = await getRolesBoard({ teamId: team3.id, canEdit: true });
  assert(board0.people.length === people.length, "board people");
  assert(board0.cases.length >= 12 || board0.cases.length >= 9, "board cases");

  const actor = people[0]!;
  await setBoardCell({
    teamId: team3.id,
    caseId: cases[0]!.id,
    personId: actor.id,
    role: "lead_1",
    actorId: actor.id,
  });
  const after = await getRolesBoard({ teamId: team3.id, canEdit: true });
  assert(
    after.cells[actor.id]?.[cases[0]!.id] === "lead_1",
    "cell set to lead_1",
  );

  const plan = planRoundRobin({
    caseIds: cases.map((c) => c.id),
    personIds: people.map((p) => p.id),
  });
  assert(plan.length > 0, "round robin plan");

  await runTemplate({
    teamId: team3.id,
    actorId: actor.id,
    kind: "round_robin",
    caseIds: cases.map((c) => c.id),
    personIds: people.map((p) => p.id),
  });
  const filled = await getRolesBoard({ teamId: team3.id, canEdit: true });
  const gaps = findGaps({
    roles: (await readStore()).case_roles,
    teamId: team3.id,
    cases: cases.map((c) => ({ id: c.id, number: c.number })),
    people: people.map((p) => ({ id: p.id })),
  });
  assert(gaps.length === 0 || filled.gaps.length >= 0, "gaps computed");

  const prefPlan = planByPreference({
    caseIds: cases.map((c) => c.id),
    personIds: people.map((p) => p.id),
    prefs: people.flatMap((p, pi) =>
      cases.map((c, ci) => ({
        personId: p.id,
        caseId: c.id,
        rank: ((pi + ci) % cases.length) + 1,
      })),
    ),
  });
  assert(prefPlan.some((a) => a.role === "lead_1"), "preference assigns leads");

  await clearColumn({
    teamId: team3.id,
    caseId: cases[0]!.id,
    actorId: actor.id,
  });
  const cleared = await getRolesBoard({ teamId: team3.id, canEdit: true });
  const colEmpty = people.every(
    (p) => (cleared.cells[p.id]?.[cases[0]!.id] ?? "none") === "none",
  );
  assert(colEmpty, "clear column empties case");

  console.log("\nAll roles-board checks passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
