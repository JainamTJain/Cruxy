import { randomUUID } from "crypto";
import { isSampleDataMode } from "@/lib/db/config";
import { readStore, updateStore } from "@/lib/db/sample-store";
import { logActivity } from "@/lib/db/repository";
import { nowIso } from "@/lib/utils";
import { programChannel, teamChannel } from "@/lib/team/channels";
import type {
  AlignmentQuestionSet,
  Assignment,
  AssignmentTargetKind,
  CaseRole,
  CaseRoleSlot,
  ChatChannel,
  ChatMessage,
  ClaimChangeProposal,
  ClaimMapBody,
  ClaimMapConfirmation,
  ClaimMapVersion,
  DriftFlag,
  HomeDiffItem,
  PersonPrefs,
  RoadmapStage,
  TruthItem,
} from "@/lib/team/types";
import { CASE_ROLE_LABELS, CASE_ROLE_SLOTS } from "@/lib/team/types";

function requireSample() {
  if (!isSampleDataMode()) {
    throw new Error("Supabase path not wired yet — set USE_SAMPLE_DATA=1");
  }
}

export async function listCases() {
  requireSample();
  const store = await readStore();
  return store.cases;
}

export async function getCaseById(id: string) {
  const store = await readStore();
  return store.cases.find((c) => c.id === id) ?? null;
}

export async function listCaseRoles(teamId?: string): Promise<CaseRole[]> {
  requireSample();
  const store = await readStore();
  return store.case_roles.filter((r) => !teamId || r.team_id === teamId);
}

export async function setCaseRole(input: {
  teamId: string;
  caseId: string;
  role: CaseRoleSlot;
  personId: string;
  actorId: string;
}): Promise<{ role: CaseRole; chatMessage: ChatMessage }> {
  requireSample();
  if (!CASE_ROLE_SLOTS.includes(input.role)) {
    throw new Error("Invalid role slot");
  }

  let saved!: CaseRole;
  let chatMessage!: ChatMessage;

  await updateStore((s) => {
    const person = s.people.find((p) => p.id === input.personId);
    const actor = s.people.find((p) => p.id === input.actorId);
    const caseRow = s.cases.find((c) => c.id === input.caseId);
    if (!person || !caseRow) throw new Error("Person or case not found");

    // Remove this person from any other role on this case/team
    s.case_roles = s.case_roles.filter(
      (r) =>
        !(
          r.team_id === input.teamId &&
          r.case_id === input.caseId &&
          (r.role === input.role || r.person_id === input.personId)
        ),
    );

    saved = {
      id: randomUUID(),
      team_id: input.teamId,
      case_id: input.caseId,
      person_id: input.personId,
      role: input.role,
      created_at: nowIso(),
      created_by: input.actorId,
    };
    s.case_roles.push(saved);

    // Roadmap: mark role stage done for assignee; clear old holders of this slot
    const stageName = `role:${input.role}`;
    for (const stage of s.roadmap_stages) {
      if (
        stage.case_id === input.caseId &&
        stage.stage === stageName &&
        stage.person_id !== input.personId
      ) {
        stage.done_at = null;
      }
    }
    let roadmap = s.roadmap_stages.find(
      (r) =>
        r.person_id === input.personId &&
        r.case_id === input.caseId &&
        r.stage === stageName,
    );
    if (!roadmap) {
      roadmap = {
        id: randomUUID(),
        person_id: input.personId,
        case_id: input.caseId,
        stage: stageName,
        required: true,
        due: null,
        done_at: nowIso(),
        created_at: nowIso(),
        created_by: null,
      };
      s.roadmap_stages.push(roadmap);
    } else {
      roadmap.done_at = nowIso();
    }

    // Announce in team chat
    let chat = s.chats.find((c) => c.channel === teamChannel(input.teamId));
    if (!chat) {
      chat = {
        id: randomUUID(),
        channel: teamChannel(input.teamId),
        team_id: input.teamId,
        created_at: nowIso(),
      };
      s.chats.push(chat);
    }
    chatMessage = {
      id: randomUUID(),
      chat_id: chat.id,
      person_id: null,
      from_cruxy: true,
      body: `${actor?.name ?? "Someone"} set ${person.name} as ${CASE_ROLE_LABELS[input.role]} on Case ${caseRow.number} (${caseRow.title}).`,
      is_idea: false,
      mention_ids: [input.personId],
      case_id: input.caseId,
      link_refs: { kind: "role_change", role: input.role },
      created_at: nowIso(),
    };
    s.messages.push(chatMessage);
  });

  await logActivity({
    person_id: input.actorId,
    action: "case_role_set",
    target: input.caseId,
    meta: {
      role: input.role,
      person_id: input.personId,
      team_id: input.teamId,
    },
  });

  return { role: saved, chatMessage };
}

