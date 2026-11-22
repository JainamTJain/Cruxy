/**
 * Client-safe helpers for editing one-pager bodies.
 */
import type { OnePagerBody, OnePagerVisual } from "@/lib/revision/types";

export function recomputeEmptyRows(body: OnePagerBody): string[] {
  const empty: string[] = [];
  body.claims.forEach((c, i) => {
    if (!c.text.trim()) empty.push(`claim_${i + 1}`);
    if (!c.logic_line.trim()) empty.push(`logic_${i + 1}`);
    c.supports.forEach((s, j) => {
      if (!s.trim()) empty.push(`support_${i + 1}_${j + 1}`);
    });
  });
  if (!body.counterclaim || !body.counterclaim.text.trim()) {
    empty.push("counterclaim");
  }
  return empty;
}

export function withEmptyRows(body: OnePagerBody): OnePagerBody {
  return { ...body, empty_rows: recomputeEmptyRows(body) };
}

export function emptyClaim(): OnePagerBody["claims"][number] {
  return { text: "", logic_line: "", supports: [""] };
}

export function ensureCounterclaim(
  body: OnePagerBody,
): NonNullable<OnePagerBody["counterclaim"]> {
  return (
    body.counterclaim ?? {
      text: "",
      concede: "",
      distinguish: "",
      rebut: "",
    }
  );
}

export function ensureLanguage(body: OnePagerBody): NonNullable<OnePagerBody["language"]> {
  return (
    body.language ?? {
      plain: "",
      analogies: [],
      vivid: "",
      avoid: [],
    }
  );
}

export function patchValuesVisual(
  visuals: OnePagerVisual[],
  patch: {
    left?: string;
    right?: string;
    note?: string | null;
    position?: number;
  },
): OnePagerVisual[] {
  const idx = visuals.findIndex((v) => v.kind === "values_scale");
  if (idx < 0) {
    return [
      ...visuals,
      {
        kind: "values_scale",
        title: "Values",
        payload: {
          left: patch.left ?? "Value A",
          right: patch.right ?? "Value B",
          note: patch.note ?? null,
          position: patch.position ?? 0.5,
        },
      },
    ];
  }
  const cur = visuals[idx]!;
  const payload = { ...(cur.payload as Record<string, unknown>), ...patch };
  const next = [...visuals];
  next[idx] = { ...cur, payload };
  return next;
}

/** Keep claim_map thesis in sync with the one-sentence answer. */
export function syncThesisVisual(
  visuals: OnePagerVisual[],
  thesis: string,
): OnePagerVisual[] {
  const idx = visuals.findIndex((v) => v.kind === "claim_map");
  if (idx < 0) return visuals;
  const cur = visuals[idx]!;
  const payload = { ...(cur.payload as Record<string, unknown>), thesis };
  const next = [...visuals];
  next[idx] = { ...cur, payload };
  return next;
}

export function readValues(visuals: OnePagerVisual[]): {
  left: string;
  right: string;
  note: string;
  position: number;
} {
  const v = visuals.find((x) => x.kind === "values_scale");
  const p = (v?.payload ?? {}) as {
    left?: string;
    right?: string;
    note?: string | null;
    position?: number;
  };
  return {
    left: p.left ?? "",
    right: p.right ?? "",
    note: p.note ?? "",
    position: typeof p.position === "number" ? p.position : 0.5,
  };
}
