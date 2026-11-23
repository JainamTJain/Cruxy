import { getSession } from "@/lib/auth/session";
import {
  canWriteTeamData,
  resolveVisibleTeamId,
} from "@/lib/auth/team-privacy";
import { getPersonById } from "@/lib/db/repository";
import type { Person, SessionPayload } from "@/lib/types";
import { NextResponse } from "next/server";

export async function requireSession(): Promise<
  { session: SessionPayload } | { error: NextResponse }
> {
  const session = await getSession();
  if (!session) {
    return {
      error: NextResponse.json({ error: "Sign in required" }, { status: 401 }),
    };
  }
  return { session };
}

export async function requirePerson(): Promise<
  | { session: SessionPayload; person: Person }
  | { error: NextResponse }
> {
  const auth = await requireSession();
  if ("error" in auth) return auth;
  const person = await getPersonById(auth.session.personId);
  if (!person) {
    return {
      error: NextResponse.json({ error: "Sign in required" }, { status: 401 }),
    };
  }
  return { session: auth.session, person };
}

export function isCoachOrTech(session: SessionPayload) {
  return (
    session.adminView &&
    (session.role === "coach_admin" || session.role === "tech_admin")
  );
}

/** Force members onto their own team; admins may pick any. */
export function resolveTeamOrDeny(
  person: Pick<Person, "team_id" | "role">,
  session: Pick<SessionPayload, "teamId" | "adminView" | "role">,
  requested: string | null | undefined,
): { teamId: string } | { error: NextResponse } {
  const { teamId, denied } = resolveVisibleTeamId({
    person,
    session,
    requested,
  });
  if (denied) {
    return {
      error: NextResponse.json(
        { error: "You can only use your own team's materials." },
        { status: 403 },
      ),
    };
  }
  if (!teamId) {
    return {
      error: NextResponse.json(
        { error: "Join a team before opening this." },
        { status: 400 },
      ),
    };
  }
  if (!canWriteTeamData(person, session, teamId) && denied) {
    return {
      error: NextResponse.json(
        { error: "You can only use your own team's materials." },
        { status: 403 },
      ),
    };
  }
  return { teamId };
}

/** Plain soft-fail for Cruxy and revision routes. Never leak secrets. */
export function revisionError(
  err: unknown,
  fallback = "Cruxy could not finish that. Try again.",
  status = 500,
): NextResponse {
  const raw = err instanceof Error ? err.message : "";
  const safe =
    raw &&
    !raw.includes("sb_") &&
    !raw.includes("SUPABASE") &&
    !raw.includes("password") &&
    !raw.includes("secret") &&
    raw.length < 180
      ? raw
      : fallback;
  return NextResponse.json({ error: safe }, { status });
}
