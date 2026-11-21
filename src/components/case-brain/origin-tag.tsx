export function OriginTag({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-md bg-ink/5 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-ink/70">
      {label}
    </span>
  );
}
