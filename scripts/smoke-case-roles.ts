/**
 * Wave 5 / Workstream J: prove case roles (F-020).
 * Team members can set and change lead / counter-arguer / supporter slots.
 * Run: npm run smoke:case-roles
 */
import { config } from "dotenv";
config({ path: ".env.local" });

process.env.USE_SAMPLE_DATA = "1";

import { canSetCaseRole } from "../src/lib/auth/capabilities";
import { resetSampleStore, readStore } from "../src/lib/db/sample-store";
import { listCaseRoles, setCaseRole } from "../src/lib/team/repository";
import type { Person, SessionPayload } from "../src/lib/types";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`ok: ${msg}`);
}

function sessionFor(
  person: Person,
  overrides: Partial<SessionPayload> = {},
): SessionPayload {
  return {
    personId: person.id,
    role: person.role,
    name: person.name,
    teamId: person.team_id,
    adminView: person.role === "tech_admin" || person.role === "coach_admin",
    mustConsent: false,
    mustSetLearningProfile: false,
    mustChoosePasscode: false,
    sessionVersion: person.session_version ?? 0,
    ...overrides,
  };
}

async function main() {
  await resetSampleStore();
  const store = await readStore();
  const t3 = store.teams.find((t) => t.name === "Team 3");
  const t1 = store.teams.find((t) => t.name === "Team 1");
  const katie = store.people.find((p) => p.name.startsWith("Katie"));
  const nick = store.people.find((p) => p.name === "Nick");
  const daniel = store.people.find((p) => p.name === "Daniel");
  const serena = store.people.find((p) => p.name === "Serena");
  const jainam = store.people.find((p) => p.name === "Jainam");
  const case9 =
    store.cases.find((c) => c.number === 9) ??
    store.cases.find((c) => c.active);
  assert(t3 && t1 && katie && nick && daniel && serena && jainam && case9, "seed");

  assert(
    canSetCaseRole(katie, sessionFor(katie), t3.id),
    "Katie (Team 3 member) can set Team 3 roles",
  );
  assert(
    !canSetCaseRole(katie, sessionFor(katie), t1.id),
    "Katie cannot set Team 1 roles",
  );
  assert(
    !canSetCaseRole(serena, sessionFor(serena), t3.id),
    "Serena (Team 1) cannot set Team 3 roles",
  );
  assert(
    canSetCaseRole(jainam, sessionFor(jainam), t1.id),
    "Jainam (tech admin) can set any team's roles",
  );
  assert(
    canSetCaseRole(
      jainam,
      sessionFor(jainam, { adminView: false, teamId: t3.id, role: "member" }),
      t3.id,
    ),
    "Jainam member view can set Team 3 roles",
  );
  assert(
    !canSetCaseRole(
      jainam,
      sessionFor(jainam, { adminView: false, teamId: t3.id, role: "member" }),
      t1.id,
    ),
    "Jainam member view cannot set Team 1 roles",
  );

  // Set Lead 1
  await setCaseRole({
    teamId: t3.id,
    caseId: case9.id,
    role: "lead_1",
    personId: katie.id,
    actorId: katie.id,
  });
  // Set counter-arguer
  await setCaseRole({
    teamId: t3.id,
    caseId: case9.id,
    role: "counter_arguer",
    personId: nick.id,
    actorId: katie.id,
  });
  // Set supporter
  await setCaseRole({
    teamId: t3.id,
    caseId: case9.id,
    role: "supporter",
    personId: daniel.id,
    actorId: katie.id,
  });
  // Change Lead 1 to Nick (also clears Nick from counter)
  await setCaseRole({
    teamId: t3.id,
    caseId: case9.id,
    role: "lead_1",
    personId: nick.id,
    actorId: katie.id,
  });
  // Re-set counter to Katie after lead change
  await setCaseRole({
    teamId: t3.id,
    caseId: case9.id,
    role: "counter_arguer",
    personId: katie.id,
    actorId: katie.id,
  });

  const roles = await listCaseRoles(t3.id);
  const forCase = roles.filter((r) => r.case_id === case9.id);
  assert(
    forCase.some((r) => r.role === "lead_1" && r.person_id === nick.id),
    "Lead 1 changed to Nick",
  );
  assert(
    forCase.some((r) => r.role === "counter_arguer" && r.person_id === katie.id),
    "Counter-arguer is Katie",
  );
  assert(
    forCase.some((r) => r.role === "supporter" && r.person_id === daniel.id),
    "Supporter is Daniel",
  );
  assert(
    !forCase.some((r) => r.role === "lead_1" && r.person_id === katie.id),
    "Katie no longer Lead 1 after change",
  );

  console.log("smoke-case-roles: all passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
