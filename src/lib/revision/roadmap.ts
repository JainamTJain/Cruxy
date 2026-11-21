import {
  DEFAULT_STAGE_DEADLINES,
  ROADMAP_STAGES,
  type RoadmapStage,
  type RoadmapStageId,
  type CaseRoleRow,
} from "@/lib/revision/types";
import { randomUUID } from "crypto";
import { nowIso } from "@/lib/utils";

/** Stages required by case role (and baseline for everyone). */
export function requiredStagesForRoles(
  roles: CaseRoleRow["role"][],
): Set<RoadmapStageId> {
  const req = new Set<RoadmapStageId>(["read"]);
  if (roles.some((r) => r === "lead_1" || r === "lead_2")) {
    req.add("map");
    req.add("one_pager");
    req.add("flashcards");
    req.add("question_drill");
    req.add("practiced");
    req.add("judged");
  }
  if (roles.includes("counter_arguer")) {
    req.add("map");
    req.add("question_drill");
    req.add("practiced");
  }
  if (roles.includes("supporter")) {
    req.add("one_pager");
    req.add("practiced");
  }
  // Anyone with any role must practice that case
  if (roles.length > 0) req.add("practiced");
  return req;
}

/** Re-space deadlines from a competition date (defaults leave Thanksgiving light). */
export function deadlinesFromCompetition(
  competitionDateIso: string,
): Record<RoadmapStageId, string> {
  const comp = new Date(competitionDateIso + "T12:00:00Z");
  if (Number.isNaN(comp.getTime())) return { ...DEFAULT_STAGE_DEADLINES };

  // Relative days before competition (matches Dec 5 defaults)
  const offsets: Record<RoadmapStageId, number> = {
    read: 11,
    map: 10,
    one_pager: 7,
    flashcards: 3,
    question_drill: 3,
    practiced: 2,
    judged: 1,
  };

  const out = {} as Record<RoadmapStageId, string>;
  for (const stage of ROADMAP_STAGES) {
    const d = new Date(comp);
    d.setUTCDate(d.getUTCDate() - offsets[stage]);
    out[stage] = d.toISOString().slice(0, 10);
  }
  return out;
}

export function buildRoadmapForPerson(args: {
  personId: string;
  caseIds: string[];
  rolesByCase: Map<string, CaseRoleRow["role"][]>;
  flashcardOptInCases: Set<string>;
  competitionDate: string;
}): RoadmapStage[] {
  const dues = deadlinesFromCompetition(args.competitionDate);
  const rows: RoadmapStage[] = [];
  for (const caseId of args.caseIds) {
    const roles = args.rolesByCase.get(caseId) ?? [];
    const required = requiredStagesForRoles(roles);
    if (args.flashcardOptInCases.has(caseId)) required.add("flashcards");
    for (const stage of ROADMAP_STAGES) {
      rows.push({
        id: randomUUID(),
        person_id: args.personId,
        case_id: caseId,
        stage,
        required: required.has(stage),
        due: dues[stage],
        done_at: null,
        created_at: nowIso(),
        created_by: null,
      });
    }
  }
  return rows;
}

export function readinessForCase(stages: RoadmapStage[]): number {
  const required = stages.filter((s) => s.required);
  if (required.length === 0) return 0;
  const weight: Record<RoadmapStageId, number> = {
    read: 1,
    map: 1,
    one_pager: 1,
    flashcards: 1,
    question_drill: 1,
    practiced: 2,
    judged: 2,
  };
  let total = 0;
  let done = 0;
  for (const s of required) {
    const w = weight[s.stage];
    total += w;
    if (s.done_at) done += w;
  }
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

export function doNextActions(
  stages: RoadmapStage[],
  caseTitles: Map<string, string>,
  limit = 3,
): string[] {
  const today = new Date().toISOString().slice(0, 10);
  const open = stages
    .filter((s) => s.required && !s.done_at)
    .sort((a, b) => {
      const aOver = a.due && a.due < today ? 0 : 1;
      const bOver = b.due && b.due < today ? 0 : 1;
      if (aOver !== bOver) return aOver - bOver;
      return (a.due ?? "9999").localeCompare(b.due ?? "9999");
    });

  const labels: Record<RoadmapStageId, string> = {
    read: "Finish reading",
    map: "Review the claim map",
    one_pager: "Sign off the one pager",
    flashcards: "Hit 90% on flashcards (twice)",
    question_drill: "Answer 10 bank questions",
    practiced: "Speak in a recorded round",
    judged: "Judge a round and beat your earlier score",
  };

  return open.slice(0, limit).map((s) => {
    const title = caseTitles.get(s.case_id) ?? "a case";
    const overdue = s.due && s.due < today ? " (overdue)" : "";
    return `${labels[s.stage]} — ${title}${overdue}`;
  });
}
