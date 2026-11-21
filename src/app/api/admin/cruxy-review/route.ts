import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPersonById, logActivity } from "@/lib/db/repository";
import {
  loadReviewOps,
  waitingPayload,
} from "@/lib/db/supabase/admin-ops-bridge";

export const runtime = "nodejs";

/** Tech admin: weekly Cruxy review drafts (Workstream H). */
export async function GET() {
  const session = await getSession();
  if (!session?.adminView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const actor = await getPersonById(session.personId);
  if (!actor || actor.role !== "tech_admin") {
    return NextResponse.json({ error: "Tech admin only" }, { status: 403 });
  }

  const ops = await loadReviewOps();
  if (!ops) {
    return NextResponse.json({
      ...waitingPayload("H", "listPendingReviews"),
      drafts: [],
    });
  }
  const drafts = await ops.listPendingReviews();
  return NextResponse.json({ available: true, drafts });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.adminView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const actor = await getPersonById(session.personId);
  if (!actor || actor.role !== "tech_admin") {
    return NextResponse.json({ error: "Tech admin only" }, { status: 403 });
  }

  const body = (await req.json()) as {
    draftId?: string;
    action?: "approve" | "reject";
    reason?: string;
  };
  if (!body.draftId || (body.action !== "approve" && body.action !== "reject")) {
    return NextResponse.json(
      { error: "Need draftId and action approve|reject" },
      { status: 400 },
    );
  }

  const ops = await loadReviewOps();
  if (!ops) {
    return NextResponse.json(
      waitingPayload("H", "approveReview"),
      { status: 501 },
    );
  }

  if (body.action === "approve") {
    await ops.approveReview(body.draftId, actor.id);
    await logActivity({
      person_id: actor.id,
      action: "cruxy_review_approved",
      target: body.draftId,
    });
  } else {
    await ops.rejectReview(body.draftId, actor.id, body.reason);
    await logActivity({
      person_id: actor.id,
      action: "cruxy_review_rejected",
      target: body.draftId,
      meta: body.reason ? { reason: body.reason } : null,
    });
  }
  return NextResponse.json({ ok: true });
}
