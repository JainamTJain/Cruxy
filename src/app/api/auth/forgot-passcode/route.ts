import { NextResponse } from "next/server";
import {
  completeForgotPasscode,
  getForgotPasscodeStatus,
  requestForgotPasscode,
} from "@/lib/auth/forgot-passcode";
import { hashIp } from "@/lib/crypto/passcodes";

export const runtime = "nodejs";

/** Status for the sign-in Forgot flow (no session required). */
export async function GET(req: Request) {
  const personId = new URL(req.url).searchParams.get("personId");
  if (!personId) {
    return NextResponse.json({ error: "Missing personId" }, { status: 400 });
  }
  const status = await getForgotPasscodeStatus(personId);
  return NextResponse.json(status);
}

/** Request a reset, or complete an approved reset with a new passcode. */
export async function POST(req: Request) {
  const body = (await req.json()) as {
    personId?: string;
    action?: "request" | "complete";
    code?: string;
    confirm?: string;
  };
  if (!body.personId) {
    return NextResponse.json({ error: "Missing personId" }, { status: 400 });
  }
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip");
  const ipHash = hashIp(ip);

  if (body.action === "complete") {
    if (!body.code || !body.confirm) {
      return NextResponse.json(
        { error: "Enter the new passcode twice." },
        { status: 400 },
      );
    }
    const result = await completeForgotPasscode({
      personId: body.personId,
      code: body.code,
      confirm: body.confirm,
      ipHash,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      message: "Passcode saved. Sign in with your new passcode.",
    });
  }

  const result = await requestForgotPasscode({
    personId: body.personId,
    ipHash,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 429 });
  }
  return NextResponse.json({
    ok: true,
    requestId: result.requestId,
    message:
      "Asked Dr. B and Jainam. When they approve, come back here to set a new passcode.",
  });
}
