import { getSession } from "@/lib/auth/session";
import { getPersonById } from "@/lib/db/repository";
import type { SessionPayload } from "@/lib/types";

export async function requireMemberSession(): Promise<
  | { ok: true; session: SessionPayload; teamId: string }
  | { ok: false; status: number; error: string }
> {
  const session = await getSession();
  if (!session) {
    return { ok: false, status: 401, error: "Sign in required." };
  }
  const person = await getPersonById(session.personId);
  const teamId = person?.team_id ?? session.teamId;
  if (!teamId) {
    return {
      ok: false,
      status: 403,
      error: "Case brain edits need a team membership.",
    };
  }
  return { ok: true, session, teamId };
}
