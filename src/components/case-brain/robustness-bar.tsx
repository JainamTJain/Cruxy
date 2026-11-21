import type { RobustnessScores } from "@/lib/case-brain/types";

export function RobustnessBar({ scores }: { scores: RobustnessScores }) {
  return (
    <div className="rounded-2xl border border-ink/10 bg-white/70 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display text-lg font-semibold">Robustness</h3>
        <p className="font-mono text-sm text-muted">{scores.overall}%</p>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-mist">
        <div
          className="h-full rounded-full bg-cardinal transition-all"
          style={{ width: `${Math.min(100, scores.overall)}%` }}
        />
      </div>
      <ul className="mt-3 grid gap-1 text-xs text-muted sm:grid-cols-2">
        <li>
          Supports backed: {scores.supports_backed}/{scores.supports_total}
        </li>
        <li>
          Counterclaims answered: {scores.counterclaims_answered}/
          {scores.counterclaims_total}
        </li>
        <li>
          Truth Sources verified: {scores.truth_verified}/{scores.truth_total}
        </li>
        <li>Unverified open: {scores.unverified_open}</li>
      </ul>
    </div>
  );
}
