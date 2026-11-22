import Link from "next/link";
import { PageIntro } from "@/components/page-intro";
import { GlossaryTerm } from "@/components/help/glossary-term";
import { ETHICS_BOWL_90 } from "@/lib/help/ethics-bowl-90";

/**
 * Ethics Bowl in 90 seconds. Content from docs/domain only.
 */
export default function EthicsBowl90Page() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 animate-fade-up pb-10">
      <PageIntro eyebrow="New here" title={ETHICS_BOWL_90.title}>
        {ETHICS_BOWL_90.lead}
      </PageIntro>

      <ol className="m-0 flex list-none flex-col gap-4 p-0">
        {ETHICS_BOWL_90.beats.map((beat, i) => (
          <li
            key={beat.id}
            className="overflow-hidden rounded-[20px] bg-white"
          >
            <div
              className={
                i === 0
                  ? "bg-cardinal px-5 py-3 text-white"
                  : i === 1
                    ? "bg-ink px-5 py-3 text-white"
                    : "bg-[#1E3A5F] px-5 py-3 text-white"
              }
            >
              <p className="m-0 text-[11px] font-bold uppercase tracking-[0.12em] text-white/70">
                {beat.beat}
              </p>
              <h2 className="font-display m-0 mt-1 text-xl font-extrabold">
                {beat.title}
              </h2>
            </div>
            <p className="m-0 px-5 py-4 text-sm leading-relaxed text-ink">
              {beat.body}
            </p>
          </li>
        ))}
      </ol>

      <section className="rounded-[20px] bg-[#F7F8FA] p-5">
        <h2 className="font-display m-0 text-lg font-extrabold">
          Keep in mind
        </h2>
        <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-sm text-ink">
          {ETHICS_BOWL_90.tips.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-muted">
          Terms:{" "}
          <GlossaryTerm term="APPE" />
          {", "}
          <GlossaryTerm term="commentary" />
          {", "}
          <GlossaryTerm term="conferral" />
          {", "}
          <GlossaryTerm term="judges' questions" />
          .
        </p>
      </section>

      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/help" className="underline text-muted">
          All help
        </Link>
        <Link href="/help/glossary" className="underline text-muted">
          Glossary
        </Link>
        <Link href="/today" className="underline text-muted">
          Back to Today
        </Link>
      </div>
    </main>
  );
}
