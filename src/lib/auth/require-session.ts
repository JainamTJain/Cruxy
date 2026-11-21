import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import type { SessionPayload } from "@/lib/types";

export async function requireSession(): Promise<
  { session: SessionPayload } | { error: NextResponse }
> {
  const session = await getSession();
  if (!session) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { session };
}

export function requireTechAdmin(
  session: SessionPayload,
): NextResponse | null {
  if (session.role !== "tech_admin" || !session.adminView) {
    return NextResponse.json({ error: "Tech admin only" }, { status: 403 });
  }
  return null;
}

export function requireAdmin(session: SessionPayload): NextResponse | null {
  if (
    (session.role !== "tech_admin" && session.role !== "coach_admin") ||
    !session.adminView
  ) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  return null;
}
