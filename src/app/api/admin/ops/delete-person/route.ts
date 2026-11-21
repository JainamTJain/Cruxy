import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPersonById, logActivity } from "@/lib/db/repository";
import {
  loadPrivacyOps,
  waitingPayload,
} from "@/lib/db/supabase/admin-ops-bridge";

export const runtime = "nodejs";

/** Tech admin: delete one person's transcript lines, voice sample and comments. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.adminView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const actor = await getPersonById(session.personId);
  if (!actor || actor.role !== "tech_admin") {
    return NextResponse.json({ error: "Tech admin only" }, { status: 403 });
  }

  const body = (await req.json()) as { personId?: string };
  if (!body.personId) {
    return NextResponse.json({ error: "Missing personId" }, { status: 400 });
  }
  if (body.personId === actor.id) {
    return NextResponse.json(
      { error: "Refuse to wipe your own records from this panel." },
      { status: 400 },
    );
  }

  const ops = await loadPrivacyOps();
  if (!ops) {
    return NextResponse.json(
      waitingPayload("I", "deletePersonPrivateData"),
      { status: 501 },
    );
  }

  const result = await ops.deletePersonPrivateData(body.personId, actor.id);
  await logActivity({
    person_id: actor.id,
    action: "person_private_data_deleted",
    target: body.personId,
    meta: result.deleted as unknown as Record<string, unknown>,
  });
  return NextResponse.json(result);
}
