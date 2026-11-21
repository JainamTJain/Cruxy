import "server-only";
import { getPersonById } from "@/lib/db/repository";
import { getRoundById } from "@/lib/db/practice-repository";
import { sessionHasTextOnlyMembers } from "@/lib/attendance";
import type { PracticeSession, RecordingLayout } from "@/lib/practice/types";

/**
 * F-386: nobody is recorded without stored consent (recording_ok).
 * Missing consent or text-only choice both refuse.
 */
export async function assertMayRecord(
  personId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const person = await getPersonById(personId);
  if (!person) {
    return { ok: false, reason: "Person not found." };
  }
  if (!person.consent_version) {
    return {
      ok: false,
      reason: "Consent is required before this device can record.",
    };
  }
  if (!person.recording_ok) {
    return {
      ok: false,
      reason: "Text-only consent. This device does not record.",
    };
  }
  return { ok: true };
}

/**
 * Room or mixed mics capture everyone in the room. When any text-only member
 * is present, only own-device recording is allowed.
 */
export async function assertRecordingLayoutAllowed(opts: {
  sessionId: string;
  layout: RecordingLayout;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (opts.layout === "own_device") return { ok: true };
  const textOnly = await sessionHasTextOnlyMembers(opts.sessionId);
  if (textOnly.hasTextOnly) {
    const names = textOnly.names.join(", ") || "a teammate";
    return {
      ok: false,
      reason: `${names} chose text only. Use own-device recording so their voice is never captured.`,
    };
  }
  return { ok: true };
}

export function isPracticeSessionEnded(session: PracticeSession): boolean {
  return session.status === "ended";
}

/** Guest link / session code refuses once the session has ended. */
export async function assertSessionJoinable(
  session: PracticeSession,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (isPracticeSessionEnded(session)) {
    return {
      ok: false,
      reason: "This session has ended. The join code and guest links no longer work.",
    };
  }
  return { ok: true };
}

/**
 * Resolve guest access against the round's session: refuse when the session
 * has ended (F-392).
 */
export async function assertGuestRoundStillOpen(
  roundId: string,
): Promise<{ ok: true; sessionId: string } | { ok: false; reason: string }> {
  const round = await getRoundById(roundId);
  if (!round?.session) {
    return { ok: false, reason: "Round not found." };
  }
  const joinable = await assertSessionJoinable(round.session);
  if (!joinable.ok) return joinable;
  return { ok: true, sessionId: round.session_id };
}
