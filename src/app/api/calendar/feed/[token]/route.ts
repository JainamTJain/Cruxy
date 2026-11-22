import { NextResponse } from "next/server";
import { getPersonById } from "@/lib/db/repository";
import { buildIcsCalendar } from "@/lib/team/calendar-ics";
import {
  listTeamCalendar,
  personIdForCalendarToken,
} from "@/lib/team/calendar-repository";

export const runtime = "nodejs";

/** Public .ics feed. Auth is the private token in the URL (no session). */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const raw = (await ctx.params).token ?? "";
  const token = raw.replace(/\.ics$/i, "");
  if (!token || token.length < 16) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const personId = await personIdForCalendarToken(token);
  if (!personId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const person = await getPersonById(personId);
  if (!person?.team_id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const events = await listTeamCalendar(person.team_id);
  const ics = buildIcsCalendar({
    calendarName: `Crux, ${person.name}`,
    events,
  });

  return new NextResponse(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="crux-${person.team_id.slice(0, 8)}.ics"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
