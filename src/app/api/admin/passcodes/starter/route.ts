import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPersonById } from "@/lib/db/repository";
import { hashPasscode } from "@/lib/crypto/passcodes";
import {
  adminStarterStatus,
  rotateMemberStarterHash,
  updateCoachStarterHash,
} from "@/lib/db/supabase/admin-extra";

export const runtime = "nodejs";

/** Rotate member or coach starter. Never returns a hash or the plaintext after set. */
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
    which?: "member" | "coach";
    code?: string;
  };
  if (body.which !== "member" && body.which !== "coach") {
    return NextResponse.json({ error: "which must be member or coach" }, { status: 400 });
  }
  const code = (body.code ?? "").trim();
  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json(
      { error: "Starter code must be exactly 6 digits." },
      { status: 400 },
    );
  }

  const hash = await hashPasscode(code);
  if (body.which === "member") {
    await rotateMemberStarterHash(hash, actor.id);
  } else {
    await updateCoachStarterHash(hash, actor.id);
  }

  const status = await adminStarterStatus();
  return NextResponse.json({
    ok: true,
    which: body.which,
    status,
    // Plaintext shown once so Jainam can share in person; never a hash.
    oneTimePlain: code,
  });
}

export async function GET() {
  const session = await getSession();
  if (!session?.adminView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const actor = await getPersonById(session.personId);
  if (!actor || actor.role !== "tech_admin") {
    return NextResponse.json({ error: "Tech admin only" }, { status: 403 });
  }
  const status = await adminStarterStatus();
  return NextResponse.json({ status });
}
