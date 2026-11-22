import "server-only";
import { randomUUID } from "crypto";
import { logActivity } from "@/lib/db/repository";
import { assertOk, getServiceSupabase } from "@/lib/db/supabase/client";
import { chunk, iso, isoOrNull, type Row } from "@/lib/db/supabase/util";
import { programChannel, teamChannel } from "@/lib/team/channels";
import { buildAlignmentQuestions } from "@/lib/team/alignment";
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
import type { CaseRow, Person } from "@/lib/types";
import { nowIso } from "@/lib/utils";

const IN_CHUNK = 100;

export interface TeamBoardSnapshot {
  roles: CaseRole[];
  people: Person[];
  cases: {
    case: CaseRow;
    current: ClaimMapVersion | null;
    confirmations: ClaimMapConfirmation[];
    people: Person[];
  }[];
}

function mapCase(r: Row): CaseRow {
  return {
    id: r.id,
    number: r.number,
    title: r.title,
    case_set_page: r.case_set_page ?? null,
    crux: r.crux ?? null,
    trap: r.trap ?? null,
    closing_question: r.closing_question ?? null,
    active: r.active,
    created_at: iso(r.created_at),
  };
}

function mapPerson(r: Row): Person {
  return {
    id: r.id,
    name: r.name,
    team_id: r.team_id ?? null,
    role: r.role,
    email: r.email ?? null,
    email_reminders_opt_in: Boolean(r.email_reminders_opt_in),
    digest_opt_in: Boolean(r.digest_opt_in),
    consent_version: r.consent_version ?? null,
    consent_at: isoOrNull(r.consent_at),
    recording_ok: Boolean(r.recording_ok),
    voice_sample_path: r.voice_sample_path ?? null,
    pronunciation_note: (r.pronunciation_note as string | null) ?? null,
    first_run_checklist: r.first_run_checklist ?? {},
    failed_attempts: r.failed_attempts ?? 0,
    locked_until: isoOrNull(r.locked_until),
    last_sign_in_at: isoOrNull(r.last_sign_in_at),
    created_at: iso(r.created_at),
    created_by: r.created_by ?? null,
  };
}

function mapCaseRole(r: Row): CaseRole {
  return {
    id: r.id,
    team_id: r.team_id,
    case_id: r.case_id,
    person_id: r.person_id,
    role: r.role,
    created_at: iso(r.created_at),
    created_by: r.created_by ?? null,
  };
}

function mapAssignment(r: Row): Assignment {
  return {
    id: r.id,
    team_id: r.team_id,
    case_id: r.case_id ?? null,
    person_id: r.person_id,
    task: r.task ?? "",
    target_kind: (r.target_kind ?? "case") as AssignmentTargetKind,
    target_id: r.target_id ?? null,
    due: r.due ?? null,
    assigned_by: r.assigned_by ?? null,
    status: r.status,
    created_at: iso(r.created_at),
  };
}

function mapChat(r: Row): ChatChannel {
  return {
    id: r.id,
    channel: r.channel,
    team_id: r.team_id ?? null,
    created_at: iso(r.created_at),
    title: (r.title as string | null | undefined) ?? null,
    purpose: (r.purpose as string | null | undefined) ?? null,
    audience: (r.audience as string | null | undefined) ?? null,
    case_id: (r.case_id as string | null | undefined) ?? null,
    kind: (r.kind as string | null | undefined) ?? null,
  };
}

function mapMessage(r: Row): ChatMessage {
  return {
    id: r.id,
    chat_id: r.chat_id,
    person_id: r.person_id ?? null,
    from_cruxy: Boolean(r.from_cruxy),
    body: r.body,
    is_idea: Boolean(r.is_idea),
    mention_ids: r.mention_ids ?? [],
    case_id: r.case_id ?? null,
    link_refs: r.link_refs ?? null,
    created_at: iso(r.created_at),
  };
}

function mapVersion(r: Row): ClaimMapVersion {
  return {
    id: r.id,
    team_id: r.team_id,
    case_id: r.case_id,
    version: r.version,
    body: (r.body ?? { claims: [] }) as ClaimMapBody,
    change_summary: r.change_summary,
    created_by: r.created_by ?? null,
    created_at: iso(r.created_at),
  };
}

function mapConfirmation(r: Row): ClaimMapConfirmation {
  return {
    id: r.id,
    version_id: r.version_id,
    person_id: r.person_id,
    confirmed_at: iso(r.confirmed_at),
  };
}

function mapProposal(r: Row): ClaimChangeProposal {
  return {
    id: r.id,
    team_id: r.team_id,
    case_id: r.case_id,
    claim_key: r.claim_key,
    old_text: r.old_text,
    new_text: r.new_text,
    reason: r.reason,
    proposed_by: r.proposed_by,
    status: r.status,
    lead_accepter_id: r.lead_accepter_id ?? null,
    second_accepter_id: r.second_accepter_id ?? null,
    resulting_version_id: r.resulting_version_id ?? null,
    created_at: iso(r.created_at),
  };
}

