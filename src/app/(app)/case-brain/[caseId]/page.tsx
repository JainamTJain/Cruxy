import { Suspense } from "react";
import { CaseBrainClient } from "@/components/case-brain/case-brain-client";
import { Skeleton, SkeletonBlock } from "@/components/motion/skeleton";
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
        initialTeamId={team || session.teamId || undefined}
      />
    </Suspense>
  );
}
