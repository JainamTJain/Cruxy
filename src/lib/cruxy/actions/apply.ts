/**
 * Apply a signed Cruxy plan after the person taps Apply.
 */
import "server-only";

import {
  applyBriefDecide,
  applyEvidenceQueue,
  applyFlashcards,
  type BriefDecideData,
  type EvidenceQueueData,
  type FlashcardsMakeData,
} from "@/lib/cruxy/actions/case-actions";
import {
  applyDrillStart,
  type DrillStartData,
} from "@/lib/cruxy/actions/drill";
import type { SignedPlan } from "@/lib/cruxy/actions/plan-token";
import type { RolesPlanData } from "@/lib/cruxy/actions/roles";
import {
  applyTodayPlan,
  type TodayPlan20Data,
} from "@/lib/cruxy/actions/today-plan";
import type { ActApplyResult } from "@/lib/cruxy/actions/types";
import { canSetCaseRole } from "@/lib/auth/capabilities";
import { applyRolePlan } from "@/lib/team/roles-board-repository";
import type { Person, SessionPayload } from "@/lib/types";

export async function applySignedPlan(input: {
  plan: SignedPlan<unknown>;
  session: SessionPayload;
  person: Person | null;
}): Promise<ActApplyResult> {
  const { plan, session, person } = input;

  if (plan.action === "roles.assign" && plan.teamId) {
    if (!person || !canSetCaseRole(person, session, plan.teamId)) {
      throw Object.assign(
        new Error(
          "Only a case lead, Dr. B or Jainam can change roles for this team.",
        ),
        { status: 403 },
      );
    }
    const data = plan.data as RolesPlanData;
    await applyRolePlan({
      teamId: plan.teamId,
      actorId: session.personId,
      assignments: data.assignments,
      replaceCases: data.replace,
    });
    return {
      message: `Done. ${data.assignments.length} roles are set, and everyone affected gets a notification.`,
    };
  }

  if (
    (plan.action === "brief.accept" || plan.action === "brief.reject") &&
    plan.teamId
  ) {
    return applyBriefDecide({
      data: plan.data as BriefDecideData,
      personId: session.personId,
      teamId: plan.teamId,
    });
  }

  if (plan.action === "evidence.queue" && plan.teamId) {
    return applyEvidenceQueue({
      data: plan.data as EvidenceQueueData,
      personId: session.personId,
      teamId: plan.teamId,
    });
  }

  if (plan.action === "flashcards.make" && plan.teamId) {
    return applyFlashcards({
      data: plan.data as FlashcardsMakeData,
      personId: session.personId,
      teamId: plan.teamId,
    });
  }

  if (plan.action === "drill.start") {
    return applyDrillStart({
      data: plan.data as DrillStartData,
      personId: session.personId,
    });
  }

  if (plan.action === "today.plan20") {
    return applyTodayPlan(plan.data as TodayPlan20Data);
  }

  throw Object.assign(new Error("I do not know how to apply that yet."), {
    status: 400,
  });
}
