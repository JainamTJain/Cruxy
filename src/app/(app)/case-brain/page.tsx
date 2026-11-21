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
        <h1 className="font-display text-3xl font-semibold text-ink">
          Case brain
        </h1>
        <p className="mt-1 text-sm text-muted">
          Per-team claim maps, Truth Sources, Inspired-by queues and consistency
          checks
          {myTeam ? ` · viewing as ${myTeam.name}` : ""}.
        </p>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2">
        {cases.map((c) => (
          <li key={c.id}>
            <Link
              href={`/case-brain/${c.id}`}
              className="block rounded-2xl border border-ink/10 bg-white/70 p-4 transition hover:border-cardinal/40"
            >
              <p className="font-mono text-xs text-muted">
                Case {String(c.number).padStart(2, "0")}
              </p>
              <p className="font-display text-lg font-semibold text-ink">
                {c.title}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
