import { cn } from "@/lib/utils";

type Variant = "inspired1" | "inspired2" | "inspired3" | "research" | "practice" | "reading" | "member" | "neutral";

function variantFor(label: string): Variant {
  const l = label.toLowerCase();
  if (l.includes("inspired by team 1")) return "inspired1";
  if (l.includes("inspired by team 2")) return "inspired2";
  if (l.includes("inspired by team 3")) return "inspired3";
  if (l.includes("research") || l.includes("cruxy")) return "research";
  if (l.includes("practice") || l.includes("transcript")) return "practice";
  if (l.includes("reading")) return "reading";
  if (l.includes("member")) return "member";
  return "neutral";
}

const STYLES: Record<Variant, string> = {
  inspired1: "bg-[var(--crux-team-1)] text-white",
  inspired2: "bg-[var(--crux-team-2)] text-white",
  inspired3: "bg-[var(--crux-team-3)] text-white",
  research: "bg-gold text-ink",
  practice: "bg-[#ECEEF1] text-[#3B404A]",
  reading: "bg-[#ECEEF1] text-[#3B404A]",
  member: "bg-ink/10 text-ink",
  neutral: "bg-[#ECEEF1] text-[#3B404A]",
};

export function OriginTag({ label }: { label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center self-start rounded-md px-2 py-0.5 text-[12px] font-bold",
        STYLES[variantFor(label)],
      )}
    >
      {label}
    </span>
  );
}
