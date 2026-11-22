"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

export type MoreSection =
  | "ideas"
  | "map"
  | "truth"
  | "flashcards"
  | "questions"
  | "research"
  | "brief";

const ITEMS: {
  id: MoreSection;
  label: string;
  blurb: string;
  countKey?: "truth" | "flashcard" | "question" | "reading";
}[] = [
  {
    id: "brief",
    label: "Team Brief",
    blurb: "Agreed stance, mode, and suggestions for this case.",
  },
  {
    id: "ideas",
    label: "Ideas over time",
    blurb: "How the claim map and questions grew.",
  },
  {
    id: "map",
    label: "Claim map",
    blurb: "Claims, supports, backings and counterclaims.",
  },
  {
    id: "truth",
    label: "Evidence Library",
    blurb: "Accepted facts, quotes, examples and frameworks.",
    countKey: "truth",
  },
  {
    id: "research",
    label: "Research",
    blurb: "Coverage, dossiers, findings and opposing positions.",
  },
];

type Counts = {
  truth?: number;
  flashcard?: number;
  question?: number;
  reading?: number;
};

/**
 * Everything that is not Reading / Working document / One pager.
 * Flashcards and Questions live in Practice; links below.
 */
export function CaseMoreList({
  active,
  onPick,
  counts,
  caseId,
  className,
}: {
  active: MoreSection | null;
  onPick: (id: MoreSection) => void;
  counts?: Counts;
  caseId?: string;
  className?: string;
}) {
  const studyHref = caseId
    ? `/practice/study?caseId=${encodeURIComponent(caseId)}`
    : "/practice/study";
  const soloHref = caseId
    ? `/practice/solo-qa?caseId=${encodeURIComponent(caseId)}`
    : "/practice/solo-qa";

  return (
    <ul className={cn("m-0 list-none space-y-2 p-0", className)}>
      {ITEMS.map((item) => {
        const count =
          item.countKey && counts
            ? counts[item.countKey]
            : undefined;
        const selected = active === item.id;
        return (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onPick(item.id)}
              className={cn(
                "flex w-full flex-col gap-0.5 rounded-[16px] border px-4 py-3 text-left",
                selected
                  ? "border-cardinal/40 bg-cardinal/5"
                  : "border-[#E3E5E9] bg-white hover:bg-[#F7F8FA]",
              )}
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                {item.label}
                {count != null && count > 0 ? (
                  <span className="rounded-md bg-mist px-1.5 py-0.5 text-[11px] font-bold text-[#3B404A]">
                    {count}
                  </span>
                ) : null}
              </span>
              <span className="text-xs text-muted">{item.blurb}</span>
            </button>
          </li>
        );
      })}
      <li>
        <Link
          href={studyHref}
          className="flex w-full flex-col gap-0.5 rounded-[16px] border border-[#E3E5E9] bg-white px-4 py-3 text-left hover:bg-[#F7F8FA]"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-ink">
            Study this case
            {counts?.flashcard != null && counts.flashcard > 0 ? (
              <span className="rounded-md bg-mist px-1.5 py-0.5 text-[11px] font-bold text-[#3B404A]">
                {counts.flashcard}
              </span>
            ) : null}
          </span>
          <span className="text-xs text-muted">
            Flashcard decks in Practice, weighted by your role.
          </span>
        </Link>
      </li>
      <li>
        <Link
          href={soloHref}
          className="flex w-full flex-col gap-0.5 rounded-[16px] border border-[#E3E5E9] bg-white px-4 py-3 text-left hover:bg-[#F7F8FA]"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-ink">
            Solo questions
            {counts?.question != null && counts.question > 0 ? (
              <span className="rounded-md bg-mist px-1.5 py-0.5 text-[11px] font-bold text-[#3B404A]">
                {counts.question}
              </span>
            ) : null}
          </span>
          <span className="text-xs text-muted">
            Moderator and judge questions with Cruxy feedback.
          </span>
        </Link>
      </li>
    </ul>
  );
}
