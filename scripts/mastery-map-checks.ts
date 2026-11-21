/**
 * Wave 6 E: mastery map checks (sample mode).
 * NODE_OPTIONS='--require ./scripts/preload-server-only.cjs' npx tsx scripts/mastery-map-checks.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
process.env.USE_SAMPLE_DATA = "1";

import { randomUUID } from "crypto";
import { resetSampleStore, readStore, updateStore } from "../src/lib/db/sample-store";
import {
  getMasteryMap,
  resolveMasteryAccess,
  recomputeMasteryForCase,
} from "../src/lib/mastery/repository";
import { listClaimNodesForCase } from "../src/lib/mastery/compute";
import { nowIso } from "../src/lib/utils";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`ok - ${msg}`);
}

async function main() {
  await resetSampleStore();
  const store = await readStore();
  const katie = store.people.find((p) => p.name === "Katie")!;
  const jainam = store.people.find((p) => p.name === "Jainam")!;
  const case9 = store.cases.find((c) => c.number === 9)!;
  assert(katie && jainam && case9, "seed people and case");

  await updateStore((s) => {
    const has = s.case_roles.some(
      (r) =>
        r.person_id === katie.id &&
        r.case_id === case9.id &&
        (r.role === "lead_1" || r.role === "lead_2"),
    );
    if (!has) {
      s.case_roles.push({
        id: randomUUID(),
        team_id: katie.team_id!,
        case_id: case9.id,
        person_id: katie.id,
        role: "lead_2",
        created_at: nowIso(),
        created_by: null,
      });
    }
  });

  const lead2 = await resolveMasteryAccess({
    personId: katie.id,
    role: "member",
    adminView: false,
    teamId: katie.team_id,
  });
  assert(lead2.scope === "lead", "katie is lead");
  assert(
    lead2.scope === "lead" && lead2.caseIds.includes(case9.id),
    "katie lead cases include case 9",
  );

  const adminAccess = await resolveMasteryAccess({
    personId: jainam.id,
    role: "tech_admin",
    adminView: true,
    teamId: jainam.team_id,
  });
  assert(adminAccess.scope === "admin", "jainam admin sees all");

  // Non-lead member: self scope, own row only
  const store2 = await readStore();
  const daniel = store2.people.find((p) => p.name === "Daniel")!;
  assert(daniel?.team_id, "daniel on a team");
  // Ensure Daniel is not a lead on any case
  await updateStore((s) => {
    s.case_roles = s.case_roles.filter(
      (r) =>
        !(
          r.person_id === daniel.id &&
          (r.role === "lead_1" || r.role === "lead_2")
        ),
    );
  });
  const selfAccess = await resolveMasteryAccess({
    personId: daniel.id,
    role: "member",
    adminView: false,
    teamId: daniel.team_id,
  });
  assert(selfAccess.scope === "self", "daniel is self scope");
  const selfMap = await getMasteryMap({
    caseId: case9.id,
    teamId: daniel.team_id,
    access: selfAccess,
  });
  assert(selfMap.people.length === 1, "self map has one person");
  assert(selfMap.people[0]?.id === daniel.id, "self map person is daniel");
  assert(
    selfMap.cells.every((c) => c.person_id === daniel.id),
    "self cells are only daniel",
  );

  // Strip seeded feedback so the grid starts empty (real activity only)
  await updateStore((s) => {
    s.feedback_items = [];
    s.card_reviews = [];
    s.answers = [];
    s.mastery_map_cells = [];
    s.node_mastery = [];
  });

  const emptyMap = await getMasteryMap({
    caseId: case9.id,
    teamId: katie.team_id,
    access: lead2,
  });
  assert(
    emptyMap.cells.every((c) => c.band === "empty"),
    "empty cells until node-linked activity",
  );
  assert(
    emptyMap.cells.every(
      (c) =>
        !c.evidence.card_reviews && !c.evidence.answers && !c.evidence.round_hits,
    ),
    "no evidence on empty cells",
  );

  const after = await readStore();
  const nodes = listClaimNodesForCase(after, case9.id, katie.team_id, null);
  assert(nodes.length >= 1, "case 9 has claim nodes");

  // Add a card review that matches the first claim label text
  const claimLabel = nodes[0]!.label;
  await updateStore((s) => {
    const card = {
      id: randomUUID(),
      team_id: katie.team_id,
      case_id: case9.id,
      deck: "case9",
      front: claimLabel,
      back: "Return with partnership",
      citation_ids: [] as string[],
      truth_item_id: null as string | null,
      claim_id: nodes[0]!.node_id,
      source_kind: "manual" as const,
      created_at: nowIso(),
      created_by: katie.id,
      updated_at: nowIso(),
    };
    s.flashcards.push(card);
    s.card_reviews.push({
      id: randomUUID(),
      person_id: katie.id,
      card_id: card.id,
      grade: 4,
      next_due: nowIso(),
      mode: "typed",
      created_at: nowIso(),
      created_by: katie.id,
    });
  });

  await recomputeMasteryForCase({
    caseId: case9.id,
    teamId: katie.team_id,
    personIds: [katie.id],
  });

  const map = await getMasteryMap({
    caseId: case9.id,
    teamId: katie.team_id,
    access: lead2,
  });
  assert(map.scope === "lead", "lead map scope");
  assert(map.caseNumber === 9, "case 9 map");
  const katieCell = map.cells.find(
    (c) => c.person_id === katie.id && c.node_id === nodes[0]!.node_id,
  );
  assert(katieCell && katieCell.band !== "empty", "katie cell fills from review");
  assert(
    katieCell?.evidence.card_reviews && katieCell.evidence.card_reviews >= 1,
    "evidence records card review",
  );

  // F's node_mastery (claim_id) feeds card evidence into the same cell
  await updateStore((s) => {
    s.card_reviews = [];
    s.mastery_map_cells = [];
    s.node_mastery = [
      {
        id: randomUUID(),
        person_id: katie.id,
        claim_id: nodes[0]!.node_id,
        mastery: 0.72,
        review_count: 3,
        last_grade: 4,
        updated_at: nowIso(),
        created_at: nowIso(),
      },
    ];
  });
  await recomputeMasteryForCase({
    caseId: case9.id,
    teamId: katie.team_id,
    personIds: [katie.id],
  });
  const fromF = await getMasteryMap({
    caseId: case9.id,
    teamId: katie.team_id,
    access: lead2,
  });
  const fCell = fromF.cells.find(
    (c) => c.person_id === katie.id && c.node_id === nodes[0]!.node_id,
  );
  assert(fCell && fCell.band !== "empty", "F node_mastery fills cell");
  assert(fCell?.evidence.card_reviews === 3, "F review_count used as evidence");
  assert(
    fCell != null && fCell.mastery != null && fCell.mastery >= 0.7,
    "F mastery value used for card score",
  );

  const stored = (await readStore()).mastery_map_cells;
  assert(
    stored.some(
      (r) =>
        r.person_id === katie.id &&
        r.node_id === nodes[0]!.node_id &&
        r.case_id === case9.id,
    ),
    "persisted into mastery_map_cells",
  );

  console.log("\nAll mastery-map checks passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
