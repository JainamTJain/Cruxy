/**
 * Route a message to the right page action planner.
 */
import "server-only";

import {
  looksLikeBriefDecide,
  looksLikeEvidenceQueue,
  looksLikeFlashcards,
  planBriefDecide,
  planEvidenceQueue,
  planFlashcards,
} from "@/lib/cruxy/actions/case-actions";
import {
  looksLikeCoherenceCheck,
  looksLikeTellIdea,
} from "@/lib/cruxy/actions/detect";
import { looksLikeDrillStart, planDrillStart } from "@/lib/cruxy/actions/drill";
import {
  answerWhoHasMostLeads,
  looksLikeLeadsCount,
} from "@/lib/cruxy/actions/roles-info";
import {
  looksLikeRolesRequest,
  planRolesFromMessage,
} from "@/lib/cruxy/actions/roles";
import { planTellIdea } from "@/lib/cruxy/actions/tell-idea";
import {
  looksLikeTodayPlan,
  planToday20,
} from "@/lib/cruxy/actions/today-plan";
import type { ActPlanResult } from "@/lib/cruxy/actions/types";
import { cannotDoYet } from "@/lib/cruxy/actions/types";
import type { RolesBoardView } from "@/lib/team/roles-board";

export async function planPageAction(input: {
  message: string;
  page: string;
  caseId: string | null;
  teamId: string | null;
  personId: string;
  rolesBoard?: RolesBoardView | null;
}): Promise<ActPlanResult> {
  const page = input.page || "";
  const msg = input.message;

  // Roles page
  if (page.startsWith("/team/roles")) {
    if (looksLikeLeadsCount(msg) && input.rolesBoard) {
      return {
        kind: "say",
        text: answerWhoHasMostLeads(input.rolesBoard),
      };
    }
    if (looksLikeRolesRequest(msg) && input.rolesBoard) {
      const result = await planRolesFromMessage({
        message: msg,
        board: input.rolesBoard,
        personId: input.personId,
      });
      if (result.kind === "not_roles") return { kind: "not_action" };
      if (result.kind === "say") return result;
      return {
        kind: "plan",
        action: "roles.assign",
        summary: result.summary,
        lines: result.lines,
        data: result.data,
        teamId: input.rolesBoard.teamId,
      };
    }
    if (looksLikeRolesRequest(msg) || looksLikeLeadsCount(msg)) {
      return {
        kind: "say",
        text: cannotDoYet(
          "change roles",
          "Open Roles for your team, or ask a case lead, Dr. B or Jainam.",
        ),
      };
    }
  }

  // Case pages
  if (page.startsWith("/case-brain") || page.startsWith("/team/cases")) {
    if (!input.teamId) {
      if (
        looksLikeBriefDecide(msg) ||
        looksLikeEvidenceQueue(msg) ||
        looksLikeFlashcards(msg) ||
        looksLikeTellIdea(msg) ||
        looksLikeCoherenceCheck(msg)
      ) {
        return {
          kind: "say",
          text: cannotDoYet(
            "do that on a case",
            "Join a team first, then open the case and ask again.",
          ),
        };
      }
      return { kind: "not_action" };
    }
    if (looksLikeTellIdea(msg)) {
      return planTellIdea({
        message: msg,
        page,
        caseId: input.caseId,
        teamId: input.teamId,
        personId: input.personId,
      });
    }
    if (looksLikeCoherenceCheck(msg)) {
      const caseId =
        input.caseId ??
        page.match(/\/(?:case-brain|team\/cases)\/([0-9a-f-]{36})/i)?.[1] ??
        null;
      if (!caseId) {
        return {
          kind: "say",
          text: cannotDoYet(
            "check coherence",
            "Open the case working document, then ask me again.",
          ),
        };
      }
      return {
        kind: "plan",
        action: "doc.coherence",
        summary:
          "I would review your working document for missing perspectives, loose ends, and claims that do not connect to your answer. Each finding becomes a suggestion. Nothing changes until you tap Apply.",
        lines: [
          "Missing perspectives and stakeholders",
          "Claims that do not connect to the one-sentence answer",
          "Loose ends judges may press",
        ],
        data: { caseId },
        teamId: input.teamId,
      };
    }
    if (looksLikeBriefDecide(msg)) {
      return planBriefDecide({
        message: msg,
        page,
        caseId: input.caseId,
        teamId: input.teamId,
        personId: input.personId,
      });
    }
    if (looksLikeEvidenceQueue(msg)) {
      return planEvidenceQueue({
        message: msg,
        page,
        caseId: input.caseId,
        teamId: input.teamId,
      });
    }
    if (looksLikeFlashcards(msg)) {
      return planFlashcards({
        message: msg,
        page,
        caseId: input.caseId,
        teamId: input.teamId,
      });
    }
  }

  // Practice
  if (page.startsWith("/practice") && looksLikeDrillStart(msg)) {
    return planDrillStart({ message: msg });
  }

  // Today
  if (
    (page === "/today" || page.startsWith("/today/")) &&
    looksLikeTodayPlan(msg)
  ) {
    return planToday20();
  }

  // Off-page action words: still refuse with an exact tap path.
  if (looksLikeDrillStart(msg) && !page.startsWith("/practice")) {
    return {
      kind: "say",
      text: cannotDoYet(
        "start a drill",
        "Open Practice, then ask me again, or tap a drill such as Judges' Q&A.",
      ),
    };
  }
  if (looksLikeTodayPlan(msg) && page !== "/today" && !page.startsWith("/today/")) {
    return {
      kind: "say",
      text: cannotDoYet(
        "plan your next 20 minutes",
        "Open Today, then ask me again, or follow the focus cards there.",
      ),
    };
  }
  if (
    (looksLikeBriefDecide(msg) ||
      looksLikeEvidenceQueue(msg) ||
      looksLikeFlashcards(msg) ||
      looksLikeTellIdea(msg) ||
      looksLikeCoherenceCheck(msg)) &&
    !page.startsWith("/case-brain") &&
    !page.startsWith("/team/cases")
  ) {
    return {
      kind: "say",
      text: cannotDoYet(
        "change this case",
        "Open the case page first, then ask me again.",
      ),
    };
  }

  return { kind: "not_action" };
}
