export function ClaimRobustness({
  backed,
  total,
}: {
  backed: number;
  total: number;
}) {
  const pct = total === 0 ? 0 : Math.round((backed / total) * 100);
  return (
    <span className="flex items-center gap-2 text-[13px] font-semibold">
      <span className="h-2 w-[120px] overflow-hidden rounded-full bg-[#ECEEF1]">
        <span
          className="block h-2 rounded-full bg-[var(--crux-team-3)]"
          style={{ width: `${pct}%` }}
        />
      </span>
      {pct}% robust
    </span>
  );
}
