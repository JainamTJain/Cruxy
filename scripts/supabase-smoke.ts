/**
 * Live Supabase smoke for Workstream 0 (sign-in slice).
 *
 * Requires env (never commit these):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *   MEMBER_STARTER_CODE_HASH, COACH_STARTER_CODE_HASH,
 *   PASSCODE_VIEW_KEY,
 *   SMOKE_STARTER_PLAINTEXT (member starter),
 *   SMOKE_COACH_STARTER_PLAINTEXT (Dr. B starter)
 * Optional: INITIAL_ADMIN_CODE_HASH
 *
 * Run: npm run smoke:supabase
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "path";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv();

process.env.USE_SAMPLE_DATA = "0";
delete process.env.VERCEL;

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
  console.log(`ok — ${msg}`);
}

async function main() {
  const required = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "MEMBER_STARTER_CODE_HASH",
    "COACH_STARTER_CODE_HASH",
    "PASSCODE_VIEW_KEY",
    "SMOKE_STARTER_PLAINTEXT",
    "SMOKE_COACH_STARTER_PLAINTEXT",
  ] as const;
  const missing = required.filter((k) => !process.env[k]?.trim());
  if (missing.length) {
    console.error(
      `Missing env for smoke: ${missing.join(", ")}. Live run not executed.`,
    );
    process.exit(2);
  }

  const {
    bootstrapAuthCodes,
    listPeoplePublic,
    getPersonById,
    getSharedStarter,
    getPersonStarter,
    getPersonalCode,
    getAdminCode,
  } = await import("../src/lib/db/supabase/foundation");
  const { attemptSignIn, saveConsent, setPersonalPasscode } = await import(
    "../src/lib/auth/passcode-rules"
  );
  const { decryptPasscodeCopy } = await import("../src/lib/crypto/passcodes");
  const { getServiceSupabase } = await import("../src/lib/db/supabase/client");
  const { COACH_PERSON_ID } = await import("../src/lib/constants");

  const starterPlain = process.env.SMOKE_STARTER_PLAINTEXT!.trim();
  const coachPlain = process.env.SMOKE_COACH_STARTER_PLAINTEXT!.trim();
  assert(/^\d{6}$/.test(starterPlain), "SMOKE_STARTER_PLAINTEXT is 6 digits");
  assert(/^\d{6}$/.test(coachPlain), "SMOKE_COACH_STARTER_PLAINTEXT is 6 digits");
  assert(starterPlain !== coachPlain, "member and coach starters differ");

  console.log("1) Bootstrap auth_codes (idempotent; hashes never printed)…");
  await bootstrapAuthCodes();
  await bootstrapAuthCodes();
  assert(await getSharedStarter(), "shared starter row exists");
  assert(await getPersonStarter(COACH_PERSON_ID), "coach starter row exists");

  const { people, teams } = await listPeoplePublic();
  assert(teams.length === 3, `3 teams (got ${teams.length})`);
  assert(people.length === 15, `15 people (got ${people.length})`);

  const jainam = people.find((p) => p.role === "tech_admin");
  assert(jainam, "tech_admin present");
  if (process.env.INITIAL_ADMIN_CODE_HASH?.trim()) {
    assert(await getAdminCode(jainam.id), "admin row for tech_admin");
  }

  const drB =
    people.find((p) => p.id === COACH_PERSON_ID) ??
    people.find((p) => p.role === "coach_admin");
  assert(drB, "Dr. B (coach_admin) present");

  const member =
    people.find((p) => p.role === "member" && p.name === "Nick") ??
    people.find((p) => p.role === "member");
  assert(member, "member available");

  const sb = getServiceSupabase();
  async function clearPersonal(personId: string) {
    await sb
      .from("auth_codes")
      .delete()
      .eq("kind", "personal")
      .eq("person_id", personId);
    await sb
      .from("people")
      .update({
        consent_version: null,
        consent_at: null,
        recording_ok: false,
        failed_attempts: 0,
        locked_until: null,
      })
      .eq("id", personId);
  }
  await clearPersonal(member.id);
  await clearPersonal(drB.id);

  console.log("2) Cross-rejection: member code fails for Dr. B; coach code fails for member…");
  const memberCodeOnCoach = await attemptSignIn(drB.id, starterPlain, "smoke");
  assert(!memberCodeOnCoach.ok, "shared member starter rejected for Dr. B");
  const coachCodeOnMember = await attemptSignIn(member.id, coachPlain, "smoke");
  assert(!coachCodeOnMember.ok, "coach starter rejected for member");

  console.log("3) Member: starter → consent → choose passcode → sign in again…");
  const first = await attemptSignIn(member.id, starterPlain, "smoke-ip");
  assert(first.ok, first.ok ? "member starter sign-in" : first.error);
  assert(first.session.mustChoosePasscode, "member mustChoosePasscode");
  await saveConsent({ personId: member.id, recordingOk: false });
  assert(
    (await getPersonById(member.id))?.consent_version,
    "member consent stored",
  );
  const personal = "749281";
  const chosen = await setPersonalPasscode(member.id, personal, personal);
  assert(chosen.ok, chosen.ok ? "member passcode chosen" : chosen.error);
  const personalRow = await getPersonalCode(member.id);
  assert(personalRow?.encrypted_copy, "member encrypted_copy present");
  assert(
    decryptPasscodeCopy(personalRow!.encrypted_copy!) === personal,
    "encrypted_copy decrypts",
  );
  const second = await attemptSignIn(member.id, personal, "smoke-ip");
  assert(second.ok, second.ok ? "member personal sign-in" : second.error);
  assert(
    !(await attemptSignIn(member.id, starterPlain, "smoke-ip")).ok,
    "member starter rejected after personal set",
  );

  console.log("4) Dr. B: coach starter → consent → choose passcode…");
  const coachFirst = await attemptSignIn(drB.id, coachPlain, "smoke-ip");
  assert(
    coachFirst.ok,
    coachFirst.ok ? "coach starter sign-in" : coachFirst.error,
  );
  assert(coachFirst.session.mustChoosePasscode, "coach mustChoosePasscode");
  await saveConsent({ personId: drB.id, recordingOk: false });
  const coachPersonal = "836172";
  const coachChosen = await setPersonalPasscode(
    drB.id,
    coachPersonal,
    coachPersonal,
  );
  assert(
    coachChosen.ok,
    coachChosen.ok ? "coach passcode chosen" : coachChosen.error,
  );
  const coachSecond = await attemptSignIn(drB.id, coachPersonal, "smoke-ip");
  assert(
    coachSecond.ok,
    coachSecond.ok ? "coach personal sign-in" : coachSecond.error,
  );
  assert(
    !(await attemptSignIn(drB.id, coachPlain, "smoke-ip")).ok,
    "coach starter rejected after personal set",
  );

  console.log("5) Chat / proposal / decision…");
  console.log("   DEFERRED to follow-up commits on this PR.");

  console.log("\nSMOKE OK (sign-in / consent / choose-passcode / coach starter)");
}

main().catch((err) => {
  console.error("SMOKE FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
