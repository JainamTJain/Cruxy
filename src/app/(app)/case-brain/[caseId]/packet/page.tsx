import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import {
  canSeeAllTeams,
  resolveVisibleTeamId,
} from "@/lib/auth/team-privacy";
import { getSession } from "@/lib/auth/session";
import { getPersonById, listCases, listTeams } from "@/lib/db/repository";
import { getCaseBrain } from "@/lib/case-brain/service";
import { getCaseHome } from "@/lib/case-home/service";
import { isSampleDataMode } from "@/lib/db/config";
import { getServiceSupabase } from "@/lib/db/supabase/client";
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
  const person = await getPersonById(session.personId);
  if (!person) redirect("/sign-in");

  const { caseId } = await params;
  const { team } = await searchParams;
  const resolved = resolveVisibleTeamId({
    person,
    session,
    requested: team || session.teamId,
  });
  const teamId = resolved.teamId;
  if (!teamId) redirect("/case-brain");

  const cases = await listCases();
  const caseRow = cases.find((c) => c.id === caseId);
  if (!caseRow) redirect("/case-brain");

  const seeAll = canSeeAllTeams(person, session);
  const [home, brain, questions, brief, teams] = await Promise.all([
    getCaseHome({
      caseId,
      teamId,
      caseRow,
      viewerTeamId: teamId,
      seeAllTeams: seeAll,
    }),
    getCaseBrain(teamId, caseId),
    listQuestions({ caseId }),
    fetchBrief(teamId, caseId),
    listTeams(),
  ]);

  const teamName = teams.find((t) => t.id === teamId)?.name ?? "Team";

  const keyPoints = [
    ...brain.claims.map((n) => n.claim.text),
    ...brain.claims.flatMap((n) =>
      n.supports.slice(0, 2).map((s) => s.support.text),
    ),
  ]
    .filter(Boolean)
    .slice(0, 8);

  const sources = brain.truth_items
    .filter((t) => t.status === "accepted")
    .slice(0, 10)
    .map((t) => t.text);

  const likely = questions
    .filter((q) => q.status === "active")
    .slice(0, 8)
    .map((q) => q.text);

  const stance =
    brief?.thesis?.trim() ||
    brain.claims.map((n) => n.claim.text).join("; ") ||
    caseRow.crux ||
    "Stance not set yet.";

  const paragraphs =
    home.paragraphs.length > 0
      ? home.paragraphs
      : [
          {
            id: "fallback",
            text: [caseRow.crux, caseRow.trap, caseRow.closing_question]
              .filter(Boolean)
              .join(" "),
          },
        ];

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
          Case packet, {teamName}, USC Ethics Bowl
        </p>
        <h1 className="font-display mt-2 text-3xl font-extrabold tracking-[-0.02em]">
          Case {caseRow.number}: {caseRow.title}
        </h1>

        <section className="mt-8">
          <h2 className="font-display m-0 text-xl font-extrabold">The case</h2>
          <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-[#1C1F26]">
            {paragraphs.map((p) => (
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
            {keyPoints.length === 0 ? (
              <li>No claims drafted yet.</li>
            ) : (
              keyPoints.map((k) => <li key={k.slice(0, 40)}>{k}</li>)
            )}
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

async function fetchBrief(teamId: string, caseId: string) {
  try {
    if (isSampleDataMode()) {
      const { readStore } = await import("@/lib/db/sample-store");
      const store = await readStore();
      const briefs = (
        store as {
          team_briefs?: Array<{
            id: string;
            team_id: string;
            case_id: string;
            thesis: string | null;
          }>;
        }
      ).team_briefs;
      return (
        briefs?.find((b) => b.team_id === teamId && b.case_id === caseId) ?? null
      );
    }
    const { data, error } = await getServiceSupabase()
      .from("team_briefs")
      .select("id,team_id,case_id,thesis")
      .eq("team_id", teamId)
      .eq("case_id", caseId)
      .maybeSingle();
    if (error) return null;
    return data;
  } catch {
    return null;
  }
}
