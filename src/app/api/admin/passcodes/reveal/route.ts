import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  getAdminCode,
  getPersonById,
  getPersonalCode,
  getTechReauth,
  logActivity,
  setTechReauth,
  upsertAuthCode,
} from "@/lib/db/repository";
import { decryptPasscodeCopy, verifyPasscode } from "@/lib/crypto/passcodes";
import { REAUTH_WINDOW_MS, REVEAL_SECONDS } from "@/lib/constants";
import { nowIso } from "@/lib/utils";

export const runtime = "nodejs";

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
    personId?: string;
    adminPasscode?: string;
  };
  if (!body.personId) {
    return NextResponse.json({ error: "Missing personId" }, { status: 400 });
  }
  if (body.personId === actor.id) {
    return NextResponse.json(
      { error: "Your own passcode is never listed or revealed." },
      { status: 400 },
    );
  }

  const last = await getTechReauth();
  const needsReauth =
    !last || Date.now() - new Date(last).getTime() > REAUTH_WINDOW_MS;

  if (needsReauth) {
    if (!body.adminPasscode) {
      return NextResponse.json(
        { error: "Re-enter your passcode to reveal.", needsReauth: true },
        { status: 401 },
      );
    }
    const personal = await getPersonalCode(actor.id);
    const admin = await getAdminCode(actor.id);
    const hash = personal?.hash ?? admin?.hash;
    if (!hash || !(await verifyPasscode(hash, body.adminPasscode))) {
      return NextResponse.json({ error: "Wrong passcode." }, { status: 401 });
    }
    await setTechReauth(nowIso());
  }

  const code = await getPersonalCode(body.personId);
  if (!code?.encrypted_copy) {
    return NextResponse.json(
      { error: "No viewable passcode for this person." },
      { status: 404 },
    );
  }

  const plaintext = decryptPasscodeCopy(code.encrypted_copy);
  code.last_revealed_at = nowIso();
  await upsertAuthCode(code);
  await logActivity({
    person_id: actor.id,
    action: "passcode_reveal",
    target: body.personId,
  });

  return NextResponse.json({
    passcode: plaintext,
    revealSeconds: REVEAL_SECONDS,
  });
}
