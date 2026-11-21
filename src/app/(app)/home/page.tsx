import Link from "next/link";
import { CASE_TITLES } from "@/lib/constants";
import { getSession } from "@/lib/auth/session";
import { listCasesForBrain } from "@/lib/case-brain/service";
import { listTeams } from "@/lib/db/repository";

export default async function HomePage() {
  const session = await getSession();
  const [teams, cases] = await Promise.all([listTeams(), listCasesForBrain()]);
  const active = CASE_TITLES.filter((c) => c.active);
  const caseByNumber = new Map(cases.map((c) => [c.number, c]));
  const days = Math.ceil(
    (new Date("2026-12-05").getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );

  return (
    <main className="animate-fade-up space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold text-ink">
            Where the program stands
          </h1>
          <p className="mt-1 text-sm text-muted">
            Track 2 case brains live · sample program map
          </p>
        </div>
        <p className="rounded-xl bg-gold/20 px-3 py-2 font-mono text-sm text-ink">
          {Math.max(0, days)} days to UCSB Regional, Dec 5
        </p>
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["—", "Drive files"],
          ["—", "ideas accepted"],
          ["—", "sources verified"],
          ["—", "bank questions"],
          ["—", "rounds graded"],
          ["—", "redos improved"],
        ].map(([n, label]) => (
          <div
            key={label}
            className="rounded-2xl border border-ink/10 bg-white/60 px-3 py-4"
          >
            <p className="font-display text-2xl font-semibold">{n}</p>
            <p className="text-xs text-muted">{label}</p>
          </div>
        ))}
      </section>

      <section>
        <h2 className="font-display text-xl font-semibold">Case board</h2>
        <p className="mt-1 text-sm text-muted">
          Readiness fills in as Tracks 1–5 land. Teams:{" "}
          {teams.map((t) => t.name).join(", ")}.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-xs uppercase tracking-wide text-muted">
                <th className="py-2 pr-3">Case</th>
                {teams.map((t) => (
                  <th key={t.id} className="py-2 pr-3" style={{ color: t.colour }}>
                    {t.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {active.map((c) => {
                const row = caseByNumber.get(c.number);
                return (
                  <tr key={c.number} className="border-b border-ink/5">
                    <td className="py-3 pr-3 font-medium">
                      {row ? (
                        <Link
                          href={`/case-brain/${row.id}`}
                          className="hover:text-cardinal"
                        >
                          <span className="font-mono text-xs text-muted">
                            {String(c.number).padStart(2, "0")}
                          </span>{" "}
                          {c.title}
                        </Link>
                      ) : (
                        <>
                          <span className="font-mono text-xs text-muted">
                            {String(c.number).padStart(2, "0")}
                          </span>{" "}
                          {c.title}
                        </>
                      )}
                    </td>
                    {teams.map((t) => (
                      <td key={t.id} className="py-3 pr-3 text-muted">
                        {row ? (
                          <Link
                            href={`/case-brain/${row.id}?team=${t.id}`}
                            className="text-xs underline-offset-2 hover:underline"
                            style={{ color: t.colour }}
                          >
                            Open
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-ink/10 bg-white/60 p-4">
        <h2 className="font-display text-lg font-semibold">Your next three</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
          <li>
            Open{" "}
            <Link href="/case-brain" className="underline">
              Case brain
            </Link>{" "}
            and edit your claim map
          </li>
          <li>Finish the first-run checklist</li>
          <li>
            {session?.role === "tech_admin"
              ? "Use Admin switch → Passcodes when helping teammates"
              : "Decide Truth Source proposals with a one-line reason"}
          </li>
        </ol>
      </section>
    </main>
  );
}
