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
          Link a Google Doc from the Ethics Bowl Drive. Crux reads it on sync
          and can turn clear facts into Evidence Library candidates. Other teams
          see the fact, not your full stance, unless you share more.
        </p>
      </header>

      <TeamDocImport
        teamId={session.teamId}
        label="Choose a Drive doc"
        className="w-full"
      />
    </div>
  );
}
