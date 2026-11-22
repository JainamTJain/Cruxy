/**
 * Cruxy action: assign case roles from a plain request, for example
 * "Give Nick cases 1, 7, 11 and 15, give me 1 and 14, and shuffle the rest fairly."
 *
 * Cruxy only reads the request into a small structure. Names, case numbers and
 * the fair fill are resolved here in code, so the preview is exact.
 */
import "server-only";

import { callCruxy } from "@/lib/cruxy/callCruxy";
import {
  planRandomFairSplit,
  type RolesBoardView,
} from "@/lib/team/roles-board";
import { CASE_ROLE_LABELS, type CaseRoleSlot } from "@/lib/team/types";

export type RoleAssignment = {
  caseId: string;
  role: CaseRoleSlot;
  personId: string;
};

export type RolesPlanData = {
  assignments: RoleAssignment[];
  /** True when the whole board is re-dealt, so old roles on those cases are cleared first. */
  replace: boolean;
};

type Intent = {
  is_roles_request: boolean;
  fixed: { person: string; cases: number[]; role?: string }[];
  fill_rest_randomly: boolean;
  question_back?: string | null;
};

const ROLE_WORDS: Record<string, CaseRoleSlot | "lead"> = {
  lead: "lead",
  leader: "lead",
  l1: "lead_1",
  lead_1: "lead_1",
  "lead 1": "lead_1",
  l2: "lead_2",
  lead_2: "lead_2",
  "lead 2": "lead_2",
  counter: "counter_arguer",
  counter_arguer: "counter_arguer",
  "counter-arguer": "counter_arguer",
  supporter: "supporter",
  support: "supporter",
};

export { looksLikeRolesRequest } from "@/lib/cruxy/actions/detect";

function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      d[i]![j] = Math.min(
        d[i - 1]![j]! + 1,
        d[i]![j - 1]! + 1,
        d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return d[m]![n]!;
}

/** Sound-alike key so voice typing ("Genom") still finds "Jainam". */
function soundKey(name: string): string {
  const w = name.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return "";
  const groups: Record<string, string> = {
    b: "1", f: "1", p: "1", v: "1",
    c: "2", g: "2", j: "2", k: "2", q: "2", s: "2", x: "2", z: "2",
    d: "3", t: "3", l: "4", m: "5", n: "5", r: "6",
  };
  let out = groups[w[0]!] ?? "0";
  let last = out;
  for (const ch of w.slice(1)) {
    const g = groups[ch] ?? "";
    if (g && g !== last) out += g;
    last = g || last;
  }
  return out;
}

/** Match a spoken or typed name to a teammate (handles "me" and near misses). */
export function matchPerson(
  raw: string,
  people: { id: string; name: string }[],
  selfId: string,
): { id: string; name: string } | null {
  const q = raw.trim().toLowerCase();
  if (!q) return null;
  if (["me", "myself", "i", "mine"].includes(q)) {
    return people.find((p) => p.id === selfId) ?? null;
  }
  const exact = people.find((p) => p.name.toLowerCase() === q);
  if (exact) return exact;
  const first = people.find(
    (p) => p.name.toLowerCase().split(/\s+/)[0] === q.split(/\s+/)[0],
  );
  if (first) return first;
  const key = soundKey(q.split(/\s+/)[0]!);
  const sounds = people.filter((p) => soundKey(p.name.split(/\s+/)[0]!) === key);
  if (key.length >= 2 && sounds.length === 1) return sounds[0]!;
  let best: { p: { id: string; name: string }; d: number } | null = null;
  for (const p of people) {
    const d = editDistance(q, p.name.toLowerCase().split(/\s+/)[0]!);
    if (!best || d < best.d) best = { p, d };
  }
  return best && best.d <= Math.max(2, Math.floor(q.length / 2)) ? best.p : null;
}