export async function createAssignment(input: {
  teamId: string;
  caseId: string | null;
  personIds: string[];
  task: string;
  targetKind: AssignmentTargetKind;
  targetId?: string | null;
  due?: string | null;
  assignedBy: string;
}): Promise<Assignment[]> {
  requireSample();
  const created: Assignment[] = [];
  await updateStore((s) => {
    for (const personId of input.personIds) {
      const row: Assignment = {
        id: randomUUID(),
        team_id: input.teamId,
        case_id: input.caseId,
        person_id: personId,
        task: input.task,
        target_kind: input.targetKind,
        target_id: input.targetId ?? null,
        due: input.due ?? null,
        assigned_by: input.assignedBy,
        status: "open",
        created_at: nowIso(),
      };
      s.assignments.push(row);
      created.push(row);
    }
  });
  await logActivity({
    person_id: input.assignedBy,
    action: "assignment_created",
    target: input.caseId,
    meta: { count: created.length, task: input.task },
  });
  return created;
}

export async function listAssignments(filter?: {
  personId?: string;
  teamId?: string;
}): Promise<Assignment[]> {
  requireSample();
  const store = await readStore();
  return store.assignments.filter((a) => {
    if (filter?.personId && a.person_id !== filter.personId) return false;
    if (filter?.teamId && a.team_id !== filter.teamId) return false;
    return true;
  });
}

export async function listChats(): Promise<ChatChannel[]> {
  requireSample();
  const store = await readStore();
  return store.chats;
}