function mapAlignment(r: Row): AlignmentQuestionSet {
  return {
    id: r.id,
    version_id: r.version_id,
    person_id: r.person_id,
    questions: (r.questions ?? []) as string[],
    answers: (r.answers ?? null) as string[] | null,
    drifted: Boolean(r.drifted),
    created_at: iso(r.created_at),
    answered_at: isoOrNull(r.answered_at),
  };
}

function mapDrift(r: Row): DriftFlag {
  return {
    id: r.id,
    team_id: r.team_id,
    case_id: r.case_id,
    person_id: r.person_id ?? null,
    version_id: r.version_id ?? null,
    source: r.source,
    detail: r.detail,
    transcript_ref: r.transcript_ref ?? null,
    private_to_leads: Boolean(r.private_to_leads),
    resolved_at: isoOrNull(r.resolved_at),
    created_at: iso(r.created_at),
  };
}

function mapTruth(r: Row): TruthItem {
  return {
    id: r.id,
    team_id: r.team_id,
    case_id: r.case_id,
    kind: r.kind,
    text: r.text,
    citation_ids: r.citation_ids ?? [],
    status: r.status,
    created_at: iso(r.created_at),
    created_by: r.created_by ?? null,
    updated_at: iso(r.updated_at ?? r.created_at),
  };
}

function mapPrefs(r: Row): PersonPrefs {
  const textSize = r.text_size;
  const reduce = r.reduce_motion;
  return {
    person_id: r.person_id,
    hide_floating_cruxy: Boolean(r.hide_floating_cruxy),
    cruxy_x: r.cruxy_x ?? null,
    cruxy_y: r.cruxy_y ?? null,
    cruxy_device: r.cruxy_device ?? null,
    text_size:
      textSize === "sm" ||
      textSize === "md" ||
      textSize === "lg" ||
      textSize === "xl"
        ? textSize
        : "md",
    high_contrast: Boolean(r.high_contrast),
    readable_font: Boolean(r.readable_font),
    reduce_motion:
      reduce === "system" || reduce === "on" || reduce === "off"
        ? reduce
        : "system",
    updated_at: iso(r.updated_at),
  };
}

function mapRoadmap(r: Row): RoadmapStage {
  return {
    id: r.id,
    person_id: r.person_id,
    case_id: r.case_id,
    stage: r.stage,
    required: Boolean(r.required),
    due: r.due ?? null,
    done_at: isoOrNull(r.done_at),
    created_at: iso(r.created_at),
  };
}

async function ensureChat(
  channel: string,
  teamId: string | null,
): Promise<ChatChannel> {
  const sb = getServiceSupabase();
  const { data: found, error: findErr } = await sb
    .from("chats")
    .select("*")
    .eq("channel", channel)
    .maybeSingle();
  assertOk(findErr, "ensureChat(select)");
  if (found) return mapChat(found);

  const { data, error } = await sb
    .from("chats")
    .upsert({ channel, team_id: teamId }, { onConflict: "channel" })
    .select("*")
    .single();
  assertOk(error, "ensureChat(upsert)");
  return mapChat(data as Row);
}

async function postCruxyMessage(input: {
  teamId: string;
  body: string;
  mentionIds: string[];
  caseId: string | null;
  linkRefs: Record<string, unknown>;
}): Promise<ChatMessage> {
  const chat = await ensureChat(teamChannel(input.teamId), input.teamId);
  const { data, error } = await getServiceSupabase()
    .from("messages")
    .insert({
      id: randomUUID(),
      chat_id: chat.id,
      person_id: null,
      from_cruxy: true,
      body: input.body,
      is_idea: false,
      mention_ids: input.mentionIds,
      case_id: input.caseId,
      link_refs: input.linkRefs,
      created_at: nowIso(),
    })
    .select("*")
    .single();
  assertOk(error, "postCruxyMessage");
  return mapMessage(data as Row);
}

async function latestVersion(
  teamId: string,
  caseId: string,
): Promise<ClaimMapVersion | null> {
  const { data, error } = await getServiceSupabase()
    .from("claim_map_versions")
    .select("*")
    .eq("team_id", teamId)
    .eq("case_id", caseId)
    .order("version", { ascending: false })
    .limit(1);
  assertOk(error, "latestVersion");
  const row = data?.[0];
  return row ? mapVersion(row) : null;
}

async function insertVersion(input: {
  teamId: string;
  caseId: string;
  body: ClaimMapBody;
  changeSummary: string;
  createdBy: string | null;
}): Promise<ClaimMapVersion> {
  const sb = getServiceSupabase();
  // (team_id, case_id, version) is unique; retry once if two edits race.
  for (let attempt = 0; attempt < 2; attempt++) {
    const current = await latestVersion(input.teamId, input.caseId);
    const { data, error } = await sb
      .from("claim_map_versions")
      .insert({
        id: randomUUID(),
        team_id: input.teamId,
        case_id: input.caseId,
        version: (current?.version ?? 0) + 1,
        body: input.body,
        change_summary: input.changeSummary,
        created_by: input.createdBy,
        created_at: nowIso(),
      })
      .select("*")
      .single();
    if (error && error.code === "23505" && attempt === 0) continue;
    assertOk(error, "insertVersion");
    return mapVersion(data as Row);
  }
  throw new Error("insertVersion: could not allocate a version number");
}

