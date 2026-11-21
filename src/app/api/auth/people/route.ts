import { NextResponse } from "next/server";
import {
  getProgramTotals,
  listCompetitions,
  listPeoplePublic,
} from "@/lib/db/repository";

export const runtime = "nodejs";

export async function GET() {
  const [data, totals, competitions] = await Promise.all([
    listPeoplePublic(),
    getProgramTotals(),
    listCompetitions(),
  ]);
  const nextCompetition = competitions[0] ?? null;
  const days =
    nextCompetition == null
      ? null
      : Math.max(
          0,
          Math.ceil(
            (new Date(nextCompetition.date).getTime() - Date.now()) /
              (1000 * 60 * 60 * 24),
          ),
        );
  return NextResponse.json({
    ...data,
    totals,
    competition: nextCompetition,
    daysToCompetition: days,
  });
}
