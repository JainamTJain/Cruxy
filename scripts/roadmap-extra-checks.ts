/**
 * Wave 5 Workstream E: roadmap-extra acceptance (sample mode).
 * Run: NODE_OPTIONS='--require ./scripts/preload-server-only.cjs' npx tsx scripts/roadmap-extra-checks.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
process.env.USE_SAMPLE_DATA = "1";

import { resetSampleStore, readStore, updateStore } from "../src/lib/db/sample-store";
import {
  evaluateStage,
  getEnrichedRoadmapView,
  setTeamDeadlineOverrides,
  computeTeamReadiness,
} from "../src/lib/revision/roadmap-extra";
import { SEED_TEAM_IDS } from "../src/lib/seed/ids";
import { nowIso } from "../src/lib/utils";
import { randomUUID } from "crypto";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`ok — ${msg}`);
}

async function main() {
  await resetSampleStore();
  const store = await readStore();
  const katie = store.people.find((p) => p.name === "Katie")!;
  const case9 = store.cases.find((c) => c.number === 9)!;
  assert(katie && case9, "seeded Katie and Case 9");

  const readBefore = evaluateStage(store, katie.id, case9.id, "read");
  assert(readBefore.notStarted, "read is not started with no progress");

  await updateStore((s) => {
    const files = s.files.filter((f) => f.case_ids.includes(case9.id));
    const file = files[0] ?? {
      id: randomUUID(),
      drive_id: null,
      name: "Case 9 case set [core]",
      path: null,
      mime: null,
      modified_at: null,
      checksum: null,
      case_ids: [case9.id],
      case_numbers: [9],
      type: "case_set" as const,
      confidence: 1,
      card: "core",
      text_content: "x",
      scanned_pdf: false,
      status: "ready" as const,
      extracted_ideas: [],
      created_at: nowIso(),
      created_by: null,
    };
    if (!files[0]) s.files.push(file);
    s.reading_progress.push({
      id: randomUUID(),
      person_id: katie.id,
      case_id: case9.id,
      file_id: file.id,
      opened_ratio: 0.7,
      created_at: nowIso(),
      updated_at: nowIso(),
    });
  });

  const after = await readStore();
  const readAfter = evaluateStage(after, katie.id, case9.id, "read");
  assert(readAfter.done || !readAfter.notStarted, "reading progress registers");

  const overrides = await setTeamDeadlineOverrides({
    teamId: SEED_TEAM_IDS.team3,
    personId: katie.id,
    dues: { read: "2026-11-20", judged: "2026-12-03" },
  });
  assert(
    overrides.some((o) => o.stage === "read" && o.due === "2026-11-20"),
    "team can edit read deadline",
  );

  const view = await getEnrichedRoadmapView({
    personId: katie.id,
    name: katie.name,
    teamId: katie.team_id,
  });
  assert(view.deadlines.read === "2026-11-20", "enriched view uses team deadline");
  assert(typeof view.overallReady === "number", "personal readiness number");
  assert(view.teamReadiness != null, "team readiness number");
  assert(Array.isArray(view.doNext), "do next list");

  const team = await computeTeamReadiness(SEED_TEAM_IDS.team3);
  assert(team.byCase.length >= 1, "team readiness by case");

  console.log("\nAll roadmap-extra checks passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
