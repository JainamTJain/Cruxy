import { cn } from "@/lib/utils";

type Variant =
  | "inspired1"
  | "inspired2"
  | "inspired3"
  | "research"
  | "practice"
  | "reading"
  | "member"
  | "drb"
  | "appe"
  | "caseSet"
  | "teamDoc"
  | "neutral";

function variantFor(label: string): Variant {
  const l = label.toLowerCase();
  if (l.includes("inspired by team 1")) return "inspired1";
  if (l.includes("inspired by team 2")) return "inspired2";
  if (l.includes("inspired by team 3")) return "inspired3";
  if (l.includes("dr. b") || l.includes("dr b") || l === "coach") return "drb";
  if (l.includes("appe")) return "appe";
  if (l.includes("case set") || l.includes("case card")) return "caseSet";
  if (l.includes("team doc")) return "teamDoc";
  if (l.includes("research") || l === "cruxy" || l.startsWith("cruxy "))
    return "research";
  if (l.includes("practice") || l.includes("transcript")) return "practice";
  if (l.includes("reading")) return "reading";
  if (l.includes("member") || l.includes("team member")) return "member";
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
  drb: "bg-[#3B404A] text-white",
  appe: "bg-cardinal text-white",
  caseSet: "bg-[#ECEEF1] text-ink",
  teamDoc: "bg-ink/10 text-ink",
  neutral: "bg-[#ECEEF1] text-[#3B404A]",
};

/** F-025: small origin tag (Cruxy, Dr. B, team member, Inspired by, APPE, case set). */
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
