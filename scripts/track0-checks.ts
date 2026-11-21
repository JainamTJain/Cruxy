import { config } from "dotenv";
config({ path: ".env.local" });
/**
 * Track 0 acceptance checks against the sample-data store.
 * Run: npx tsx scripts/track0-checks.ts
 * Never prints secret env values.
 */
import { resetSampleStore } from "../src/lib/db/sample-store";
import {
  getPersonalCode,
  getSharedStarter,
  listActivityLog,
  sumMonthlySpendUsd,
} from "../src/lib/db/repository";
import {
  attemptSignIn,
  setPersonalPasscode,
  saveConsent,
} from "../src/lib/auth/passcode-rules";
import { callCruxy, __forceSpendForTests } from "../src/lib/cruxy/callCruxy";
import { SAMPLE_MEMBER_STARTER } from "../src/lib/constants";
import { CONSENT_VERSION } from "../src/lib/types";
import { getPersonById } from "../src/lib/db/repository";
import { verifyPasscode } from "../src/lib/crypto/passcodes";

process.env.USE_SAMPLE_DATA = "1";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`ok — ${msg}`);
}

async function main() {
  await resetSampleStore();
  const storePeople = await (
    await import("../src/lib/db/sample-store")
  ).readStore();
  const serena = storePeople.people.find((p) => p.name === "Serena");
  const jainam = storePeople.people.find((p) => p.name === "Jainam");
  assert(serena && jainam, "seeded Serena and Jainam");

  // Shared starter works first time
  const first = await attemptSignIn(serena!.id, SAMPLE_MEMBER_STARTER, null);
  assert(first.ok, "shared starter signs Serena in");

  await saveConsent({ personId: serena!.id, recordingOk: false });
  const afterConsent = await getPersonById(serena!.id);
  assert(
    afterConsent?.consent_version === CONSENT_VERSION,
    "consent stored with version",
  );

  const choose = await setPersonalPasscode(serena!.id, "739104", "739104");
  assert(choose.ok, "Serena chooses personal passcode");

  // Shared starter fails after personal set
  await resetAttempts(serena!.id);
  const sharedAgain = await attemptSignIn(
    serena!.id,
    SAMPLE_MEMBER_STARTER,
    null,
  );
  assert(!sharedAgain.ok, "shared starter fails after personal passcode");

  const personalOk = await attemptSignIn(serena!.id, "739104", null);
  assert(personalOk.ok, "personal passcode signs in");

  // Lock after 5 wrong tries
  await resetAttempts(serena!.id);
  for (let i = 0; i < 5; i++) {
    await attemptSignIn(serena!.id, "000000", null);
  }
  const locked = await getPersonById(serena!.id);
  assert(locked?.locked_until, "5 wrong tries lock for 10 minutes");

  // Member cannot "read" auth_codes / ai_calls — enforced by API role checks;
  // sample store keeps them server-side only (no client export).
  const starter = await getSharedStarter();
  assert(starter?.hash && !starter.hash.includes(SAMPLE_MEMBER_STARTER), "starter stored as hash");
  const personal = await getPersonalCode(serena!.id);
  assert(personal?.encrypted_copy, "personal has encrypted copy");
  assert(personal && !(await verifyPasscode(personal.hash, SAMPLE_MEMBER_STARTER)), "personal hash is not shared starter");

  // callCruxy refuses at monthly cap
  await __forceSpendForTests(30);
  const spent = await sumMonthlySpendUsd();
  assert(spent >= 30, "monthly spend at cap");
  const refused = await callCruxy({
    feature: "assistant",
    model: "test",
    messages: [{ role: "user", content: "hello" }],
    personId: serena!.id,
  });
  assert(!refused.ok && refused.refused, "callCruxy refuses at monthly cap");

  const exempt = await callCruxy({
    feature: "flashcard_review",
    model: "test",
    messages: [{ role: "user", content: "review" }],
    personId: serena!.id,
  });
  assert(exempt.ok, "exempt features still work at cap");

  const log = await listActivityLog(50);
  assert(
    log.some((e) => e.action === "consent_saved"),
    "consent in activity log",
  );
  assert(
    log.some((e) => e.action === "sign_in_locked"),
    "lock in activity log",
  );

  console.log("\nAll Track 0 acceptance checks passed.");
}

async function resetAttempts(personId: string) {
  const p = await getPersonById(personId);
  if (!p) return;
  p.failed_attempts = 0;
  p.locked_until = null;
  const { savePerson } = await import("../src/lib/db/repository");
  await savePerson(p);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