async function queueAlignmentQuestions(version: ClaimMapVersion): Promise<void> {
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("people")
    .select("id")
    .eq("team_id", version.team_id);
  assertOk(error, "queueAlignmentQuestions(people)");
  const rows = (data ?? []).map((p) => ({
    id: randomUUID(),
    version_id: version.id,
    person_id: p.id,
    questions: buildAlignmentQuestions(version),
    answers: null,
    drifted: false,
    created_at: nowIso(),
    answered_at: null,
  }));
  if (rows.length === 0) return;
  const { error: insErr } = await sb.from("alignment_questions").insert(rows);
  assertOk(insErr, "queueAlignmentQuestions(insert)");
}

export async function listCases(): Promise<CaseRow[]> {
  const { data, error } = await getServiceSupabase()
    .from("cases")
    .select("*")
    .order("number", { ascending: true });
  assertOk(error, "listCases");
  return (data ?? []).map(mapCase);
}

export async function getCaseById(id: string): Promise<CaseRow | null> {
  const { data, error } = await getServiceSupabase()
    .from("cases")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  assertOk(error, "getCaseById");
  return data ? mapCase(data) : null;
}

export async function listCaseRoles(teamId?: string): Promise<CaseRole[]> {
  let query = getServiceSupabase()
    .from("case_roles")
    .select("*")
    .order("created_at", { ascending: true });
  if (teamId) query = query.eq("team_id", teamId);
  const { data, error } = await query;
  assertOk(error, "listCaseRoles");
  return (data ?? []).map(mapCaseRole);
}

