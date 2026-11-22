import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getCaseBrain } from "@/lib/case-brain/service";
import { getCaseHome } from "@/lib/case-home/service";
import { listCases } from "@/lib/db/repository";
import { listQuestions } from "@/lib/revision/repository";
import { PrintPacketClient } from "@/components/case/print-packet-client";

type Props = {
  params: Promise<{ caseId: string }>;
  searchParams: Promise<{ team?: string; print?: string }>;
};

/**
 * Clean printable case packet: case, stance, key points, likely questions, sources.
 */
export default async function CasePacketPage({ params, searchParams }: Props) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const { caseId } = await params;
  const { team } = await searchParams;
  const teamId = team || session.teamId;
  if (!teamId) redirect("/case-brain");

  const cases = await listCases();
  const caseRow = cases.find((c) => c.id === caseId);
  if (!caseRow) redirect("/case-brain");

  const [home, brain, questions] = await Promise.all([
    getCaseHome({ caseId, teamId, caseRow }),
    getCaseBrain(teamId, caseId),
    listQuestions({ caseId }),
  ]);

  const keyPoints = [
    ...brain.claims.map((n) => n.claim.text),
    ...home.paragraphs.slice(0, 6).map((p) => p.text),
  ].slice(0, 8);

  const sources = brain.truth_items
    .filter((t) => t.status === "accepted")
    .slice(0, 10)
    .map((t) => t.text);

  const likely = questions
    .filter((q) => q.status === "active")
    .slice(0, 8)
    .map((q) => q.text);

  const stance =
    brain.claims.map((n) => n.claim.text).join(", ") ||
    caseRow.crux ||
    "Stance not set yet.";

  return (
    <main className="mx-auto max-w-3xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link
          href={`/case-brain/${caseId}`}
          className="text-sm font-semibold text-muted hover:text-ink"
        >
          ← Back to the case
        </Link>
        <Suspense fallback={null}>
          <PrintPacketClient />
        </Suspense>
      </div>

      <article className="rounded-[20px] bg-white p-6 sm:p-10 print:rounded-none print:p-0">
        <p className="m-0 text-xs font-bold uppercase tracking-[0.12em] text-muted">
          Case packet, USC Ethics Bowl
        </p>
        <h1 className="font-display mt-2 text-3xl font-extrabold tracking-[-0.02em]">
          Case {caseRow.number}: {caseRow.title}
        </h1>

        <section className="mt-8">
          <h2 className="font-display m-0 text-xl font-extrabold">The case</h2>
          <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-[#1C1F26]">
            {home.paragraphs.slice(0, 10).map((p) => (
              <p key={p.id} className="m-0">
                {p.text}
              </p>
            ))}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="font-display m-0 text-xl font-extrabold">Stance</h2>
          <p className="mt-3 text-[15px] leading-relaxed">{stance}</p>
        </section>

        <section className="mt-8">
          <h2 className="font-display m-0 text-xl font-extrabold">
            Key points
          </h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-[15px]">
            {keyPoints.map((k) => (
              <li key={k.slice(0, 40)}>{k}</li>
            ))}
          </ol>
        </section>

        <section className="mt-8">
          <h2 className="font-display m-0 text-xl font-extrabold">
            Likely questions
          </h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-[15px]">
            {likely.length === 0 ? (
              <li>No questions in the bank yet.</li>
            ) : (
              likely.map((q) => <li key={q.slice(0, 40)}>{q}</li>)
            )}
          </ul>
        </section>

        <section className="mt-8">
          <h2 className="font-display m-0 text-xl font-extrabold">Sources</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-[15px]">
            {sources.length === 0 ? (
              <li>No Evidence Library entries accepted yet.</li>
            ) : (
              sources.map((s) => <li key={s.slice(0, 40)}>{s}</li>)
            )}
          </ul>
        </section>
      </article>
    </main>
  );
}
