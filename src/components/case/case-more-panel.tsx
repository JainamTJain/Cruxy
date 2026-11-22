"use client";

import { cn } from "@/lib/utils";

/**
 * Case workflow v2: UI lists only Ideas over time.
 * Legacy ids remain for type-safe dead branches until claim map / truth
 * panels are fully removed from case-brain-client.
 */
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
}[] = [
  {
    id: "ideas",
    label: "Ideas over time",
    blurb: "How this case's thinking grew.",
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
 * Case workflow v2: only Ideas over time.
 */
export function CaseMoreList({
  active,
  onPick,
  counts: _counts,
  className,
}: {
  active: MoreSection | null;
  onPick: (id: MoreSection) => void;
  counts?: Counts;
  className?: string;
}) {
  void _counts;
  return (
    <ul className={cn("m-0 list-none space-y-2 p-0", className)}>
      {ITEMS.map((item) => {
        const selected = active === item.id;
        return (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onPick(item.id)}
              className={cn(
                "flex w-full flex-col items-start rounded-[14px] border px-4 py-3 text-left",
                selected
                  ? "border-cardinal bg-cardinal/5"
                  : "border-mist bg-white",
              )}
            >
              <span className="text-sm font-semibold text-ink">{item.label}</span>
              <span className="mt-0.5 text-[13px] text-muted">{item.blurb}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
