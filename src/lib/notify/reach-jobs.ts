import "server-only";
import { createNotification } from "@/lib/db/supabase/auth-extra";
import { isSampleDataMode } from "@/lib/db/config";
import { getServiceSupabase } from "@/lib/db/supabase/client";
import { readStore } from "@/lib/db/sample-store";
import { listPeopleFull } from "@/lib/db/repository";
import type { PracticeSession } from "@/lib/practice/types";
import { appToday } from "@/lib/time/app-day";

const REGIONAL_ISO = "2026-12-05";

/**
 * Notify members of sessions that start in about 15 minutes.
 * Session.date is YYYY-MM-DD; default start assumption is 18:00 local.
 */
export async function notifySessionsStartingSoon(
  now = new Date(),
): Promise<{ notified: number }> {
  const sessions = await listUpcomingSessions(now);
  let notified = 0;
  const people = await listPeopleFull();

  for (const session of sessions) {
    const start = sessionStart(session);
    if (!start) continue;
    const mins = (start.getTime() - now.getTime()) / 60_000;
    if (mins < 10 || mins > 20) continue;

    const recipients = people.filter((p) => {
      if (session.invite_team_ids?.length) {
        return p.team_id != null && session.invite_team_ids.includes(p.team_id);
      }
      return p.role === "member" || p.role === "coach_admin";
    });

    for (const person of recipients) {
      await createNotification({
        personId: person.id,
        kind: "session_soon",
        title: "Practice starts in about 15 minutes",
        body: session.title,
        href: `/practice/sessions/${session.id}`,
        payload: { session_id: session.id },
      });
      notified += 1;
    }
  }
  return { notified };
}

/**
 * Dec 5 reminders: day-before evening and morning-of.
 */
export async function notifyDec5Reminders(
  now = new Date(),
): Promise<{ notified: number }> {
  const regional = new Date(`${REGIONAL_ISO}T00:00:00`);
  const dayMs = 24 * 60 * 60 * 1000;
  const daysUntil = Math.round(
    (regional.getTime() - new Date(now.toDateString()).getTime()) / dayMs,
  );

  if (daysUntil !== 1 && daysUntil !== 0) return { notified: 0 };

  const hour = now.getHours();
  if (daysUntil === 1 && (hour < 17 || hour > 18)) return { notified: 0 };
  if (daysUntil === 0 && (hour < 7 || hour > 8)) return { notified: 0 };

  const people = await listPeopleFull();
  let notified = 0;
  const title =
    daysUntil === 1
      ? "UCSB regional is tomorrow"
      : "UCSB regional is today";
  const body =
    daysUntil === 1
      ? "Pack your one-pager, charge your phone, and rest. Crux will be here if you need a calm minute."
      : "Breathe. Trust the work you already did. Open Crux for the day's plan when you are ready.";

  for (const person of people) {
    if (person.role === "tech_admin" && !person.team_id) continue;
    await createNotification({
      personId: person.id,
      kind: "dec5_reminder",
      title,
      body,
      href: "/home",
      payload: { days_until: daysUntil },
    });
    notified += 1;
  }
  return { notified };
}

function sessionStart(session: PracticeSession): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(session.date)) return null;
  return new Date(`${session.date}T18:00:00`);
}

async function listUpcomingSessions(now: Date): Promise<PracticeSession[]> {
  const today = appToday(now);
  if (isSampleDataMode()) {
    const store = await readStore();
    const sessions =
      (store as { practice_sessions?: PracticeSession[] }).practice_sessions ??
      [];
    return sessions.filter(
      (s) => s.date === today && s.status !== "ended",
    );
  }
  // Practice sessions live in the `sessions` table in Postgres.
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("sessions")
    .select("*")
    .eq("date", today)
    .neq("status", "ended");
  if (error) throw new Error(`listUpcomingSessions: ${error.message}`);
  const { mapSession } = await import("@/lib/db/supabase/practice");
  return (data ?? []).map((r) => mapSession(r as Record<string, unknown>));
}
