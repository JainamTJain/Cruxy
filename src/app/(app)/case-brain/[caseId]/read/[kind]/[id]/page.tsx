import { redirect } from "next/navigation";
import { ReadingRoom } from "@/components/reading/reading-room";
import { getSession } from "@/lib/auth/session";

type Props = {
  params: Promise<{ caseId: string; kind: string; id: string }>;
};

/** Read any case reading inside Crux, with the team's highlights, comments and notes. */
export default async function ReadingRoomPage({ params }: Props) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const { caseId, kind, id } = await params;
  if (kind !== "web" && kind !== "import" && kind !== "case") redirect(`/case-brain/${caseId}?tab=reading`);
  return <ReadingRoom caseId={caseId} kind={kind} id={id} />;
}
