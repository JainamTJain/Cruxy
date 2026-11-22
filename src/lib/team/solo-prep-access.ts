/**
 * Wave 9 E: access checks for solo async review / handoff routes.
 */
import type { Person } from "@/lib/types";
import type { SessionPayload } from "@/lib/types";
import { isAdminViewer } from "@/lib/ops/privacy-scope";

/** Same team as the recording, or coach/tech in admin view. */
export function canAccessSoloRecording(opts: {
  person: Person;
  session: SessionPayload;
  recordingTeamId: string;
}): boolean {
  if (isAdminViewer(opts.person, opts.session)) return true;
  const own = opts.person.team_id ?? opts.session.teamId;
  return Boolean(own && own === opts.recordingTeamId);
}
