/**
 * Case workflow v2: role-weighted flashcard decks for Practice.
 * Cards are built from the team's one pager (+ deep material for leads).
 */
import type { OnePagerBody } from "@/lib/revision/types";
import type { CaseRoleKind } from "@/lib/case-brain/types";

export type StudyDeckKind = "lead" | "counter" | "support" | "everyone";

export const STUDY_DECK_META: {
  kind: StudyDeckKind;
  title: string;
  blurb: string;
}[] = [
  {
    kind: "lead",
    title: "Cases you lead",
    blurb:
      "Facts, stakeholders, claims, supports, counters and likely judge questions.",
  },
  {
    kind: "counter",
    title: "You are the counter-arguer",
    blurb: "The case and the counterarguments you own.",
  },
  {
    kind: "support",
    title: "You support",
    blurb: "The one pager for cases where you open and close.",
  },
  {
    kind: "everyone",
    title: "Every one pager",
    blurb: "One-pager cards for every case on your team.",
  },
];

export type StudyCardDraft = {
  deck: StudyDeckKind;
  front: string;
  back: string;
  /** Stable key so sync can upsert instead of duplicating. */
  key: string;
};

function keyOf(
  teamId: string,
  caseId: string,
  deck: StudyDeckKind,
  front: string,
): string {
  return `${teamId}|${caseId}|${deck}|${front.slice(0, 80)}`;
}

function push(
  out: StudyCardDraft[],
  teamId: string,
  caseId: string,
  deck: StudyDeckKind,
  front: string,
  back: string,
) {
  const f = front.trim();
  const b = back.trim();
  if (!f || !b) return;
  out.push({
    deck,
    front: f,
    back: b,
    key: keyOf(teamId, caseId, deck, f),
  });
}

/** One-pager cards for support / everyone decks. */
export function cardsFromOnePager(
  teamId: string,
  caseId: string,
  caseLabel: string,
  body: OnePagerBody,
  deck: StudyDeckKind,
): StudyCardDraft[] {
  const out: StudyCardDraft[] = [];
  const thesis =
    body.language?.plain?.trim() ||
    body.claims[0]?.text?.trim() ||
    "";
  push(
    out,
    teamId,
    caseId,
    deck,
    `${caseLabel}: our answer in one sentence?`,
    thesis || "No answer yet",
  );

  body.claims.forEach((c, i) => {
    push(
      out,
      teamId,
      caseId,
      deck,
      `${caseLabel}: Claim ${i + 1}?`,
      [c.text, c.logic_line].filter(Boolean).join("\n"),
    );
    c.supports.forEach((s, j) => {
      push(
        out,
        teamId,
        caseId,
        deck,
        `${caseLabel}: Claim ${i + 1}, support ${j + 1}?`,
        s,
      );
    });
  });

  if (body.counterclaim?.text) {
    push(
      out,
      teamId,
      caseId,
      deck,
      `${caseLabel}: the counterclaim?`,
      body.counterclaim.text,
    );
    push(
      out,
      teamId,
      caseId,
      deck,
      `${caseLabel}: concede, distinguish, rebut?`,
      [
        `Concede: ${body.counterclaim.concede || "(empty)"}`,
        `Distinguish: ${body.counterclaim.distinguish || "(empty)"}`,
        `Rebut: ${body.counterclaim.rebut || "(empty)"}`,
      ].join("\n"),
    );
  }

  const values = body.visuals.find((v) => v.kind === "values_scale");
  if (values?.payload) {
    const p = values.payload as {
      left?: string;
      right?: string;
      note?: string;
    };
    if (p.left || p.right) {
      push(
        out,
        teamId,
        caseId,
        deck,
        `${caseLabel}: values in tension?`,
        `${p.left ?? "?"} vs ${p.right ?? "?"}${p.note ? `\n${p.note}` : ""}`,
      );
    }
  }

  return out;
}

