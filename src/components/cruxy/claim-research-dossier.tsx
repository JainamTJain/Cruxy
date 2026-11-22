"use client";

import { useState } from "react";
import { FindingCard } from "@/components/cruxy/finding-card";
import type {
  ClaimSourceDossier,
  RankedResearchSource,
} from "@/lib/library/types";
import { cn } from "@/lib/utils";

function SourceBlock({
  source,
  badge,
}: {
  source: RankedResearchSource;
  badge?: string;
}) {
  return (
    <div className="space-y-2">
      {badge ? (
        <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-[var(--crux-muted)]">
          {badge}
        </p>
      ) : null}
      <FindingCard
        point={source.point}
        quote={source.quote}
        link={source.url}
        verified={source.verified}
        needsCheck={source.needs_check}
        citation={source.citation}
        openAccess={source.open_access}
      />
      <p className="m-0 text-xs leading-snug text-[var(--crux-ink)]">
        {source.why_place}
      </p>
    </div>
  );
}

export function ClaimResearchDossierView({
  dossier,
  className,
}: {
  dossier: ClaimSourceDossier;
  className?: string;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const claimLabel = dossier.claim_ref.replace(/^Case\s+\d+,\s*/i, "");

  return (
    <article
      className={cn(
        "space-y-4 rounded-[20px] border border-[var(--crux-line)] bg-white p-5",
        className,
      )}
    >
      <h4 className="font-display m-0 text-lg font-extrabold text-[var(--crux-ink)]">
        {claimLabel || dossier.claim_ref}
      </h4>

      {dossier.best ? (
        <SourceBlock source={dossier.best} badge="Best source" />
      ) : (
        <p className="m-0 text-sm text-[var(--crux-muted)]">
          No source cleared the bar for this claim yet.
        </p>
      )}

      {dossier.top.length > 1 ? (
        <div className="space-y-4 border-t border-[var(--crux-line)] pt-4">
          <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-[var(--crux-muted)]">
            Why the top three earn their place
          </p>
          <ol className="m-0 list-decimal space-y-3 pl-5">
            {dossier.top.map((s) => (
              <li key={s.finding_id ?? s.citation} className="text-sm">
                <span className="font-semibold text-[var(--crux-ink)]">
                  {s.title}
                </span>
                <span className="text-[var(--crux-muted)]">
                  {" "}
                  ({s.composite})
                </span>
                <p className="m-0 mt-1 text-xs text-[var(--crux-ink)]">
                  {s.why_place}
                </p>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {dossier.steelman ? (
        <div className="space-y-2 border-t border-[var(--crux-line)] pt-4">
          <SourceBlock
            source={dossier.steelman}
            badge="Strongest opposing source"
          />
        </div>
      ) : null}

      {dossier.more.length > 0 ? (
        <div className="border-t border-[var(--crux-line)] pt-3">
          <button
            type="button"
            className="min-h-11 text-sm font-semibold text-[var(--crux-cardinal)] underline"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((v) => !v)}
          >
            {moreOpen ? "Hide more sources" : `More (${dossier.more.length})`}
          </button>
          {moreOpen ? (
            <div className="mt-3 space-y-4">
              {dossier.more.map((s) => (
                <SourceBlock
                  key={s.finding_id ?? s.citation}
                  source={s}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export function ResearchBriefCard({
  summary,
  judgmentChanges,
  judgmentDoesNot,
}: {
  summary: string;
  judgmentChanges: string;
  judgmentDoesNot: string;
}) {
  return (
    <section className="space-y-3 rounded-[20px] bg-white p-5">
      <h3 className="font-display m-0 text-xl font-extrabold">Tonight&apos;s brief</h3>
      <p className="m-0 text-sm leading-snug text-[var(--crux-ink)]">{summary}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl bg-[var(--crux-paper)] p-4">
          <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-[var(--crux-muted)]">
            What this changes
          </p>
          <p className="m-0 mt-2 text-sm text-[var(--crux-ink)]">
            {judgmentChanges}
          </p>
        </div>
        <div className="rounded-2xl bg-[var(--crux-paper)] p-4">
          <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-[var(--crux-muted)]">
            What this does not
          </p>
          <p className="m-0 mt-2 text-sm text-[var(--crux-ink)]">
            {judgmentDoesNot}
          </p>
        </div>
      </div>
    </section>
  );
}