function parseJson(text: string): unknown {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

/** Fallback when the model is unavailable: "Name ... 1, 7 and 11". */
function intentByRules(
  message: string,
  people: { id: string; name: string }[],
): Intent {
  const names = [...people.map((p) => p.name.split(/\s+/)[0]!), "me"];
  // Known names, "me", or any capitalised word (a misheard name) count as a person.
  const re = new RegExp(`\\b(${names.join("|")}|[A-Z][a-z]+)\\b`, "g");
  const stop = new Set(["Case", "Cases", "And", "Assign", "Give", "Put", "Make", "Set", "Lead", "The", "Everything", "Rest", "Randomly", "Please", "Then", "For", "I"]);
  const hits = [...message.matchAll(new RegExp(re.source, "gi"))].filter((h) => {
    const w = h[0];
    if (stop.has(w[0]!.toUpperCase() + w.slice(1).toLowerCase())) return false;
    return names.some((n) => n.toLowerCase() === w.toLowerCase()) || /^[A-Z]/.test(w);
  });
  const fixed: Intent["fixed"] = [];
  hits.forEach((h, i) => {
    const end = hits[i + 1]?.index ?? message.length;
    const chunk = message.slice((h.index ?? 0) + h[0].length, end);
    const cases = [...chunk.matchAll(/\b(\d{1,2})\b/g)].map((x) => Number(x[1]));
    if (cases.length) fixed.push({ person: h[0], cases });
  });
  return {
    is_roles_request: fixed.length > 0 || /random|shuffle|split/i.test(message),
    fixed,
    fill_rest_randomly: /random|shuffle|rest|everything else|split/i.test(message),
  };
}

async function readIntent(input: {
  message: string;
  board: RolesBoardView;
  personId: string;
  selfName: string;
}): Promise<Intent> {
  const names = input.board.people.map((p) => p.name).join(", ");
  const res = await callCruxy({
    feature: "cruxy_action_roles",
    tier: "small",
    personId: input.personId,
    messages: [
      {
        role: "system",
        content: [
          "You turn a request about Ethics Bowl case roles into JSON. Output JSON only.",
          `Teammates: ${names}. The person asking is ${input.selfName}; "me" or "I" means them.`,
          "Names may be misspelled by voice typing; return the teammate name it most likely means.",
          'Shape: {"is_roles_request": boolean, "fixed": [{"person": string, "cases": number[], "role": "lead"|"lead_1"|"lead_2"|"counter_arguer"|"supporter"}], "fill_rest_randomly": boolean, "question_back": string|null}',
          'Use role "lead" when no role is named. Case numbers are the case set numbers the person said.',
          "fill_rest_randomly is true when they ask to shuffle, randomise, split fairly or arrange the rest.",
          "If the request is unclear, set question_back to one short question.",
        ].join("\n"),
      },
      { role: "user", content: input.message },
    ],
  });
  if (res.ok && !res.stub) {
    const j = parseJson(res.text) as Partial<Intent> | null;
    if (j && Array.isArray(j.fixed)) {
      return {
        is_roles_request: Boolean(j.is_roles_request),
        fixed: j.fixed
          .filter((f) => f && typeof f.person === "string" && Array.isArray(f.cases))
          .map((f) => ({
            person: f.person,
            cases: f.cases.map(Number).filter((n) => Number.isFinite(n)),
            role: typeof f.role === "string" ? f.role : "lead",
          })),
        fill_rest_randomly: Boolean(j.fill_rest_randomly),
        question_back: j.question_back ?? null,
      };
    }
  }
  return intentByRules(input.message, input.board.people);
}

export type RolesPlanResult =
  | { kind: "not_roles" }
  | { kind: "say"; text: string }
  | {
      kind: "plan";
      summary: string;
      lines: string[];
      data: RolesPlanData;
    };

export async function planRolesFromMessage(input: {
  message: string;
  board: RolesBoardView;
  personId: string;
}): Promise<RolesPlanResult> {
  const { board } = input;
  if (!board.canEdit) {
    return {
      kind: "say",
      text: "Only a case lead, Dr. B or Jainam can change roles for this team. You can still ask me about who does what.",
    };
  }
  if (board.lock) {
    return {
      kind: "say",
      text: `Roles are locked as ${board.lock.label}. Unlock them on this page first, then ask me again.`,
    };
  }
  const self = board.people.find((p) => p.id === input.personId);
  const intent = await readIntent({
    message: input.message,
    board,
    personId: input.personId,
    selfName: self?.name ?? "the person asking",
  });
  if (!intent.is_roles_request) return { kind: "not_roles" };
  if (intent.question_back && !intent.fixed.length && !intent.fill_rest_randomly) {
    return { kind: "say", text: intent.question_back };
  }

  const byNumber = new Map(board.cases.map((c) => [c.number, c]));
  const activeCases = board.cases.filter((c) => c.active);
  const notes: string[] = [];
  const fixed: RoleAssignment[] = [];
  const leadsOn = new Map<string, string[]>();

  for (const f of intent.fixed) {
    const person = matchPerson(f.person, board.people, input.personId);
    if (!person) {
      notes.push(`I could not find "${f.person}" on ${board.teamName}, so I skipped them.`);
      continue;
    }
    const want = ROLE_WORDS[(f.role ?? "lead").toLowerCase()] ?? "lead";
    for (const n of f.cases) {
      const c = byNumber.get(n);
      if (!c) {
        notes.push(`There is no Case ${n}, so I skipped it for ${person.name}.`);
        continue;
      }
      if (!c.active) {
        notes.push(`Case ${n} is not in this regional's set, so I skipped it for ${person.name}.`);
        continue;
      }
      let role: CaseRoleSlot;
      if (want === "lead") {
        const leads = leadsOn.get(c.id) ?? [];
        if (leads.includes(person.id)) continue;
        if (leads.length >= 2) {
          notes.push(`Case ${n} already has two leads, so ${person.name} was not added there.`);
          continue;
        }
        role = leads.length === 0 ? "lead_1" : "lead_2";
        leads.push(person.id);
        leadsOn.set(c.id, leads);
      } else {
        role = want;
        if (role === "lead_1" || role === "lead_2") {
          const leads = leadsOn.get(c.id) ?? [];
          leads.push(person.id);
          leadsOn.set(c.id, leads);
        }
      }
      // One holder per slot: a later instruction replaces an earlier one.
      const i = fixed.findIndex((a) => a.caseId === c.id && a.role === role);
      if (i >= 0) fixed.splice(i, 1);
      fixed.push({ caseId: c.id, role, personId: person.id });
    }
  }

  let assignments = fixed;
  if (intent.fill_rest_randomly) {
    const plan = planRandomFairSplit({
      caseIds: activeCases.map((c) => c.id),
      personIds: board.people.map((p) => p.id),
      prefs: [],
      anyCasePersonIds: board.people.map((p) => p.id),
      existing: fixed,
    });
    // planRandomFairSplit re-emits kept leads; merge without duplicates.
    const seen = new Set<string>();
    assignments = [...fixed, ...plan].filter((a) => {
      const k = `${a.caseId}:${a.role}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  if (!assignments.length) {
    return {
      kind: "say",
      text: notes.length
        ? notes.join(" ")
        : "Tell me who should take which cases, for example: Nick on 1, 7 and 11, and shuffle the rest fairly.",
    };
  }

  const nameOf = new Map(board.people.map((p) => [p.id, p.name]));
  const caseOf = new Map(board.cases.map((c) => [c.id, c]));
  const order: CaseRoleSlot[] = ["lead_1", "lead_2", "counter_arguer", "supporter"];
  const lines = [...new Set(assignments.map((a) => a.caseId))]
    .sort((a, b) => (caseOf.get(a)?.number ?? 0) - (caseOf.get(b)?.number ?? 0))
    .map((caseId) => {
      const parts = assignments
        .filter((a) => a.caseId === caseId)
        .sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role))
        .map((a) => `${nameOf.get(a.personId) ?? "Someone"} (${CASE_ROLE_LABELS[a.role]})`);
      return `Case ${caseOf.get(caseId)?.number}: ${parts.join(", ")}`;
    });

  const fixedPeople = [...new Set(fixed.map((a) => nameOf.get(a.personId)))].filter(Boolean);
  const summary = [
    fixedPeople.length
      ? `Here is the plan for ${board.teamName}. I kept ${fixedPeople.join(" and ")} on the cases you named`
      : `Here is the plan for ${board.teamName}`,
    intent.fill_rest_randomly ? " and shared the rest out fairly." : ".",
    " Nothing changes until you tap Apply.",
    notes.length ? `\n${notes.join(" ")}` : "",
  ].join("");

  return { kind: "plan", summary, lines, data: { assignments, replace: intent.fill_rest_randomly } };
}
