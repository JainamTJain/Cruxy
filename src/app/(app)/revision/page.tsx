import Link from "next/link";
import { PageIntro } from "@/components/page-intro";

const LINKS = [
  {
    href: "/revision/one-pagers",
    title: "One pagers",
    blurb:
      "A one-page summary of your case stance. Draft from the claim map, edit, and export.",
  },
  {
    href: "/revision/flashcards",
    title: "Flashcards",
    blurb:
      "Cards drawn from the Evidence Library. They schedule themselves as you review.",
  },
  {
    href: "/revision/socratic",
    title: "Socratic drills",
    blurb:
      "One question at a time on the weakest link in your claim map. Private to you.",
  },
  {
    href: "/revision/language",
    title: "Language and analogies",
    blurb:
      "Plain sentences, everyday analogies, and a personal phrasebook for this case.",
  },
  {
    href: "/revision/questions",
    title: "Moderator bank",
    blurb:
      "Questions judges and moderators may ask. Practise answers out loud.",
  },
  {
    href: "/revision/roadmap",
    title: "Personal roadmap",
    blurb:
      "Your path to the regional: stages, due dates, and the next action.",
  },
  {
    href: "/revision/warmup",
    title: "10-minute warm-up",
    blurb:
      "Five cards, two bank questions out loud, one counterclaim rebuttal.",
  },
];

export default function RevisionHubPage() {
  return (
    <main className="animate-fade-up space-y-6">
      <PageIntro eyebrow="Practice tools" title="Revision">
        Tools that use what your team already agreed in the Evidence Library.
        Memorize and stress-test your own work, not a generic quiz.
      </PageIntro>
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
