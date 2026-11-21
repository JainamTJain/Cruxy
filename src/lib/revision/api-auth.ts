import { getSession } from "@/lib/auth/session";
import type { SessionPayload } from "@/lib/types";
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

export function isCoachOrTech(session: SessionPayload) {
  return (
    session.adminView &&
    (session.role === "coach_admin" || session.role === "tech_admin")
  );
}
