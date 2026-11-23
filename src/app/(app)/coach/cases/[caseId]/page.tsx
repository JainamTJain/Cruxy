import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { canSeeAllTeams } from "@/lib/auth/team-privacy";
import { getPersonById } from "@/lib/db/repository";
import { CoachCaseView } from "@/components/coach/coach-case-view";

type Props = { params: Promise<{ caseId: string }> };

/** Dr. B: one case across all three teams. */
export default async function CoachCasePage({ params }: Props) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const person = await getPersonById(session.personId);
  const { caseId } = await params;
  if (!person || !canSeeAllTeams(person, session)) redirect(`/case-brain/${caseId}`);
  return <CoachCaseView caseId={caseId} />;
}
