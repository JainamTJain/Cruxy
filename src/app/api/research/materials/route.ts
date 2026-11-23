import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPersonById, listCases } from "@/lib/db/repository";
import { canWrite } from "@/lib/admin/permissions";
import {
  listMaterialRequests,
  updateMaterialRequestStatus,
  type MaterialRequestStatus,
} from "@/lib/db/supabase/material-requests-extra";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  if (!session.adminView) {
    return NextResponse.json({ error: "Tech admin only" }, { status: 403 });
  }
  const person = await getPersonById(session.personId);
  if (!person || !canWrite(person.role, "material_requests")) {
    return NextResponse.json({ error: "Tech admin only" }, { status: 403 });
  }
  const [rows, cases] = await Promise.all([
    listMaterialRequests(),
    listCases(),
  ]);
  const byId = new Map(cases.map((c) => [c.id, c]));
  return NextResponse.json({
    materials: rows.map((r) => ({
      ...r,
      case_number: r.case_id ? byId.get(r.case_id)?.number ?? null : null,
      case_title: r.case_id ? byId.get(r.case_id)?.title ?? null : null,
    })),
  });
}

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  if (!session.adminView) {
    return NextResponse.json({ error: "Tech admin only" }, { status: 403 });
  }
  const person = await getPersonById(session.personId);
  if (!person || !canWrite(person.role, "material_requests")) {
    return NextResponse.json({ error: "Tech admin only" }, { status: 403 });
  }
  const body = (await req.json()) as {
    id?: string;
    status?: MaterialRequestStatus;
  };
  if (!body.id || !body.status) {
    return NextResponse.json({ error: "id and status required" }, { status: 400 });
  }
  const updated = await updateMaterialRequestStatus(body.id, body.status);
  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ material: updated });
}
