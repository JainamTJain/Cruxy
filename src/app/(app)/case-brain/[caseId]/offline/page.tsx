import Link from "next/link";
import { redirect } from "next/navigation";
import { OfflineCaseView } from "@/components/offline/offline-case-view";
import { getSession } from "@/lib/auth/session";

type Props = {
  params: Promise<{ caseId: string }>;
};

/** Read a case pack saved on this phone (no network required after first save). */
export default async function OfflineCasePage({ params }: Props) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const { caseId } = await params;

  return (
    <main className="mx-auto max-w-3xl">
      <div className="mb-4 print:hidden">
        <Link
          href={`/case-brain/${caseId}`}
          className="text-sm font-semibold text-muted hover:text-ink"
        >
          ← Back to the case
        </Link>
      </div>
      <OfflineCaseView caseId={caseId} />
    </main>
  );
}
