import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getLibraryFile, listCases } from "@/lib/db/library-repository";
import { ReadingRoomClient } from "./reading-room-client";

type Props = {
  params: Promise<{ fileId: string }>;
  searchParams: Promise<{ fromCase?: string }>;
};

/**
 * Old reading-room URLs fold into the case. Full original stays available
 * when opened from a case (`?fromCase=`) or when the file has no case.
 */
export default async function LibraryFilePage({ params, searchParams }: Props) {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  const { fileId } = await params;
  const { fromCase } = await searchParams;

  const file = await getLibraryFile(fileId);
  if (!file) notFound();

  if (fromCase) {
    return <ReadingRoomClient fileId={fileId} fromCaseId={fromCase} />;
  }

  let caseId: string | undefined = file.case_ids[0];
  if (!caseId && file.case_numbers.length > 0) {
    const cases = await listCases();
    const match = cases.find(
      (c) => c.active && file.case_numbers.includes(c.number),
    );
    caseId = match?.id;
  }

  if (caseId) {
    redirect(`/case-brain/${caseId}?tab=readings&file=${fileId}`);
  }

  return <ReadingRoomClient fileId={fileId} />;
}
