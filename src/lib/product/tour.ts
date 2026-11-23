import "server-only";

import { isSampleDataMode } from "@/lib/db/config";
import { listActivityLog } from "@/lib/db/repository";
import { getServiceSupabase } from "@/lib/db/supabase/client";

const TOUR_ACTIONS = ["tour_finished", "tour_skipped"];

/** True once the person has finished or skipped the guided tour. */
export async function hasSeenTour(personId: string): Promise<boolean> {
  if (isSampleDataMode()) {
    const log = await listActivityLog(2000);
    return log.some((e) => e.person_id === personId && TOUR_ACTIONS.includes(e.action));
  }
  const { data, error } = await getServiceSupabase()
    .from("activity_log")
    .select("id")
    .eq("person_id", personId)
    .in("action", TOUR_ACTIONS)
    .limit(1);
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}