export async function listMessages(chatId: string): Promise<ChatMessage[]> {
  requireSample();
  const store = await readStore();
  return store.messages
    .filter((m) => m.chat_id === chatId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function postMessage(input: {
  chatId: string;
  personId: string;
  body: string;
  mentionIds?: string[];
  caseId?: string | null;
  isIdea?: boolean;
  /** Admins can post anywhere; members only to their team + program */
  actorTeamId: string | null;
  actorRole: string;
}): Promise<ChatMessage> {
  requireSample();
  let saved!: ChatMessage;
  await updateStore((s) => {
    const chat = s.chats.find((c) => c.id === input.chatId);
    if (!chat) throw new Error("Channel not found");
    const isAdmin =
      input.actorRole === "tech_admin" || input.actorRole === "coach_admin";
    const canPost =
      isAdmin ||
      chat.channel === programChannel() ||
      (chat.team_id != null && chat.team_id === input.actorTeamId);
    if (!canPost) throw new Error("Cannot post to this channel");

    saved = {
      id: randomUUID(),
      chat_id: input.chatId,
      person_id: input.personId,
      from_cruxy: false,
      body: input.body,
      is_idea: Boolean(input.isIdea),
      mention_ids: input.mentionIds ?? [],
      case_id: input.caseId ?? null,
      link_refs: null,
      created_at: nowIso(),
    };
    s.messages.push(saved);
  });
  return saved;
}

export async function markMessageIdea(
  messageId: string,
  actorId: string,
): Promise<ChatMessage> {
  requireSample();
  let saved!: ChatMessage;
  await updateStore((s) => {
    const msg = s.messages.find((m) => m.id === messageId);
    if (!msg) throw new Error("Message not found");
    msg.is_idea = true;
    saved = msg;
    // Queue stub: Truth Sources proposal lands with Track 2; log for now
  });
  await logActivity({
    person_id: actorId,
    action: "chat_idea_queued",
    target: messageId,
  });
  return saved;
}

export async function getCurrentClaimMap(
  teamId: string,
  caseId: string,
): Promise<ClaimMapVersion | null> {
  requireSample();
  const store = await readStore();
  const versions = store.claim_map_versions
    .filter((v) => v.team_id === teamId && v.case_id === caseId)
    .sort((a, b) => b.version - a.version);
  return versions[0] ?? null;
}

export async function listClaimMapVersions(
  teamId: string,
  caseId: string,
): Promise<ClaimMapVersion[]> {
  requireSample();
  const store = await readStore();
  return store.claim_map_versions
    .filter((v) => v.team_id === teamId && v.case_id === caseId)
    .sort((a, b) => a.version - b.version);
}

export async function listConfirmations(
  versionId: string,
): Promise<ClaimMapConfirmation[]> {
  const store = await readStore();
  return store.claim_map_confirmations.filter((c) => c.version_id === versionId);
}

/** Non-claim edits (supports / logic / counterclaim response) create a version immediately. */
export async function publishClaimMapEdit(input: {
  teamId: string;
  caseId: string;
  body: ClaimMapBody;
  changeSummary: string;
  actorId: string;
}): Promise<ClaimMapVersion> {
  requireSample();
  let saved!: ClaimMapVersion;
  await updateStore((s) => {
    const current = s.claim_map_versions
      .filter((v) => v.team_id === input.teamId && v.case_id === input.caseId)
      .sort((a, b) => b.version - a.version)[0];
    const nextVersion = (current?.version ?? 0) + 1;
    saved = {
      id: randomUUID(),
      team_id: input.teamId,
      case_id: input.caseId,
      version: nextVersion,
      body: input.body,
      change_summary: input.changeSummary,
      created_by: input.actorId,
      created_at: nowIso(),
    };
    s.claim_map_versions.push(saved);

    // Chat announcement
    let chat = s.chats.find((c) => c.channel === teamChannel(input.teamId));
    if (!chat) {
      chat = {
        id: randomUUID(),
        channel: teamChannel(input.teamId),
        team_id: input.teamId,
        created_at: nowIso(),
      };
      s.chats.push(chat);
    }
    const caseRow = s.cases.find((c) => c.id === input.caseId);
    s.messages.push({
      id: randomUUID(),
      chat_id: chat.id,
      person_id: null,
      from_cruxy: true,
      body: `Case ${caseRow?.number ?? "?"} claim map is now v${nextVersion}: ${input.changeSummary}`,
      is_idea: false,
      mention_ids: [],
      case_id: input.caseId,
      link_refs: { kind: "claim_map_version", version_id: saved.id },
      created_at: nowIso(),
    });

    // Alignment questions for teammates
    const teammates = s.people.filter((p) => p.team_id === input.teamId);
    for (const p of teammates) {
      s.alignment_questions.push({
        id: randomUUID(),
        version_id: saved.id,
        person_id: p.id,
        questions: buildAlignmentQuestions(saved),
        answers: null,
        drifted: false,
        created_at: nowIso(),
        answered_at: null,
      });
    }
  });

  await logActivity({
    person_id: input.actorId,
    action: "claim_map_version",
    target: saved.id,
    meta: { version: saved.version, case_id: input.caseId },
  });
  return saved;
}

function buildAlignmentQuestions(version: ClaimMapVersion): string[] {
  const c1 = version.body.claims[0]?.text;
  const c2 = version.body.claims[1]?.text;
  const qs = [
    c1 ? `What is our Claim 1 now?` : "What is our current lead claim?",
    c2 ? `What is our Claim 2 now?` : "Name one support under Claim 1.",
    "How do we answer the main counterclaim?",
  ];
  return qs.slice(0, 3);
}

export async function proposeClaimChange(input: {
  teamId: string;
  caseId: string;
  claimKey: string;
  newText: string;
  reason: string;
  actorId: string;
}): Promise<ClaimChangeProposal> {
  requireSample();
  let saved!: ClaimChangeProposal;
  await updateStore((s) => {
    const current = s.claim_map_versions
      .filter((v) => v.team_id === input.teamId && v.case_id === input.caseId)
      .sort((a, b) => b.version - a.version)[0];
    if (!current) throw new Error("No claim map yet");
    const claim = current.body.claims.find((c) => c.key === input.claimKey);
    if (!claim) throw new Error("Claim not found");
    saved = {
      id: randomUUID(),
      team_id: input.teamId,
      case_id: input.caseId,
      claim_key: input.claimKey,
      old_text: claim.text,
      new_text: input.newText,
      reason: input.reason,
      proposed_by: input.actorId,
      status: "pending",
      lead_accepter_id: null,
      second_accepter_id: null,
      resulting_version_id: null,
      created_at: nowIso(),
    };
    s.claim_change_proposals.push(saved);
  });
  return saved;
}

export async function acceptClaimChange(input: {
  proposalId: string;
  accepterId: string;
}): Promise<{
  proposal: ClaimChangeProposal;
  version: ClaimMapVersion | null;
}> {
  requireSample();
  let proposal!: ClaimChangeProposal;
  let version: ClaimMapVersion | null = null;

  await updateStore((s) => {
    const p = s.claim_change_proposals.find((x) => x.id === input.proposalId);
    if (!p || p.status !== "pending") throw new Error("Proposal not found");
    const roles = s.case_roles.filter(
      (r) => r.team_id === p.team_id && r.case_id === p.case_id,
    );
    const isLead = roles.some(
      (r) =>
        r.person_id === input.accepterId &&
        (r.role === "lead_1" || r.role === "lead_2"),
    );
    const onTeam = s.people.some(
      (person) =>
        person.id === input.accepterId && person.team_id === p.team_id,
    );
    if (!onTeam) throw new Error("Only team members can accept");

    if (isLead && !p.lead_accepter_id) {
      p.lead_accepter_id = input.accepterId;
    } else if (
      !p.second_accepter_id &&
      input.accepterId !== p.lead_accepter_id
    ) {
      p.second_accepter_id = input.accepterId;
    } else {
      throw new Error("Already recorded or need a different accepter");
    }

    // Need lead + one more
    if (p.lead_accepter_id && p.second_accepter_id) {
      p.status = "accepted";
      const current = s.claim_map_versions
        .filter((v) => v.team_id === p.team_id && v.case_id === p.case_id)
        .sort((a, b) => b.version - a.version)[0];
      const body: ClaimMapBody = JSON.parse(JSON.stringify(current.body));
      const claim = body.claims.find((c) => c.key === p.claim_key);
      if (claim) claim.text = p.new_text;
      version = {
        id: randomUUID(),
        team_id: p.team_id,
        case_id: p.case_id,
        version: (current?.version ?? 0) + 1,
        body,
        change_summary: `Claim ${p.claim_key} changed: ${p.reason}`,
        created_by: p.proposed_by,
        created_at: nowIso(),
      };
      s.claim_map_versions.push(version);
      p.resulting_version_id = version.id;

      let chat = s.chats.find((c) => c.channel === teamChannel(p.team_id));
      if (!chat) {
        chat = {
          id: randomUUID(),
          channel: teamChannel(p.team_id),
          team_id: p.team_id,
          created_at: nowIso(),
        };
        s.chats.push(chat);
      }
      s.messages.push({
        id: randomUUID(),
        chat_id: chat.id,
        person_id: null,
        from_cruxy: true,
        body: `Claim map v${version.version} (two-person approved): ${p.old_text} → ${p.new_text}`,
        is_idea: false,
        mention_ids: [],
        case_id: p.case_id,
        link_refs: {
          kind: "claim_diff",
          old_text: p.old_text,
          new_text: p.new_text,
          version_id: version.id,
        },
        created_at: nowIso(),
      });

      for (const person of s.people.filter((x) => x.team_id === p.team_id)) {
        s.alignment_questions.push({
          id: randomUUID(),
          version_id: version.id,
          person_id: person.id,
          questions: buildAlignmentQuestions(version),
          answers: null,
          drifted: false,
          created_at: nowIso(),
          answered_at: null,
        });
      }
    }
    proposal = { ...p };
  });

  return { proposal, version };
}

export async function confirmClaimMapVersion(input: {
  versionId: string;
  personId: string;
}): Promise<ClaimMapConfirmation> {
  requireSample();
  let saved!: ClaimMapConfirmation;
  await updateStore((s) => {
    const existing = s.claim_map_confirmations.find(
      (c) => c.version_id === input.versionId && c.person_id === input.personId,
    );
    if (existing) {
      saved = existing;
      return;
    }
    saved = {
      id: randomUUID(),
      version_id: input.versionId,
      person_id: input.personId,
      confirmed_at: nowIso(),
    };
    s.claim_map_confirmations.push(saved);
  });
  await logActivity({
    person_id: input.personId,
    action: "claim_map_confirmed",
    target: input.versionId,
  });
  return saved;
}

export async function answerAlignment(input: {
  questionSetId: string;
  answers: string[];
  personId: string;
}): Promise<{ set: AlignmentQuestionSet; drift: DriftFlag | null }> {
  requireSample();
  let set!: AlignmentQuestionSet;
  let drift: DriftFlag | null = null;

  await updateStore((s) => {
    const q = s.alignment_questions.find((x) => x.id === input.questionSetId);
    if (!q || q.person_id !== input.personId) throw new Error("Not found");
    const version = s.claim_map_versions.find((v) => v.id === q.version_id);
    q.answers = input.answers;
    q.answered_at = nowIso();

    // Simple drift: answer must share a meaningful word with claim text
    const claimTexts = (version?.body.claims ?? []).map((c) =>
      c.text.toLowerCase(),
    );
    const drifted = input.answers.some((ans, i) => {
      if (i >= claimTexts.length) return false;
      const words = claimTexts[i]
        .split(/\W+/)
        .filter((w) => w.length > 4);
      return !words.some((w) => ans.toLowerCase().includes(w));
    });
    q.drifted = drifted;
    set = { ...q };

    if (drifted && version) {
      drift = {
        id: randomUUID(),
        team_id: version.team_id,
        case_id: version.case_id,
        person_id: input.personId,
        version_id: version.id,
        source: "alignment",
        detail: `Alignment answers drifted from v${version.version}.`,
        transcript_ref: null,
        private_to_leads: true,
        resolved_at: null,
        created_at: nowIso(),
      };
      s.drift_flags.push(drift);
    }
  });

  return { set, drift };
}

export async function flagTranscriptDrift(input: {
  teamId: string;
  caseId: string;
  personId: string;
  versionId: string;
  detail: string;
  transcriptRef: string;
}): Promise<DriftFlag> {
  requireSample();
  let flag!: DriftFlag;
  await updateStore((s) => {
    flag = {
      id: randomUUID(),
      team_id: input.teamId,
      case_id: input.caseId,
      person_id: input.personId,
      version_id: input.versionId,
      source: "transcript",
      detail: input.detail,
      transcript_ref: input.transcriptRef,
      private_to_leads: true,
      resolved_at: null,
      created_at: nowIso(),
    };
    s.drift_flags.push(flag);
  });
  return flag;
}

export async function listDriftFlags(teamId: string): Promise<DriftFlag[]> {
  const store = await readStore();
  return store.drift_flags.filter((d) => d.team_id === teamId);
}

export async function listTruthItems(filter: {
  teamId: string;
  caseId?: string;
}): Promise<TruthItem[]> {
  requireSample();
  const store = await readStore();
  return store.truth_items.filter(
    (t) =>
      t.team_id === filter.teamId &&
      t.status === "accepted" &&
      (!filter.caseId || t.case_id === filter.caseId),
  );
}

export async function getPersonPrefs(personId: string): Promise<PersonPrefs> {
  requireSample();
  const store = await readStore();
  return (
    store.person_prefs.find((p) => p.person_id === personId) ?? {
      person_id: personId,
      hide_floating_cruxy: false,
      cruxy_x: null,
      cruxy_y: null,
      cruxy_device: null,
      updated_at: nowIso(),
    }
  );
}

export async function savePersonPrefs(
  prefs: Partial<PersonPrefs> & { person_id: string },
): Promise<PersonPrefs> {
  requireSample();
  let saved!: PersonPrefs;
  await updateStore((s) => {
    const i = s.person_prefs.findIndex((p) => p.person_id === prefs.person_id);
    const base =
      i >= 0
        ? s.person_prefs[i]
        : {
            person_id: prefs.person_id,
            hide_floating_cruxy: false,
            cruxy_x: null,
            cruxy_y: null,
            cruxy_device: null,
            updated_at: nowIso(),
          };
    saved = { ...base, ...prefs, updated_at: nowIso() };
    if (i >= 0) s.person_prefs[i] = saved;
    else s.person_prefs.push(saved);
  });
  return saved;
}

export async function listRoadmapForPerson(
  personId: string,
): Promise<RoadmapStage[]> {
  const store = await readStore();
  return store.roadmap_stages.filter((r) => r.person_id === personId);
}

export async function homeDiffsForPerson(
  personId: string,
): Promise<HomeDiffItem[]> {
  requireSample();
  const store = await readStore();
  const person = store.people.find((p) => p.id === personId);
  if (!person?.team_id) return [];

  const byCase = new Map<string, ClaimMapVersion[]>();
  for (const v of store.claim_map_versions.filter(
    (x) => x.team_id === person.team_id,
  )) {
    const list = byCase.get(v.case_id) ?? [];
    list.push(v);
    byCase.set(v.case_id, list);
  }

  const diffs: HomeDiffItem[] = [];
  for (const [, versions] of byCase) {
    const sorted = versions.sort((a, b) => a.version - b.version);
    const current = sorted[sorted.length - 1];
    if (!current || current.version < 2) continue;
    const prev = sorted[sorted.length - 2];
    const confirmed = store.claim_map_confirmations.some(
      (c) => c.version_id === current.id && c.person_id === personId,
    );
    const oldClaim = prev.body.claims[0]?.text ?? "";
    const newClaim = current.body.claims[0]?.text ?? "";
    diffs.push({
      version_id: current.id,
      team_id: current.team_id,
      case_id: current.case_id,
      version: current.version,
      change_summary: current.change_summary,
      old_text: oldClaim,
      new_text: newClaim,
      confirmed,
    });
  }
  return diffs;
}

export async function teamBoardSnapshot(teamId: string) {
  requireSample();
  const store = await readStore();
  const cases = store.cases.filter((c) => c.active);
  const roles = store.case_roles.filter((r) => r.team_id === teamId);
  const people = store.people.filter((p) => p.team_id === teamId);
  const currentVersions = cases.map((c) => {
    const versions = store.claim_map_versions
      .filter((v) => v.team_id === teamId && v.case_id === c.id)
      .sort((a, b) => b.version - a.version);
    const current = versions[0] ?? null;
    const confirmations = current
      ? store.claim_map_confirmations.filter((x) => x.version_id === current.id)
      : [];
    return { case: c, current, confirmations, people };
  });
  return { roles, people, cases: currentVersions };
}

export function ensureProgramChatSeeded(
  chats: ChatChannel[],
): ChatChannel | undefined {
  return chats.find((c) => c.channel === programChannel());
}
