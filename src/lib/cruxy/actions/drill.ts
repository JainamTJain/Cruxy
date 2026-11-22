/**
 * Practice action: start a drill on a named case.
 */
import "server-only";

import { createSession, listCases } from "@/lib/db/practice-repository";
import { getPersonById } from "@/lib/db/repository";
import { cannotDoYet, type ActPlanResult } from "@/lib/cruxy/actions/types";
import type { PracticeMode } from "@/lib/practice/types";
import { appToday } from "@/lib/time/app-day";

export type DrillStartData = {
  mode: PracticeMode;
  caseId: string | null;
  caseNumber: number | null;
  caseTitle: string | null;
  label: string;
};

const DEFAULT_MODE: PracticeMode = "judges_qa_drill";

export { looksLikeDrillStart } from "@/lib/cruxy/actions/detect";

function pickMode(message: string): PracticeMode {
  if (/moderator/i.test(message)) return "moderator_drill";
  if (/commentar/i.test(message)) return "commentary_drill";
  if (/conferral/i.test(message)) return "conferral_drill";
  if (/routing/i.test(message)) return "qa_routing";
  if (/thesis/i.test(message)) return "thesis_30";
  if (/solo|speech|free\s*record/i.test(message)) return "free_record";
  return DEFAULT_MODE;
}

const LABELS: Record<string, string> = {
  moderator_drill: "Moderator drill",
  commentary_drill: "Commentary drill",
  judges_qa_drill: "Judges' Q&A drill",
  free_record: "Free record",
  conferral_drill: "Conferral drill",
  qa_routing: "Q&A routing",
  thesis_30: "Thesis in 30s",
  solo_speech: "Solo speech",
};

export async function planDrillStart(input: {
  message: string;
}): Promise<ActPlanResult> {
  const cases = await listCases();
  const active = cases.filter((c) => c.active);
  const nums = [...input.message.matchAll(/\b(?:case\s*)?(\d{1,2})\b/gi)].map(
    (m) => Number(m[1]),
  );
  const caseRow =
    (nums.length
      ? active.find((c) => c.number === nums[0])
      : null) ??
    active[0] ??
    null;
  if (!caseRow && !active.length) {
    return {
      kind: "say",
      text: cannotDoYet(
        "start a drill",
        "Open Practice, pick a drill (for example Judges' Q&A), then tap Start.",
      ),
    };
  }
  const mode = pickMode(input.message);
  const label = LABELS[mode] ?? "Drill";
  const data: DrillStartData = {
    mode,
    caseId: caseRow?.id ?? null,
    caseNumber: caseRow?.number ?? null,
    caseTitle: caseRow?.title ?? null,
    label,
  };
  return {
    kind: "plan",
    action: "drill.start",
    summary: `I would start a ${label}${
      caseRow ? ` on Case ${caseRow.number}` : ""
    }. Nothing starts until you tap Apply.`,
    lines: [
      label,
      caseRow
        ? `Case ${caseRow.number}: ${caseRow.title}`
        : "First active case",
      "About 10 minutes",
    ],
    data,
  };
}

export async function applyDrillStart(input: {
  data: DrillStartData;
  personId: string;
}): Promise<{ message: string; navigate: string }> {
  const person = await getPersonById(input.personId);
  if (!person) throw new Error("Sign in again to start a drill.");
  const created = await createSession({
    kind: "member_practice",
    title: input.data.label,
    date: appToday(),
    place: null,
    online: true,
    createdBy: person.id,
    mode: input.data.mode,
    inviteTeamIds: person.team_id ? [person.team_id] : [],
    rounds: [
      {
        caseId: input.data.caseId,
        caseNumber: input.data.caseNumber,
        teamIds: person.team_id ? [person.team_id] : [],
        sides: {
          presenting: person.team_id,
          commenting: null,
        },
        moderator: "cruxy",
        judges: { humans: [], cruxy: true },
        mode: input.data.mode,
      },
    ],
  });
  const round = created.rounds[0];
  const href = round
    ? `/practice/rounds/${round.id}`
    : `/practice/sessions/${created.session.id}`;
  return {
    message: `Drill ready${
      input.data.caseNumber != null ? ` for Case ${input.data.caseNumber}` : ""
    }. Opening it now.`,
    navigate: href,
  };
}