export async function setCaseRole(input: {
  teamId: string;
  caseId: string;
  role: CaseRoleSlot;
  personId: string;
  actorId: string;
}): Promise<{ role: CaseRole; chatMessage: ChatMessage }> {
  if (!CASE_ROLE_SLOTS.includes(input.role)) {
    throw new Error("Invalid role slot");
  }
  const sb = getServiceSupabase();

  const [personRes, actorRes, caseRes] = await Promise.all([
    sb.from("people").select("id,name").eq("id", input.personId).maybeSingle(),
    sb.from("people").select("id,name").eq("id", input.actorId).maybeSingle(),
    sb.from("cases").select("id,number,title").eq("id", input.caseId).maybeSingle(),
  ]);
  assertOk(personRes.error, "setCaseRole(person)");
  assertOk(actorRes.error, "setCaseRole(actor)");
  assertOk(caseRes.error, "setCaseRole(case)");
  const person = personRes.data;
  const actor = actorRes.data;
  const caseRow = caseRes.data;
  if (!person || !caseRow) throw new Error("Person or case not found");

  // Remove this person from any other role on this case/team, and clear the slot
  const { error: delErr } = await sb
    .from("case_roles")
    .delete()
    .eq("team_id", input.teamId)
    .eq("case_id", input.caseId)
    .or(`role.eq.${input.role},person_id.eq.${input.personId}`);
  assertOk(delErr, "setCaseRole(clear)");

  const { data: savedRow, error: insErr } = await sb
    .from("case_roles")
    .insert({
      id: randomUUID(),
      team_id: input.teamId,
      case_id: input.caseId,
      person_id: input.personId,
      role: input.role,
      created_at: nowIso(),
      created_by: input.actorId,
    })
    .select("*")
    .single();
  assertOk(insErr, "setCaseRole(insert)");
  const saved = mapCaseRole(savedRow as Row);

  // Roadmap: mark role stage done for assignee; clear old holders of this slot
  const stageName = `role:${input.role}`;
  const { error: clearErr } = await sb
    .from("roadmap_stages")
    .update({ done_at: null })
    .eq("case_id", input.caseId)
    .eq("stage", stageName)
    .neq("person_id", input.personId);
  assertOk(clearErr, "setCaseRole(roadmap clear)");

  const { data: roadmapRows, error: roadmapErr } = await sb
    .from("roadmap_stages")
    .select("id")
    .eq("person_id", input.personId)
    .eq("case_id", input.caseId)
    .eq("stage", stageName)
    .limit(1);
  assertOk(roadmapErr, "setCaseRole(roadmap select)");
  if (roadmapRows?.[0]) {
    const { error } = await sb
      .from("roadmap_stages")
      .update({ done_at: nowIso() })
      .eq("id", roadmapRows[0].id);
    assertOk(error, "setCaseRole(roadmap update)");
  } else {
    const { error } = await sb.from("roadmap_stages").insert({
      id: randomUUID(),
      person_id: input.personId,
      case_id: input.caseId,
      stage: stageName,
      required: true,
      due: null,
      done_at: nowIso(),
      created_at: nowIso(),
      created_by: null,
    });
    assertOk(error, "setCaseRole(roadmap insert)");
  }

  const chatMessage = await postCruxyMessage({
    teamId: input.teamId,
    body: `${actor?.name ?? "Someone"} set ${person.name} as ${CASE_ROLE_LABELS[input.role]} on Case ${caseRow.number} (${caseRow.title}).`,
    mentionIds: [input.personId],
    caseId: input.caseId,
    linkRefs: { kind: "role_change", role: input.role },
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
  const rows = input.personIds.map((personId) => ({
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
  }));
  let created: Assignment[] = [];
  if (rows.length > 0) {
    const { data, error } = await getServiceSupabase()
      .from("assignments")
      .insert(rows)
      .select("*");
    assertOk(error, "createAssignment");
    const byId = new Map((data ?? []).map((r) => [r.id as string, r]));
    created = rows
      .map((r) => byId.get(r.id))
      .filter((r): r is Row => Boolean(r))
      .map(mapAssignment);
  }
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
  let query = getServiceSupabase()
    .from("assignments")
    .select("*")
    .order("created_at", { ascending: true });
  if (filter?.personId) query = query.eq("person_id", filter.personId);
  if (filter?.teamId) query = query.eq("team_id", filter.teamId);
  const { data, error } = await query;
  assertOk(error, "listAssignments");
  return (data ?? []).map(mapAssignment);
}

/** Lists channels, creating the program channel and one channel per team when missing. */
export async function listChats(): Promise<ChatChannel[]> {
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("chats")
    .select("*")
    .order("created_at", { ascending: true });
  assertOk(error, "listChats");
  const chats = (data ?? []).map(mapChat);

  const { data: teamRows, error: teamErr } = await sb
    .from("teams")
    .select("id")
    .order("created_at", { ascending: true });
  assertOk(teamErr, "listChats(teams)");

  const have = new Set(chats.map((c) => c.channel));
  const missing: {
    channel: string;
    team_id: string | null;
    title: string;
    purpose: string;
    audience: string;
    kind: string;
    case_id: string | null;
  }[] = [];
  if (!have.has(programChannel())) {
    missing.push({
      channel: programChannel(),
      team_id: null,
      title: "All program",
      purpose: "Notes for every USC Ethics Bowl team.",
      audience: "Everyone in the program can see this.",
      kind: "program",
      case_id: null,
    });
  }
  for (const t of teamRows ?? []) {
    const channel = teamChannel(t.id);
    if (!have.has(channel)) {
      missing.push({
        channel,
        team_id: t.id,
        title: "Whole team",
        purpose: "Day to day notes for everyone on your team.",
        audience: "Your whole team can see this.",
        kind: "whole_team",
        case_id: null,
      });
    }
  }
  if (missing.length > 0) {
    const { data: added, error: addErr } = await sb
      .from("chats")
      .upsert(missing, { onConflict: "channel" })
      .select("*");
    assertOk(addErr, "listChats(seed)");
    chats.push(...(added ?? []).map(mapChat));
  }

  // Backfill team_id / kind on legacy rows that only had a channel string.
  for (const c of chats) {
    if (c.channel === programChannel()) continue;
    const needsTeam = !c.team_id;
    const needsKind = !c.kind;
    if (!needsTeam && !needsKind) continue;
    const parsedCase = (() => {
      const rest = c.channel.startsWith("team:")
        ? c.channel.slice("team:".length)
        : "";
      const i = rest.indexOf(":case:");
      if (i < 0) return null;
      return {
        teamId: rest.slice(0, i),
        caseId: rest.slice(i + ":case:".length),
      };
    })();
    const teamFromChannel = parsedCase
      ? parsedCase.teamId
      : c.channel.startsWith("team:")
        ? c.channel
            .slice("team:".length)
            .replace(/:leads$/, "")
            .split(":")[0] ?? null
        : null;
    const kind =
      c.kind ||
      (c.channel === programChannel()
        ? "program"
        : c.channel.endsWith(":leads")
          ? "leads"
          : parsedCase
            ? "case"
            : "whole_team");
    const patch: Record<string, unknown> = {};
    if (needsTeam && teamFromChannel) patch.team_id = teamFromChannel;
    if (needsKind) patch.kind = kind;
    if (parsedCase && !c.case_id) patch.case_id = parsedCase.caseId;
    if (!Object.keys(patch).length) continue;
    await sb.from("chats").update(patch).eq("id", c.id);
    if (patch.team_id) c.team_id = patch.team_id as string;
    if (patch.kind) c.kind = patch.kind as string;
    if (patch.case_id) c.case_id = patch.case_id as string;
  }

  return chats;
}

export async function listMessages(chatId: string): Promise<ChatMessage[]> {
  const { data, error } = await getServiceSupabase()
    .from("messages")
    .select("*")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true });
  assertOk(error, "listMessages");
  return (data ?? []).map(mapMessage);
}

