import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  DEFAULT_ACCESS_PREFS,
  normalizeAccessPrefs,
  type AccessPrefs,
} from "@/lib/access/types";
import { getPersonPrefs, savePersonPrefs } from "@/lib/team/repository";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const prefs = await getPersonPrefs(session.personId);
  return NextResponse.json({
    prefs: normalizeAccessPrefs({
      text_size: prefs.text_size,
      high_contrast: prefs.high_contrast,
      readable_font: prefs.readable_font,
      reduce_motion: prefs.reduce_motion,
    }),
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as Partial<AccessPrefs>;
  const access = normalizeAccessPrefs({ ...DEFAULT_ACCESS_PREFS, ...body });
  const prefs = await savePersonPrefs({
    person_id: session.personId,
    text_size: access.text_size,
    high_contrast: access.high_contrast,
    readable_font: access.readable_font,
    reduce_motion: access.reduce_motion,
  });
  return NextResponse.json({
    prefs: normalizeAccessPrefs({
      text_size: prefs.text_size,
      high_contrast: prefs.high_contrast,
      readable_font: prefs.readable_font,
      reduce_motion: prefs.reduce_motion,
    }),
  });
}
