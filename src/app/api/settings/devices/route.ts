import { NextResponse } from "next/server";
import {
  listAuthDevices,
  revokeDevice,
  revokeOtherDevices,
} from "@/lib/auth/devices";
import { getSession } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const devices = await listAuthDevices(session.personId);
  return NextResponse.json({
    devices: devices.map((d) => ({
      id: d.id,
      label: d.label,
      lastSeenAt: d.last_seen_at,
      createdAt: d.created_at,
      current: d.id === session.deviceId,
    })),
    currentDeviceId: session.deviceId ?? null,
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as {
    action?: "revoke_others" | "revoke_one";
    deviceId?: string;
  };

  if (body.action === "revoke_others") {
    const count = await revokeOtherDevices({
      personId: session.personId,
      keepDeviceId: session.deviceId ?? null,
      actorId: session.personId,
    });
    return NextResponse.json({
      ok: true,
      count,
      message:
        count > 0
          ? `Signed out ${count} other device${count === 1 ? "" : "s"}.`
          : "No other devices were signed in.",
    });
  }

  if (body.action === "revoke_one" && body.deviceId) {
    if (body.deviceId === session.deviceId) {
      return NextResponse.json(
        { error: "Use Sign out to leave this device." },
        { status: 400 },
      );
    }
    const ok = await revokeDevice({
      personId: session.personId,
      deviceId: body.deviceId,
      actorId: session.personId,
    });
    if (!ok) {
      return NextResponse.json({ error: "Device not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, message: "Signed out that device." });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
