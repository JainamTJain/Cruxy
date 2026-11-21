import { CaseBrainClient } from "@/components/case-brain/case-brain-client";
import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";

type Props = {
  params: Promise<{ caseId: string }>;
  searchParams: Promise<{ team?: string }>;
};

export default async function CaseBrainDetailPage({
  params,
  searchParams,
}: Props) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const { caseId } = await params;
  const { team } = await searchParams;

  return (
    <CaseBrainClient
      caseId={caseId}
      initialTeamId={team || session.teamId || undefined}
    />
  );
}
