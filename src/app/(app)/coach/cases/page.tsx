import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { canSeeAllTeams } from "@/lib/auth/team-privacy";
import { getPersonById } from "@/lib/db/repository";
import { listCasesForBrain } from "@/lib/case-brain/service";
import { PageIntro } from "@/components/page-intro";

/** Dr. B: every case, opened across all three teams. */
export default async function CoachCasesPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const person = await getPersonById(session.personId);
  if (!person || !canSeeAllTeams(person, session)) redirect("/case-brain");
  const cases = await listCasesForBrain();
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <PageIntro title="Cases across teams">
        Open a case to see where each team stands, side by side. Comment on a team&apos;s document, add moderator
        questions for everyone, or send a reading to all teams at once.
      </PageIntro>
      <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
        {cases.map((c) => (
          <li key={c.id}>
            <Link
              href={`/coach/cases/${c.id}`}
              className="flex items-end gap-4 rounded-[20px] bg-white p-5 transition hover:ring-2 hover:ring-cardinal/30"
            >
              <span className="font-display text-4xl font-extrabold leading-none text-cardinal">
                {String(c.number).padStart(2, "0")}
              </span>
              <span className="pb-0.5 font-display text-lg font-extrabold text-ink">{c.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
