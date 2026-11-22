"use client";

import {
  ClaimResearchDossierView,
  ResearchBriefCard,
} from "@/components/cruxy/claim-research-dossier";
import { FindingCard } from "@/components/cruxy/finding-card";
import type { CaseBrainSnapshot } from "@/lib/case-brain/types";
import type {
  ClaimSourceDossier,
  ResearchBrief,
} from "@/lib/library/types";
import { cn } from "@/lib/utils";

type FindingLite = {
  id: string;
  point: string;
  why_it_matters: string;
  quote: string;
  link: string;
  verified: boolean;
  needs_check: boolean;
  citation?: string | null;
  open_access?: boolean | null;
};

type ResearchPayload = {
  brief?: ResearchBrief | null;
  claim_dossiers?: ClaimSourceDossier[] | null;
  findings?: FindingLite[] | null;
} | null;

type Props = {
  brain: CaseBrainSnapshot;
  research: ResearchPayload;
  className?: string;
};

/**
 * Cruxy's research brief for this case, on the Reading tab (not hidden).
 */
export function ReadingResearchSection({
  brain,
  research,
  className,
}: Props) {
  const dossiers = research?.claim_dossiers ?? [];
  const findings = research?.findings ?? [];
  const brief = research?.brief;

  return (
    <section className={cn("flex flex-col gap-4", className)}>
      <div>
        <h2 className="font-display m-0 text-xl font-extrabold">Research</h2>
        <p className="mt-1 text-sm text-muted">
          Cruxy&apos;s brief for this case. At most three ranked sources per
          claim.
        </p>
      </div>

      {brief ? (
        <ResearchBriefCard
          summary={brief.summary}
          judgmentChanges={brief.judgment_changes}
          judgmentDoesNot={brief.judgment_does_not}
        />
      ) : (
        <p className="m-0 rounded-[20px] bg-white px-4 py-5 text-sm text-muted">
          No research brief yet. Nightly research fills this in.
        </p>
      )}

      {dossiers.length > 0 ? (
        <div className="space-y-3">
          <h3 className="font-display m-0 text-lg font-extrabold">
            Sources by claim
          </h3>
          {dossiers.map((d) => (
            <ClaimResearchDossierView key={d.claim_ref} dossier={d} />
          ))}
        </div>
      ) : null}

      {findings.length > 0 ? (
        <div className="space-y-3">
          <h3 className="font-display m-0 text-lg font-extrabold">
            Recent findings
          </h3>
          {findings.map((f) => (
            <FindingCard
              key={f.id}
              point={f.point}
              whyItMatters={f.why_it_matters}
              quote={f.quote}
              link={f.link}
              verified={f.verified}
              needsCheck={f.needs_check}
              citation={f.citation}
              openAccess={f.open_access}
            />
          ))}
        </div>
      ) : null}

      {brain.opposing_positions.length > 0 ? (
        <div className="rounded-[20px] bg-white p-5">
          <h3 className="font-display m-0 text-lg font-extrabold">
            Likely opposing positions
          </h3>
          <p className="mt-1 text-sm text-muted">
            What other universities are most likely to bring.
          </p>
          <div className="mt-3 space-y-3">
            {brain.opposing_positions.map((o) => (
              <article
                key={o.id}
                className="rounded-[14px] bg-[#F7F8FA] p-3.5"
              >
                <h4 className="font-display m-0 text-base font-extrabold">
                  {o.title}
                </h4>
                <p className="mt-2 m-0 text-sm">
                  <span className="text-muted">Strongest: </span>
                  {o.strongest_support}
                </p>
                <p className="mt-1 m-0 text-sm">
                  <span className="text-muted">Weak point: </span>
                  {o.weak_point}
                </p>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
