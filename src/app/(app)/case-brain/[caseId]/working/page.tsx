import { Suspense } from "react";
import { redirect } from "next/navigation";
import { LoadingGenie } from "@/components/cruxy/mood/loading-genie";
import { WorkingDocument } from "@/components/case/working-document";
import { getSession } from "@/lib/auth/session";
import { getPersonById } from "@/lib/db/repository";
import { PageIntro } from "@/components/page-intro";

type Props = {
  params: Promise<{ caseId: string }>;
  searchParams: Promise<{ team?: string }>;
};

/**
 * Standalone Working document page so shots and F can load the export
 * before the case page three-tab shell lands.
 */
export default async function WorkingDocumentPage({
  params,
  searchParams,
}: Props) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const { caseId } = await params;
  const { team } = await searchParams;
  const person = await getPersonById(session.personId);
  const teamId = team ?? session.teamId ?? person?.team_id;
  if (!teamId) {
    return (
      <main className="p-6">
        <p className="text-sm text-muted">Join a team to open a working document.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-6 pb-24 animate-fade-up">
      <PageIntro
        eyebrow="Case"
        title="Working document"
        titleClassName="font-display text-[36px] font-extrabold tracking-[-0.02em] text-ink sm:text-[44px]"
      >
        Import a Google Doc or build it here. Suggestions tick onto your to-do
        list; Crux never writes into your doc.
      </PageIntro>
      <Suspense fallback={<LoadingGenie label="Opening working document..." />}>
        <WorkingDocument caseId={caseId} teamId={teamId} />
      </Suspense>
    </main>
  );
}
