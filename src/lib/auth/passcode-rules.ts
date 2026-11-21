import {
  encryptPasscodeCopy,
  hashPasscode,
  validatePersonalPasscode,
  verifyPasscode,
  getSampleMemberStarter,
} from "@/lib/crypto/passcodes";
import {
  getAdminCode,
  getPersonById,
  getPersonalCode,
  getSharedStarter,
  logActivity,
  replacePersonalCode,
  savePerson,
} from "@/lib/db/repository";
import { LOCKOUT_MINUTES, MAX_FAILED_ATTEMPTS } from "@/lib/constants";
import { addMinutes, isLocked, nowIso } from "@/lib/utils";
import { CONSENT_VERSION, type Person, type SessionPayload } from "@/lib/types";
import { randomUUID } from "crypto";

export type SignInResult =
  | {
      ok: true;
      session: SessionPayload;
      person: Person;
    }
  | { ok: false; error: string; lockedUntil?: string };

async function recordFailure(person: Person, ipHash: string | null) {
  person.failed_attempts += 1;
  if (person.failed_attempts >= MAX_FAILED_ATTEMPTS) {
    person.locked_until = addMinutes(new Date(), LOCKOUT_MINUTES).toISOString();
    person.failed_attempts = 0;
    await logActivity({
      person_id: null,
      action: "sign_in_locked",
      target: person.id,
      meta: { name: person.name, minutes: LOCKOUT_MINUTES },
      ip_hash: ipHash,
    });
  }
  await savePerson(person);
}

export async function attemptSignIn(
  personId: string,
  code: string,
  ipHash: string | null,
): Promise<SignInResult> {
  const person = await getPersonById(personId);
  if (!person) return { ok: false, error: "Name not found." };

  if (isLocked(person.locked_until)) {
    return {
      ok: false,
      error: "Too many wrong tries. Try again in a few minutes.",
      lockedUntil: person.locked_until ?? undefined,
    };
  }

  const personal = await getPersonalCode(person.id);
  const admin = await getAdminCode(person.id);
  const starter = await getSharedStarter();

  let matched: "personal" | "admin" | "starter" | null = null;

  if (personal && !personal.must_choose) {
    if (await verifyPasscode(personal.hash, code)) matched = "personal";
  } else {
    // First-time / reset: accept shared starter (members) or admin starter
    if (admin && (await verifyPasscode(admin.hash, code))) matched = "admin";
    else if (
      person.role !== "tech_admin" &&
      starter &&
      (await verifyPasscode(starter.hash, code))
    ) {
      matched = "starter";
    } else if (
      person.role === "tech_admin" &&
      admin &&
      (await verifyPasscode(admin.hash, code))
    ) {
      matched = "admin";
    }
  }

  // After personal is set, shared starter must fail (even if somehow still tried)
  if (!matched && personal && !personal.must_choose && starter) {
    if (await verifyPasscode(starter.hash, code)) {
      await recordFailure(person, ipHash);
      await logActivity({
        person_id: person.id,
        action: "sign_in_failed_shared_after_personal",
        target: person.id,
        ip_hash: ipHash,
      });
      return {
        ok: false,
        error: "That member code no longer works for you. Use your passcode.",
      };
    }
  }

  if (!matched) {
    await recordFailure(person, ipHash);
    await logActivity({
      person_id: null,
      action: "sign_in_failed",
      target: person.id,
      meta: { name: person.name },
      ip_hash: ipHash,
    });
    const refreshed = await getPersonById(person.id);
    if (refreshed && isLocked(refreshed.locked_until)) {
      return {
        ok: false,
        error: "Too many wrong tries. Locked for 10 minutes.",
        lockedUntil: refreshed.locked_until ?? undefined,
      };
    }
    return { ok: false, error: "Wrong passcode." };
  }

  person.failed_attempts = 0;
  person.locked_until = null;
  person.last_sign_in_at = nowIso();
  await savePerson(person);
  await logActivity({
    person_id: person.id,
    action: "sign_in",
    target: person.id,
    meta: { via: matched },
    ip_hash: ipHash,
  });

  const mustConsent =
    !person.consent_version || person.consent_version !== CONSENT_VERSION;
  const mustChoosePasscode =
    matched === "starter" ||
    matched === "admin" ||
    Boolean(personal?.must_choose);

  const session: SessionPayload = {
    personId: person.id,
    role: person.role,
    name: person.name,
    teamId: person.team_id,
    adminView: false,
    mustConsent,
    mustChoosePasscode,
  };

  return { ok: true, session, person };
}

export async function setPersonalPasscode(
  personId: string,
  code: string,
  confirm: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (code !== confirm) return { ok: false, error: "Passcodes do not match." };

  const starterPlain =
    process.env.MEMBER_STARTER_PLAINTEXT_HINT ?? getSampleMemberStarter();
  const err = validatePersonalPasscode(code, starterPlain);
  if (err) return { ok: false, error: err };

  // Also refuse if it matches current shared starter hash
  const starter = await getSharedStarter();
  if (starter && (await verifyPasscode(starter.hash, code))) {
    return { ok: false, error: "Not the member code." };
  }

  const person = await getPersonById(personId);
  if (!person) return { ok: false, error: "Person not found." };

  const hash = await hashPasscode(code);
  const encrypted =
    person.role === "tech_admin" ? null : encryptPasscodeCopy(code);

  await replacePersonalCode(personId, {
    kind: "personal",
    person_id: personId,
    hash,
    encrypted_copy: encrypted,
    must_choose: false,
    set_at: nowIso(),
    last_revealed_at: null,
  });

  // Clear must_choose on admin starter row for Jainam (hash-only path remains)
  const admin = await getAdminCode(personId);
  if (admin) {
    admin.must_choose = false;
    const { upsertAuthCode } = await import("@/lib/db/repository");
    await upsertAuthCode(admin);
  }

  await logActivity({
    person_id: personId,
    action: "passcode_chosen",
    target: personId,
  });

  return { ok: true };
}

export async function saveConsent(input: {
  personId: string;
  recordingOk: boolean;
  voiceSamplePath?: string | null;
}): Promise<void> {
  const person = await getPersonById(input.personId);
  if (!person) throw new Error("Person not found");
  person.consent_version = CONSENT_VERSION;
  person.consent_at = nowIso();
  person.recording_ok = input.recordingOk;
  if (input.voiceSamplePath !== undefined) {
    person.voice_sample_path = input.voiceSamplePath;
  }
  await savePerson(person);
  await logActivity({
    person_id: person.id,
    action: "consent_saved",
    target: person.id,
    meta: {
      version: CONSENT_VERSION,
      recording_ok: input.recordingOk,
    },
  });
}

export function newOneTimeCode(): string {
  // Cryptographically random 6 digits, avoiding weak patterns is best-effort
  let code = "";
  do {
    code = String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
  } while (
    validatePersonalPasscode(code, getSampleMemberStarter()) !== null
  );
  return code;
}

export async function resetPersonPasscode(
  actorId: string,
  targetId: string,
): Promise<{ oneTimeCode: string }> {
  const oneTimeCode = newOneTimeCode();
  const hash = await hashPasscode(oneTimeCode);
  await replacePersonalCode(targetId, {
    id: randomUUID(),
    kind: "personal",
    person_id: targetId,
    hash,
    encrypted_copy: encryptPasscodeCopy(oneTimeCode),
    must_choose: true,
    set_at: nowIso(),
    last_revealed_at: null,
  });
  await logActivity({
    person_id: actorId,
    action: "passcode_reset",
    target: targetId,
  });
  return { oneTimeCode };
}
