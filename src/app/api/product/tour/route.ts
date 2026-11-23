import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { logActivity } from "@/lib/db/repository";
import { hasSeenTour } from "@/lib/product/tour";

export const runtime = "nodejs";

/** Has this person finished or skipped the first sign-in tour? */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const seen = await hasSeenTour(session.personId).catch(() => true);
  return NextResponse.json({ seen });
}

/** Record that the tour was finished or skipped, so it shows once per person. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as {
    outcome?: string;
    step?: number;
    of?: number;
  };
  const outcome = body.outcome === "finished" ? "finished" : "skipped";
  await logActivity({
    person_id: session.personId,
    action: outcome === "finished" ? "tour_finished" : "tour_skipped",
    target: "guided_tour",
    meta: {
      step: Number.isFinite(body.step) ? body.step : null,
      of: Number.isFinite(body.of) ? body.of : null,
    },
  });
  return NextResponse.json({ ok: true });
}