export async function postMessage(input: {
  chatId: string;
  personId: string;
  body: string;
  mentionIds?: string[];
  caseId?: string | null;
  isIdea?: boolean;
  linkRefs?: Record<string, unknown> | null;
  actorTeamId: string | null;
  actorRole: string;
}): Promise<ChatMessage> {
  const sb = getServiceSupabase();
  const { data: chatRow, error: chatErr } = await sb
    .from("chats")
    .select("*")
    .eq("id", input.chatId)
    .maybeSingle();
  assertOk(chatErr, "postMessage(chat)");
  if (!chatRow) throw new Error("Channel not found");
  const chat = mapChat(chatRow);
  const isAdmin =
    input.actorRole === "tech_admin" || input.actorRole === "coach_admin";
  const canPost =
    isAdmin ||
    chat.channel === programChannel() ||
    (chat.team_id != null && chat.team_id === input.actorTeamId);
  if (!canPost) throw new Error("Cannot post to this channel");

  const mentionIds = [...(input.mentionIds ?? [])];
  // Resolve @Name mentions from the body against known people
  const { data: peopleRows } = await sb.from("people").select("id,name");
  for (const p of peopleRows ?? []) {
    const needle = `@${p.name as string}`;
    if (
      input.body.toLowerCase().includes(needle.toLowerCase()) &&
      !mentionIds.includes(p.id as string)
    ) {
      mentionIds.push(p.id as string);
    }
  }

  const link_refs: Record<string, unknown> = { ...(input.linkRefs ?? {}) };
  if (mentionIds.length) link_refs.mentions = mentionIds;
  if (input.caseId) link_refs.case_id = input.caseId;

  const { data, error } = await sb
    .from("messages")
    .insert({
      id: randomUUID(),
      chat_id: input.chatId,
      person_id: input.personId,
      from_cruxy: false,
      body: input.body,
      is_idea: Boolean(input.isIdea),
      mention_ids: mentionIds,
      case_id: input.caseId ?? null,
      link_refs: Object.keys(link_refs).length ? link_refs : null,
      created_at: nowIso(),
    })
    .select("*")
    .single();
  assertOk(error, "postMessage(insert)");
  return mapMessage(data as Row);
}

export async function markMessageIdea(
  messageId: string,
  actorId: string,
): Promise<ChatMessage> {
  const { data, error } = await getServiceSupabase()
    .from("messages")
    .update({ is_idea: true })
    .eq("id", messageId)
    .select("*")
    .maybeSingle();
  assertOk(error, "markMessageIdea");
  if (!data) throw new Error("Message not found");
  await logActivity({
    person_id: actorId,
    action: "chat_idea_queued",
    target: messageId,
  });
  return mapMessage(data);
}

export async function getCurrentClaimMap(
  teamId: string,
  caseId: string,
): Promise<ClaimMapVersion | null> {
  return latestVersion(teamId, caseId);
}

export async function listClaimMapVersions(
  teamId: string,
  caseId: string,
): Promise<ClaimMapVersion[]> {
  const { data, error } = await getServiceSupabase()
    .from("claim_map_versions")
    .select("*")
    .eq("team_id", teamId)
    .eq("case_id", caseId)
    .order("version", { ascending: true });
  assertOk(error, "listClaimMapVersions");
  return (data ?? []).map(mapVersion);
}

export async function listConfirmations(
  versionId: string,
): Promise<ClaimMapConfirmation[]> {
  const { data, error } = await getServiceSupabase()
    .from("claim_map_confirmations")
    .select("*")
    .eq("version_id", versionId)
    .order("confirmed_at", { ascending: true });
  assertOk(error, "listConfirmations");
  return (data ?? []).map(mapConfirmation);
}

export async function publishClaimMapEdit(input: {
  teamId: string;
  caseId: string;
  body: ClaimMapBody;
  changeSummary: string;
  actorId: string;
}): Promise<ClaimMapVersion> {
  const saved = await insertVersion({
    teamId: input.teamId,
    caseId: input.caseId,
    body: input.body,
    changeSummary: input.changeSummary,
    createdBy: input.actorId,
  });

  const { data: caseRow, error: caseErr } = await getServiceSupabase()
    .from("cases")
    .select("number")
    .eq("id", input.caseId)
    .maybeSingle();
  assertOk(caseErr, "publishClaimMapEdit(case)");

  await postCruxyMessage({
    teamId: input.teamId,
    body: `Case ${caseRow?.number ?? "?"} claim map is now v${saved.version}: ${input.changeSummary}`,
    mentionIds: [],
    caseId: input.caseId,
    linkRefs: { kind: "claim_map_version", version_id: saved.id },
  });
  await queueAlignmentQuestions(saved);

  await logActivity({
    person_id: input.actorId,
    action: "claim_map_version",
    target: saved.id,
    meta: { version: saved.version, case_id: input.caseId },
  });
  return saved;
}

