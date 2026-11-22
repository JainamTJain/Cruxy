import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { updateSession } from "@/lib/auth/session";
import { getPersonById } from "@/lib/db/repository";
import {
  getLearningProfile,
  upsertLearningProfile,
} from "@/lib/learning/profile";
import {
  defaultAppeBaselines,
  defaultSliders,
  type AppeBaselines,
  type LearningSliders,
} from "@/lib/learning/types";
import { isAdminViewer } from "@/lib/ops/privacy-scope";

export const runtime = "nodejs";

/** Personal learning profile. Self only (or admin viewer for coaching). */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const subjectId = url.searchParams.get("personId") ?? session.personId;
  const me = await getPersonById(session.personId);
  if (!me) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (subjectId !== session.personId && !isAdminViewer(me, session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const profile = await getLearningProfile(subjectId);
  if (!profile) {
    return NextResponse.json({
      profile: null,
      defaults: {
        sliders: defaultSliders(),
        appeBaselines: defaultAppeBaselines(),
      },
    });
  }
  return NextResponse.json({ profile });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Only the person can write their own profile (admins coach via viewing).
  const body = (await req.json()) as {
    sliders?: Partial<LearningSliders>;
    appeBaselines?: AppeBaselines;
  };
  if (!body.sliders || !body.appeBaselines) {
    return NextResponse.json(
      { error: "Sliders and APPE baselines are required." },
      { status: 400 },
    );
  }

  const profile = await upsertLearningProfile({
    personId: session.personId,
    sliders: body.sliders,
    appeBaselines: body.appeBaselines,
  });
  await updateSession({ mustSetLearningProfile: false });
  return NextResponse.json({ ok: true, profile });
}
