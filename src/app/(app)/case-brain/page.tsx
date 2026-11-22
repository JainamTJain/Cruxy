import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { listCasesForBrain } from "@/lib/case-brain/service";
import { listTeams } from "@/lib/db/repository";
import { redirect } from "next/navigation";

export default async function CaseBrainIndexPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  const [cases, teams] = await Promise.all([listCasesForBrain(), listTeams()]);
  const myTeam = teams.find((t) => t.id === session.teamId);

  return (
    <main className="animate-fade-up space-y-6">
      <div>
        <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-muted">
          Cases
          <span className="ml-2 font-semibold normal-case tracking-normal text-[#3B404A]">
            {myTeam?.name ?? "your team"}
          </span>
        </p>
        <h1 className="font-display text-[44px] font-extrabold tracking-[-0.02em] text-ink">
          Case brain
        </h1>
        <p className="mt-1 text-sm text-[#3B404A]">
          Team Brief, claim maps, Evidence Library, Inspired-by queues and one
          pagers for every active case.
        </p>
        <p className="mt-2 text-sm">
          <Link
            href="/team/roles"
            className="font-semibold text-cardinal underline"
          >
            Set roles for every case
          </Link>
        </p>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2">
        {cases.map((c) => (
          <li key={c.id}>
            <Link
              href={`/case-brain/${c.id}`}
              className="flex items-end gap-4 rounded-[20px] bg-white p-5 transition hover:ring-2 hover:ring-cardinal/30"
            >
              <span className="font-display text-5xl font-extrabold leading-none text-cardinal">
                {String(c.number).padStart(2, "0")}
              </span>
              <span className="pb-1 font-display text-xl font-extrabold text-ink">
                {c.title}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