export async function proposeClaimChange(input: {
  teamId: string;
  caseId: string;
  claimKey: string;
  newText: string;
  reason: string;
  actorId: string;
}): Promise<ClaimChangeProposal> {
  const current = await latestVersion(input.teamId, input.caseId);
  if (!current) throw new Error("No claim map yet");
  const claim = current.body.claims.find((c) => c.key === input.claimKey);
  if (!claim) throw new Error("Claim not found");

  const { data, error } = await getServiceSupabase()
    .from("claim_change_proposals")
    .insert({
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
    })
    .select("*")
    .single();
  assertOk(error, "proposeClaimChange");
  return mapProposal(data as Row);
}

export async function acceptClaimChange(input: {
  proposalId: string;
  accepterId: string;
}): Promise<{
  proposal: ClaimChangeProposal;
  version: ClaimMapVersion | null;
}> {
  const sb = getServiceSupabase();
  const { data: row, error: pErr } = await sb
    .from("claim_change_proposals")
    .select("*")
    .eq("id", input.proposalId)
    .maybeSingle();
  assertOk(pErr, "acceptClaimChange(proposal)");
  if (!row || row.status !== "pending") throw new Error("Proposal not found");
  const p = mapProposal(row);

  const [rolesRes, accepterRes] = await Promise.all([
    sb
      .from("case_roles")
      .select("person_id,role")
      .eq("team_id", p.team_id)
      .eq("case_id", p.case_id),
    sb.from("people").select("id,team_id").eq("id", input.accepterId).maybeSingle(),
  ]);
  assertOk(rolesRes.error, "acceptClaimChange(roles)");
  assertOk(accepterRes.error, "acceptClaimChange(accepter)");
  const isLead = (rolesRes.data ?? []).some(
    (r) =>
      r.person_id === input.accepterId &&
      (r.role === "lead_1" || r.role === "lead_2"),
  );
  const onTeam = accepterRes.data?.team_id === p.team_id;
  if (!onTeam) throw new Error("Only team members can accept");

  let lead = p.lead_accepter_id;
  let second = p.second_accepter_id;
  if (isLead && !lead) {
    lead = input.accepterId;
  } else if (!second && input.accepterId !== lead) {
    second = input.accepterId;
  } else {
    throw new Error("Already recorded or need a different accepter");
  }

  const complete = Boolean(lead && second);
  let version: ClaimMapVersion | null = null;

  if (complete) {
    const current = await latestVersion(p.team_id, p.case_id);
    if (!current) throw new Error("No claim map yet");
    const body: ClaimMapBody = JSON.parse(JSON.stringify(current.body));
    const claim = body.claims.find((c) => c.key === p.claim_key);
    if (claim) claim.text = p.new_text;
    version = await insertVersion({
      teamId: p.team_id,
      caseId: p.case_id,
      body,
      changeSummary: `Claim ${p.claim_key} changed: ${p.reason}`,
      createdBy: p.proposed_by,
    });
  }

  const { data: updated, error: upErr } = await sb
    .from("claim_change_proposals")
    .update({
      lead_accepter_id: lead,
      second_accepter_id: second,
      status: complete ? "accepted" : "pending",
      resulting_version_id: version?.id ?? null,
    })
    .eq("id", p.id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  assertOk(upErr, "acceptClaimChange(update)");
  if (!updated) throw new Error("Proposal not found");

  if (version) {
    await postCruxyMessage({
      teamId: p.team_id,
      body: `Claim map v${version.version} (two-person approved): ${p.old_text} → ${p.new_text}`,
      mentionIds: [],
      caseId: p.case_id,
      linkRefs: {
        kind: "claim_diff",
        old_text: p.old_text,
        new_text: p.new_text,
        version_id: version.id,
      },
    });
    await queueAlignmentQuestions(version);
  }

  return { proposal: mapProposal(updated), version };
}

export async function confirmClaimMapVersion(input: {
  versionId: string;
  personId: string;
}): Promise<ClaimMapConfirmation> {
  const sb = getServiceSupabase();
  const { data: existing, error: exErr } = await sb
    .from("claim_map_confirmations")
    .select("*")
    .eq("version_id", input.versionId)
    .eq("person_id", input.personId)
    .maybeSingle();
  assertOk(exErr, "confirmClaimMapVersion(select)");

  let saved: ClaimMapConfirmation;
  if (existing) {
    saved = mapConfirmation(existing);
  } else {
    const { data, error } = await sb
      .from("claim_map_confirmations")
      .upsert(
        {
          id: randomUUID(),
          version_id: input.versionId,
          person_id: input.personId,
          confirmed_at: nowIso(),
        },
        { onConflict: "version_id,person_id" },
      )
      .select("*")
      .single();
    assertOk(error, "confirmClaimMapVersion(insert)");
    saved = mapConfirmation(data as Row);
  }

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
  const sb = getServiceSupabase();
  const { data: qRow, error: qErr } = await sb
    .from("alignment_questions")
    .select("*")
    .eq("id", input.questionSetId)
    .maybeSingle();
  assertOk(qErr, "answerAlignment(select)");
  if (!qRow || qRow.person_id !== input.personId) throw new Error("Not found");

  const { data: vRow, error: vErr } = await sb
    .from("claim_map_versions")
    .select("*")
    .eq("id", qRow.version_id)
    .maybeSingle();
  assertOk(vErr, "answerAlignment(version)");
  const version = vRow ? mapVersion(vRow) : null;

  // Simple drift: answer must share a meaningful word with claim text
  const claimTexts = (version?.body.claims ?? []).map((c) =>
    c.text.toLowerCase(),
  );
  const drifted = input.answers.some((ans, i) => {
    if (i >= claimTexts.length) return false;
    const words = claimTexts[i].split(/\W+/).filter((w) => w.length > 4);
    return !words.some((w) => ans.toLowerCase().includes(w));
  });

  const { data: updated, error: upErr } = await sb
    .from("alignment_questions")
    .update({ answers: input.answers, answered_at: nowIso(), drifted })
    .eq("id", input.questionSetId)
    .select("*")
    .single();
  assertOk(upErr, "answerAlignment(update)");
  const set = mapAlignment(updated as Row);

  let drift: DriftFlag | null = null;
  if (drifted && version) {
    const { data, error } = await sb
      .from("drift_flags")
      .insert({
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
      })
      .select("*")
      .single();
    assertOk(error, "answerAlignment(drift)");
    drift = mapDrift(data as Row);
  }

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
  const { data, error } = await getServiceSupabase()
    .from("drift_flags")
    .insert({
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
    })
    .select("*")
    .single();
  assertOk(error, "flagTranscriptDrift");
  return mapDrift(data as Row);
}

export async function listDriftFlags(teamId: string): Promise<DriftFlag[]> {
  const { data, error } = await getServiceSupabase()
    .from("drift_flags")
    .select("*")
    .eq("team_id", teamId)
    .order("created_at", { ascending: true });
  assertOk(error, "listDriftFlags");
  return (data ?? []).map(mapDrift);
}

export async function listTruthItems(filter: {
  teamId: string;
  caseId?: string;
}): Promise<TruthItem[]> {
  let query = getServiceSupabase()
    .from("truth_items")
    .select("*")
    .eq("team_id", filter.teamId)
    .eq("status", "accepted")
    .order("created_at", { ascending: true });
  if (filter.caseId) query = query.eq("case_id", filter.caseId);
  const { data, error } = await query;
  assertOk(error, "listTruthItems");
  return (data ?? []).map(mapTruth);
}

export async function getPersonPrefs(personId: string): Promise<PersonPrefs> {
  const { data, error } = await getServiceSupabase()
    .from("person_prefs")
    .select("*")
    .eq("person_id", personId)
    .maybeSingle();
  assertOk(error, "getPersonPrefs");
  if (data) return mapPrefs(data);
  return {
    person_id: personId,
    hide_floating_cruxy: false,
    cruxy_x: null,
    cruxy_y: null,
    cruxy_device: null,
    text_size: "md",
    high_contrast: false,
    readable_font: false,
    reduce_motion: "system",
    updated_at: nowIso(),
  };
}

export async function savePersonPrefs(
  prefs: Partial<PersonPrefs> & { person_id: string },
): Promise<PersonPrefs> {
  const base = await getPersonPrefs(prefs.person_id);
  const merged = { ...base, ...prefs, updated_at: nowIso() };
  const { data, error } = await getServiceSupabase()
    .from("person_prefs")
    .upsert(
      {
        person_id: merged.person_id,
        hide_floating_cruxy: merged.hide_floating_cruxy,
        cruxy_x: merged.cruxy_x,
        cruxy_y: merged.cruxy_y,
        cruxy_device: merged.cruxy_device,
        text_size: merged.text_size,
        high_contrast: merged.high_contrast,
        readable_font: merged.readable_font,
        reduce_motion: merged.reduce_motion,
        updated_at: merged.updated_at,
      },
      { onConflict: "person_id" },
    )
    .select("*")
    .single();
  assertOk(error, "savePersonPrefs");
  return mapPrefs(data as Row);
}

export async function listRoadmapForPerson(
  personId: string,
): Promise<RoadmapStage[]> {
  const { data, error } = await getServiceSupabase()
    .from("roadmap_stages")
    .select("*")
    .eq("person_id", personId)
    .order("created_at", { ascending: true });
  assertOk(error, "listRoadmapForPerson");
  return (data ?? []).map(mapRoadmap);
}

export async function homeDiffsForPerson(
  personId: string,
): Promise<HomeDiffItem[]> {
  const sb = getServiceSupabase();
  const { data: personRow, error: pErr } = await sb
    .from("people")
    .select("id,team_id")
    .eq("id", personId)
    .maybeSingle();
  assertOk(pErr, "homeDiffsForPerson(person)");
  const teamId = personRow?.team_id as string | null | undefined;
  if (!teamId) return [];

  const { data, error } = await sb
    .from("claim_map_versions")
    .select("*")
    .eq("team_id", teamId)
    .order("version", { ascending: true });
  assertOk(error, "homeDiffsForPerson(versions)");

  const byCase = new Map<string, ClaimMapVersion[]>();
  for (const v of (data ?? []).map(mapVersion)) {
    const list = byCase.get(v.case_id) ?? [];
    list.push(v);
    byCase.set(v.case_id, list);
  }

  const currents: { current: ClaimMapVersion; prev: ClaimMapVersion }[] = [];
  for (const [, versions] of byCase) {
    const current = versions[versions.length - 1];
    if (!current || current.version < 2) continue;
    currents.push({ current, prev: versions[versions.length - 2] });
  }

  const confirmed = new Set<string>();
  for (const ids of chunk(
    currents.map((c) => c.current.id),
    IN_CHUNK,
  )) {
    const { data: conf, error: cErr } = await sb
      .from("claim_map_confirmations")
      .select("version_id")
      .eq("person_id", personId)
      .in("version_id", ids);
    assertOk(cErr, "homeDiffsForPerson(confirmations)");
    for (const c of conf ?? []) confirmed.add(c.version_id as string);
  }

  return currents.map(({ current, prev }) => ({
    version_id: current.id,
    team_id: current.team_id,
    case_id: current.case_id,
    version: current.version,
    change_summary: current.change_summary,
    old_text: prev.body.claims[0]?.text ?? "",
    new_text: current.body.claims[0]?.text ?? "",
    confirmed: confirmed.has(current.id),
  }));
}

export async function listPendingAlignmentForPerson(
  personId: string,
): Promise<AlignmentQuestionSet[]> {
  const { data, error } = await getServiceSupabase()
    .from("alignment_questions")
    .select("*")
    .eq("person_id", personId)
    .is("answered_at", null)
    .order("created_at", { ascending: false });
  assertOk(error, "listPendingAlignmentForPerson");
  return (data ?? []).map((r) => mapAlignment(r as Row));
}

export async function listPendingClaimChangeProposals(filter: {
  teamId: string;
  caseId: string;
}): Promise<ClaimChangeProposal[]> {
  const { data, error } = await getServiceSupabase()
    .from("claim_change_proposals")
    .select("*")
    .eq("team_id", filter.teamId)
    .eq("case_id", filter.caseId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  assertOk(error, "listPendingClaimChangeProposals");
  return (data ?? []).map((r) => mapProposal(r as Row));
}

export async function teamBoardSnapshot(
  teamId: string,
): Promise<TeamBoardSnapshot> {
  const sb = getServiceSupabase();
  const [casesRes, rolesRes, peopleRes, versionsRes] = await Promise.all([
    sb.from("cases").select("*").eq("active", true).order("number", { ascending: true }),
    sb.from("case_roles").select("*").eq("team_id", teamId).order("created_at", { ascending: true }),
    sb.from("people").select("*").eq("team_id", teamId).order("created_at", { ascending: true }),
    sb.from("claim_map_versions").select("*").eq("team_id", teamId).order("version", { ascending: false }),
  ]);
  assertOk(casesRes.error, "teamBoardSnapshot(cases)");
  assertOk(rolesRes.error, "teamBoardSnapshot(roles)");
  assertOk(peopleRes.error, "teamBoardSnapshot(people)");
  assertOk(versionsRes.error, "teamBoardSnapshot(versions)");

  const cases = (casesRes.data ?? []).map(mapCase);
  const roles = (rolesRes.data ?? []).map(mapCaseRole);
  const people = (peopleRes.data ?? []).map(mapPerson);

  const currentByCase = new Map<string, ClaimMapVersion>();
  for (const v of (versionsRes.data ?? []).map(mapVersion)) {
    if (!currentByCase.has(v.case_id)) currentByCase.set(v.case_id, v);
  }

  const confirmationsByVersion = new Map<string, ClaimMapConfirmation[]>();
  const currentIds = [...currentByCase.values()].map((v) => v.id);
  for (const ids of chunk(currentIds, IN_CHUNK)) {
    const { data, error } = await sb
      .from("claim_map_confirmations")
      .select("*")
      .in("version_id", ids);
    assertOk(error, "teamBoardSnapshot(confirmations)");
    for (const c of (data ?? []).map(mapConfirmation)) {
      const list = confirmationsByVersion.get(c.version_id) ?? [];
      list.push(c);
      confirmationsByVersion.set(c.version_id, list);
    }
  }

  return {
    roles,
    people,
    cases: cases.map((c) => {
      const current = currentByCase.get(c.id) ?? null;
      return {
        case: c,
        current,
        confirmations: current ? (confirmationsByVersion.get(current.id) ?? []) : [],
        people,
      };
    }),
  };
}