/** Extra depth for leads: stakeholders, facts, hard questions. */
export function deepCardsFromOnePager(
  teamId: string,
  caseId: string,
  caseLabel: string,
  body: OnePagerBody,
): StudyCardDraft[] {
  const out = cardsFromOnePager(teamId, caseId, caseLabel, body, "lead");

  const stakeholders = body.visuals.find((v) => v.kind === "stakeholder_grid");
  const cells = (stakeholders?.payload as { cells?: unknown[] } | undefined)
    ?.cells;
  if (Array.isArray(cells)) {
    for (const c of cells.slice(0, 6)) {
      if (typeof c === "string") {
        push(out, teamId, caseId, "lead", `${caseLabel}: stakeholder?`, c);
      } else if (c && typeof c === "object" && "who" in c) {
        const row = c as { who: string; stake?: string; voice?: string };
        push(
          out,
          teamId,
          caseId,
          "lead",
          `${caseLabel}: who is ${row.who}?`,
          [row.stake, row.voice].filter(Boolean).join(", ") || row.who,
        );
      }
    }
  }

  const timeline = body.visuals.find((v) => v.kind === "fact_timeline");
  const events = (
    timeline?.payload as { events?: { text: string; when?: string }[] } | undefined
  )?.events;
  if (Array.isArray(events)) {
    events.slice(0, 6).forEach((e, i) => {
      push(
        out,
        teamId,
        caseId,
        "lead",
        `${caseLabel}: fact ${i + 1}${e.when ? ` (${e.when})` : ""}?`,
        e.text,
      );
    });
  }

  const questions = body.visuals.find((v) => v.kind === "question_table");
  const rows = (questions?.payload as { rows?: { q: string; a: string }[] } | undefined)
    ?.rows;
  if (Array.isArray(rows)) {
    for (const row of rows.slice(0, 6)) {
      push(
        out,
        teamId,
        caseId,
        "lead",
        `${caseLabel}: judge may ask: ${row.q}`,
        row.a || "Prepare a line",
      );
    }
  }

  return out;
}

/** Counter-arguer deck: case + counters. */
export function counterCardsFromOnePager(
  teamId: string,
  caseId: string,
  caseLabel: string,
  body: OnePagerBody,
): StudyCardDraft[] {
  const out: StudyCardDraft[] = [];
  const thesis =
    body.language?.plain?.trim() || body.claims[0]?.text?.trim() || "";
  push(
    out,
    teamId,
    caseId,
    "counter",
    `${caseLabel}: their / our answer in one line?`,
    thesis || "No answer yet",
  );
  if (body.counterclaim?.text) {
    push(
      out,
      teamId,
      caseId,
      "counter",
      `${caseLabel}: strongest counterclaim?`,
      body.counterclaim.text,
    );
    push(
      out,
      teamId,
      caseId,
      "counter",
      `${caseLabel}: how we answer the counter?`,
      [
        body.counterclaim.concede,
        body.counterclaim.distinguish,
        body.counterclaim.rebut,
      ]
        .filter(Boolean)
        .join("\n") || "Fill concede, distinguish, rebut",
    );
  }
  body.claims.forEach((c, i) => {
    push(
      out,
      teamId,
      caseId,
      "counter",
      `${caseLabel}: attack on claim ${i + 1}?`,
      `Claim: ${c.text}\nLogic: ${c.logic_line || "(none)"}`,
    );
  });
  return out;
}

export function decksForRoles(roles: CaseRoleKind[]): StudyDeckKind[] {
  const set = new Set<StudyDeckKind>(["everyone"]);
  if (roles.includes("lead_1") || roles.includes("lead_2")) set.add("lead");
  if (roles.includes("counter_arguer")) set.add("counter");
  if (roles.includes("supporter")) set.add("support");
  return STUDY_DECK_META.map((m) => m.kind).filter((k) => set.has(k));
}

/** Avoid middle-dot in card backs from this helper. */
export function sanitizeCardText(s: string): string {
  return s.replace(/[·—]/g, (ch) => (ch === "·" ? ", " : " - "));
}
