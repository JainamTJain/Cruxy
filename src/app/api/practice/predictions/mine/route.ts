import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getRoundById } from "@/lib/db/practice-repository";
import {
  getPersonalCalibration,
  listMyBrierTrend,
} from "@/lib/practice/predictions";

/** Personal Brier + calibration only. Never returns other people's scores. */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const [rows, calibration] = await Promise.all([
    listMyBrierTrend(session.personId, 30),
    getPersonalCalibration(session.personId),
  ]);
  const enriched = [];
  for (const r of rows) {
    const round = await getRoundById(r.round_id);
    enriched.push({
      ...r,
      case_number: round?.case_number ?? null,
      round_ended_at: round?.ended_at ?? null,
    });
  }

  const values = enriched.map((r) => r.brier);
  const latest = values[0] ?? null;
  const previous = values[1] ?? null;
  let vsOwnPast: "better" | "same" | "worse" | "first" | null = null;
  if (latest == null) vsOwnPast = null;
  else if (previous == null) vsOwnPast = "first";
  else if (latest < previous - 0.02) vsOwnPast = "better";
  else if (latest > previous + 0.02) vsOwnPast = "worse";
  else vsOwnPast = "same";

  return NextResponse.json({
    points: enriched,
    latest,
    vsOwnPast,
    calibration,
  });
}
