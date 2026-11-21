import type {
  ClaimRow,
  CounterclaimRow,
  OnePagerBody,
  OnePagerVisual,
  SupportRow,
  TruthItem,
} from "@/lib/revision/types";

/** Draft a printable one-pager body from claim map + truth items. */
export function draftOnePagerBody(args: {
  claims: ClaimRow[];
  supports: SupportRow[];
  counterclaims: CounterclaimRow[];
  truthItems: TruthItem[];
  caseTitle: string;
}): OnePagerBody {
  const claims = [...args.claims]
    .sort((a, b) => a.ord - b.ord)
    .slice(0, 2)
    .map((c) => {
      const supports = args.supports
        .filter((s) => s.claim_id === c.id)
        .sort((a, b) => a.ord - b.ord)
        .slice(0, 3)
        .map((s) => s.text);
      while (supports.length < 3) supports.push("");
      return {
        text: c.text,
        logic_line: c.logic_line ?? "",
        supports,
      };
    });

  while (claims.length < 2) {
    claims.push({ text: "", logic_line: "", supports: ["", "", ""] });
  }

  const cc = args.counterclaims[0] ?? null;
  const frameworks = args.truthItems.filter((t) => t.kind === "framework");
  const facts = args.truthItems.filter((t) => t.kind === "fact");
  const examples = args.truthItems.filter((t) => t.kind === "example");

  const visuals: OnePagerVisual[] = [
    {
      kind: "claim_map",
      title: "Claim map",
      payload: {
        nodes: claims.map((c, i) => ({
          id: `c${i + 1}`,
          label: c.text || `Claim ${i + 1}`,
          supports: c.supports.filter(Boolean),
        })),
        counter: cc?.text ?? null,
      },
    },
    {
      kind: "values_scale",
      title: "Values in tension",
      payload: {
        left: "Individual autonomy",
        right: "Collective good",
        note: "Edit to match this case's real tension.",
      },
    },
    {
      kind: "stakeholder_grid",
      title: "Stakeholders",
      payload: {
        cells: [
          "Primary actors",
          "Affected third parties",
          "Voiceless / future",
          "Institutions",
        ],
      },
    },
    {
      kind: "fact_timeline",
      title: "Case facts",
      payload: {
        events: facts.slice(0, 5).map((f, i) => ({
          order: i + 1,
          text: f.text,
        })),
      },
    },
    {
      kind: "framework_strip",
      title: "Frameworks",
      payload: {
        items: frameworks.slice(0, 3).map((f) => ({
          name: f.text.slice(0, 40),
          one_line: f.text,
        })),
      },
    },
    {
      kind: "question_table",
      title: "Likely questions",
      payload: {
        rows: [
          {
            q: "What is your view and main reasons?",
            a: claims[0]?.logic_line || "",
          },
          {
            q: "Change the facts: strongest flip?",
            a: "",
          },
          {
            q: "How do you answer the counterclaim?",
            a: cc?.rebut ?? "",
          },
        ],
      },
    },
  ];

  const empty_rows: string[] = [];
  claims.forEach((c, i) => {
    if (!c.text.trim()) empty_rows.push(`claim_${i + 1}`);
    if (!c.logic_line.trim()) empty_rows.push(`logic_${i + 1}`);
    c.supports.forEach((s, j) => {
      if (!s.trim()) empty_rows.push(`support_${i + 1}_${j + 1}`);
    });
  });
  if (!cc || !cc.text.trim()) empty_rows.push("counterclaim");

  const vivid = examples[0]?.text ?? facts[0]?.text ?? "";

  return {
    claims,
    counterclaim: cc
      ? {
          text: cc.text,
          concede: cc.concede ?? "",
          distinguish: cc.distinguish ?? "",
          rebut: cc.rebut ?? "",
        }
      : null,
    language: {
      plain: (claims[0]?.text || args.caseTitle).slice(0, 120),
      analogies: [
        "Like choosing which rule you'd want if you didn't know your place in the story.",
        "Like fixing a leak in a shared boat — who holds the patch matters.",
      ],
      vivid,
      avoid: ["obviously", "clearly", "just", "slippery slope (without stop)"],
    },
    visuals,
    empty_rows,
  };
}

/** Simple field-level diff for printable one-pager versions. */
export function diffOnePagerBodies(
  prev: OnePagerBody | null,
  next: OnePagerBody,
): { path: string; before: string; after: string }[] {
  if (!prev) {
    return [{ path: "(new)", before: "", after: "initial draft" }];
  }
  const out: { path: string; before: string; after: string }[] = [];
  for (let i = 0; i < Math.max(prev.claims.length, next.claims.length); i++) {
    const a = prev.claims[i];
    const b = next.claims[i];
    if ((a?.text ?? "") !== (b?.text ?? "")) {
      out.push({
        path: `claim_${i + 1}.text`,
        before: a?.text ?? "",
        after: b?.text ?? "",
      });
    }
    if ((a?.logic_line ?? "") !== (b?.logic_line ?? "")) {
      out.push({
        path: `claim_${i + 1}.logic`,
        before: a?.logic_line ?? "",
        after: b?.logic_line ?? "",
      });
    }
    for (let j = 0; j < 3; j++) {
      const as = a?.supports[j] ?? "";
      const bs = b?.supports[j] ?? "";
      if (as !== bs) {
        out.push({
          path: `claim_${i + 1}.support_${j + 1}`,
          before: as,
          after: bs,
        });
      }
    }
  }
  const pc = prev.counterclaim;
  const nc = next.counterclaim;
  for (const key of ["text", "concede", "distinguish", "rebut"] as const) {
    if ((pc?.[key] ?? "") !== (nc?.[key] ?? "")) {
      out.push({
        path: `counterclaim.${key}`,
        before: pc?.[key] ?? "",
        after: nc?.[key] ?? "",
      });
    }
  }
  return out;
}
