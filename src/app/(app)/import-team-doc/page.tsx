import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { TeamDocImport } from "@/components/team-doc-import";

export default async function ImportTeamDocPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <header>
        <h1 className="font-[family-name:var(--font-bricolage)] text-3xl font-extrabold tracking-tight text-[var(--crux-ink)]">
          Import a team doc
        </h1>
        <p className="mt-2 text-[var(--crux-muted)]">
          Bring your team&apos;s working notes into the Evidence Library queue.
          Cruxy cites the doc passages. Strong ideas are offered to the other
          teams as Inspired by recommendations.
        </p>
      </header>

      <TeamDocImport
        teamId={session.teamId}
        label="Choose a doc"
        className="w-full"
      />
    </div>
  );
}
