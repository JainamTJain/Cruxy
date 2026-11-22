import Link from "next/link";

const LINKS = [
  {
    href: "/revision/one-pagers",
    title: "One pagers",
    blurb: "Draft from the claim map, edit, compare versions, and export to Drive.",
  },
  {
    href: "/revision/flashcards",
    title: "Flashcards",
    blurb: "Truth-linked cards that schedule themselves. Leads get decks automatically.",
  },
  {
    href: "/revision/socratic",
    title: "Socratic drills",
    blurb: "One question at a time on the weakest claim-map link.",
  },
  {
    href: "/revision/language",
    title: "Language and analogies",
    blurb: "Plain sentences, analogies, vivid examples, personal phrasebook.",
  },
  {
    href: "/revision/questions",
    title: "Moderator bank",
    blurb: "Paste-in split, origin tags, weighted drills, answer log.",
  },
  {
    href: "/revision/roadmap",
    title: "Personal roadmap",
    blurb: "Seven stages, deadlines from the regional, auto-marked from real work.",
  },
  {
    href: "/revision/warmup",
    title: "10-minute warm-up",
    blurb: "Five cards, two bank questions out loud, one counterclaim rebuttal.",
  },
];

export default function RevisionHubPage() {
  return (
    <main className="animate-fade-up space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted">
          Practice tools
        </p>
        <h1 className="font-display text-3xl font-semibold text-ink">Revision</h1>
        <p className="mt-1 max-w-xl text-sm text-muted">
          Tools built from your team&apos;s Evidence Library. Memorize what the team
          actually agreed on.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="rounded-2xl border border-ink/10 bg-white/70 p-4 transition hover:border-cardinal/40"
          >
            <h2 className="font-display text-lg font-semibold">{l.title}</h2>
            <p className="mt-1 text-sm text-muted">{l.blurb}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
