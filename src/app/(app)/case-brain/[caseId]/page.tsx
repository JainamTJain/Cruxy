import { Suspense } from "react";
import { CaseBrainClient } from "@/components/case-brain/case-brain-client";
import { Skeleton, SkeletonBlock } from "@/components/motion/skeleton";
import { requireMemberSession } from "@/lib/case-brain/auth";
import { loadCaseBrainPage } from "@/lib/case-brain/load-page";
import { getCaseHome } from "@/lib/case-home/service";
import { listCases } from "@/lib/db/repository";
import { canSeeAllTeams } from "@/lib/auth/team-privacy";
import { redirect } from "next/navigation";

type Props = {
  params: Promise<{ caseId: string }>;
  searchParams: Promise<{ team?: string }>;
};

export default async function CaseBrainDetailPage({
  params,
  searchParams,
}: Props) {
  const auth = await requireMemberSession();
  if (!auth.ok) redirect("/sign-in");
  const { caseId } = await params;
  const { team } = await searchParams;

  const page = await loadCaseBrainPage({
    caseId,
    requestedTeamId: team || auth.teamId,
    auth,
  });
  if (!page.ok) {
    return (
      <p className="text-sm text-cardinal">
        {page.error || "Could not open this case."}
      </p>
    );
  }

  const teamId = page.data.brain.team_id;
  let caseRow = page.data.case;
  if (!caseRow) {
    const cases = await listCases();
    caseRow = cases.find((c) => c.id === caseId) ?? null;
  }
  const caseHome =
    caseRow != null
      ? await getCaseHome({
          caseId,
          teamId,
          caseRow,
          viewerTeamId: teamId,
          seeAllTeams: canSeeAllTeams(auth.person, auth.session),
          hideTechUploads: auth.person.role === "coach_admin",
        })
      : null;

  return (
    <Suspense
      fallback={
        <div
          className="flex min-h-[320px] flex-col gap-5"
          aria-busy
          aria-label="Opening case"
        >
          <div className="flex items-end gap-5">
            <Skeleton className="h-[96px] w-[96px]" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-10 w-72 max-w-full" />
              <SkeletonBlock lines={2} className="max-w-md" />
            </div>
          </div>
          <Skeleton className="h-64 w-full" rounded="lg" />
        </div>
      }
    >
      <CaseBrainClient
        caseId={caseId}
        initialTeamId={teamId}
        initialData={page.data}
        initialCaseHome={caseHome}
      />
    </Suspense>
  );
}
