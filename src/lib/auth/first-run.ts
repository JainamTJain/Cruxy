import "server-only";
import {
  getPersonById,
  listPeoplePublic,
  savePerson,
  logActivity,
} from "@/lib/db/repository";
import {
  createNotification,
  getTeamChampion,
  markFirstRunComplete,
} from "@/lib/db/supabase/auth-extra";

export const FIRST_RUN_ITEMS = [
  {
    key: "confirm_cases",
    label: "Confirm your cases and roles",
    href: "/team",
  },
  {
    key: "open_reading",
    label: "Open one reading",
    href: "/library",
  },
  {
    key: "review_flashcards",
    label: "Review 5 flashcards",
    href: "/revision/flashcards",
  },
  {
    key: "answer_aloud",
    label: "Answer one question out loud",
    href: "/revision/socratic",
  },
  {
    key: "see_roadmap",
    label: "See your roadmap",
    href: "/revision/roadmap",
  },
] as const;

export type FirstRunKey = (typeof FIRST_RUN_ITEMS)[number]["key"];

export function isFirstRunComplete(
  checklist: Record<string, boolean> | null | undefined,
): boolean {
  if (!checklist) return false;
  return FIRST_RUN_ITEMS.every((item) => checklist[item.key]);
}

export async function getFirstRunChecklist(personId: string) {
  const person = await getPersonById(personId);
  const checklist = person?.first_run_checklist ?? {};
  return {
    items: FIRST_RUN_ITEMS.map((item) => ({
      ...item,
      done: Boolean(checklist[item.key]),
    })),
    complete: isFirstRunComplete(checklist),
    completedAt: person?.first_run_completed_at ?? null,
  };
}

export async function markChecklistItem(
  personId: string,
  key: FirstRunKey,
  done = true,
): Promise<void> {
  const person = await getPersonById(personId);
  if (!person) throw new Error("Person not found");
  person.first_run_checklist = {
    ...person.first_run_checklist,
    [key]: done,
  };
  await savePerson(person);
  if (isFirstRunComplete(person.first_run_checklist)) {
    await markFirstRunComplete(personId);
  }
  await logActivity({
    person_id: personId,
    action: "first_run_item",
    target: key,
    meta: { done },
  });
}

/** Champions get a nudge when a teammate still has open checklist items. */
export async function nudgeChampionForIncomplete(
  teamId: string,
  incompletePersonId: string,
): Promise<void> {
  const championId = await getTeamChampion(teamId);
  if (!championId || championId === incompletePersonId) return;
  const person = await getPersonById(incompletePersonId);
  if (!person) return;
  if (isFirstRunComplete(person.first_run_checklist)) return;

  await createNotification({
    personId: championId,
    kind: "champion_nudge",
    title: `${person.name} still has first-run steps open`,
    body: "Check in so they finish the 10 minute checklist.",
    href: "/checklist",
    payload: { teammate_id: incompletePersonId },
  });
}

export async function listIncompleteChecklistsForTeam(teamId: string) {
  const { people } = await listPeoplePublic();
  const out: { id: string; name: string; open: string[] }[] = [];
  for (const p of people.filter((x) => x.team_id === teamId)) {
    const full = await getPersonById(p.id);
    const checklist = full?.first_run_checklist ?? {};
    const open = FIRST_RUN_ITEMS.filter((i) => !checklist[i.key]).map(
      (i) => i.key,
    );
    if (open.length) out.push({ id: p.id, name: p.name, open });
  }
  return out;
}
