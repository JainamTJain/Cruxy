import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPersonById } from "@/lib/db/repository";
import {
  loadBackupOps,
  waitingPayload,
  type BackupStatus,
} from "@/lib/db/supabase/admin-ops-bridge";

export const runtime = "nodejs";

/** Tech admin: weekly logical backup status. */
export async function GET() {
  const session = await getSession();
  if (!session?.adminView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const actor = await getPersonById(session.personId);
  if (!actor || actor.role !== "tech_admin") {
    return NextResponse.json({ error: "Tech admin only" }, { status: 403 });
  }

  const ops = await loadBackupOps();
  if (!ops) {
    const waiting = waitingPayload("I", "getBackupStatus");
    const status: BackupStatus = {
      available: false,
      lastBackupAt: null,
      lastBackupBytes: null,
      lastBackupPath: null,
      note: waiting.message,
    };
    return NextResponse.json({ ...waiting, status });
  }

  const status = await ops.getBackupStatus();
  return NextResponse.json({ available: true, status });
}
