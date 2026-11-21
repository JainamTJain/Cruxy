import type { ClaimRobustnessScore } from "@/lib/arg-graph/types";
import { formatAttackSummary } from "@/lib/arg-graph/df-quad";

export function ClaimRobustness({
  backed,
  total,
  graphScore,
}: {
  backed: number;
  total: number;
  /** DF-QuAD score from the argument graph (shared across teams). */
  graphScore?: ClaimRobustnessScore | null;
}) {
  const structural =
    total === 0 ? 0 : Math.round((backed / total) * 100);
  const pct = graphScore ? graphScore.score_pct : structural;
  const attackLine = graphScore ? formatAttackSummary(graphScore) : null;

  return (
    <span className="flex max-w-full flex-col items-end gap-1 text-[13px] font-semibold">
      <span className="flex items-center gap-2">
        <span className="h-2 w-[120px] max-w-[30vw] overflow-hidden rounded-full bg-[#ECEEF1]">
          <span
            className="block h-2 rounded-full bg-[var(--crux-team-3)]"
            style={{ width: `${pct}%` }}
          />
        </span>
        {pct}% robust
      </span>
      {attackLine ? (
        <span className="max-w-[280px] text-right text-[11px] font-medium leading-snug text-muted">
          {attackLine}
        </span>
      ) : null}
    </span>
  );
}
