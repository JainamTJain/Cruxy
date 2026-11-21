import { randomUUID } from "crypto";
import type { ConsistencyFlag, TeamPrinciple } from "@/lib/case-brain/types";
import { nowIso } from "@/lib/utils";

/** Known principle clash pairs used when no AI gateway is available. */
const CLASH_PATTERNS: Array<{
  a: RegExp;
  b: RegExp;
  note: string;
}> = [
  {
    a: /least\s+restrict/i,
    b: /prohibit|ban|forbid|strong\s+restrict/i,
    note: "Least-restrictive tool in one case clashes with a stronger ban-style principle in another.",
  },
  {
    a: /autonomy|consent/i,
    b: /paternal|override\s+consent|force/i,
    note: "Autonomy/consent emphasis clashes with overriding consent elsewhere.",
  },
  {
    a: /harm\s+prevention|prevent\s+harm/i,
    b: /liberty\s+first|hands\s+off/i,
    note: "Harm-prevention priority clashes with a liberty-first stance on another case.",
  },
];

export function findConsistencyFlags(
  teamId: string,
  principles: TeamPrinciple[],
): ConsistencyFlag[] {
  const flags: ConsistencyFlag[] = [];
  for (let i = 0; i < principles.length; i++) {
    for (let j = i + 1; j < principles.length; j++) {
      const a = principles[i]!;
      const b = principles[j]!;
      if (a.case_id === b.case_id) continue;
      for (const pattern of CLASH_PATTERNS) {
        const hit =
          (pattern.a.test(a.principle) && pattern.b.test(b.principle)) ||
          (pattern.b.test(a.principle) && pattern.a.test(b.principle));
        if (hit) {
          flags.push({
            id: randomUUID(),
            team_id: teamId,
            case_id_a: a.case_id,
            case_id_b: b.case_id,
            principle_a: a.principle,
            principle_b: b.principle,
            note: pattern.note,
            created_at: nowIso(),
          });
        }
      }
    }
  }
  return flags;
}
