/**
 * Home "Since you were here" feed: allowlisted actions only,
 * plain sentences, never print ids.
 */

import type { ActivityLogEntry } from "@/lib/types";

export type FeedCaseLookup = {
  id: string;
  number: number;
  title: string;
};

export type FeedLine = {
  id: string;
  text: string;
  href: string | null;
  personName: string;
  at: string;
  caseId: string | null;
  caseLabel: string | null;
  groupKey: string;
};

type FormatCtx = {
  personName: string;
  casesById: Map<string, FeedCaseLookup>;
  now?: number;
};

type Template = {
  /** Build sentence without trailing relative time. */
  sentence: (
    entry: ActivityLogEntry,
    ctx: FormatCtx,
  ) => { text: string; href: string | null; caseId: string | null } | null;
};

function caseLabel(
  caseId: string | null | undefined,
  casesById: Map<string, FeedCaseLookup>,
): string | null {
  if (!caseId) return null;
  const c = casesById.get(caseId);
  if (!c) return null;
  return `Case ${c.number}, ${c.title}`;
}

function metaStr(
  meta: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  if (!meta) return null;
  const v = meta[key];
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

function metaCaseId(
  entry: ActivityLogEntry,
): string | null {
  return metaStr(entry.meta, "case_id");
}

function relativeTime(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const mins = Math.max(0, Math.round((now - t) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** Coarse bucket so near-in-time events for the same person/case collapse. */
function bucketTime(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "other";
  const hours = (now - t) / 3_600_000;
  if (hours < 6) return "recent";
  if (hours < 36) return "day";
  if (hours < 96) return "few-days";
  return "older";
}

/** Actions that must never appear in the shared home feed. */
const HIDDEN = new Set([
  "arg_edge_recorded",
  "ai_cap_refused",
  "ai_cap_alert_80",
  "ai_gateway_error",
  "ai_gateway_zdr_missing",
  "graph_spine_backfill",
  "session_code_failed",
  "session_code_revealed",
  "session_code_rotated",
  "passcode_reveal",
  "passcode_reset",
  "passcode_changed",
  "passcode_chosen",
  "member_starter_rotated",
  "coach_starter_rotated",
  "audio_backstop_cleanup",
  "person_private_data_deleted",
  "admin_privacy_delete",
  "season_transcripts_deleted",
  "citation_check_failed",
  "prediction_brier_computed",
  "calibrated_judge_synced",
  "judge_card_analysed",
  "judge_card_analysis_overridden",
  "model_settings_updated",
  "wire_edge_skip",
  "record_edge_skip",
  // Personal learning (Wave 7 privacy): not on the shared feed
  "score_prediction_saved",
  "socratic_answered",
  "socratic_outcome",
  "socratic_outcomes_opened",
  "flashcard",
  "review",
  "pin",
  // Tech-only material / book requests
  "book_request_uploaded",
  "book_request_updated",
]);

const TEMPLATES: Record<string, Template> = {
  claim_map_version: {
    sentence: (e, ctx) => {
      const caseId = metaCaseId(e);
      const label = caseLabel(caseId, ctx.casesById) ?? "a case";
      const version = metaStr(e.meta, "version");
      const text = version
        ? `${ctx.personName} updated the claim map for ${label} (version ${version})`
        : `${ctx.personName} updated the claim map for ${label}`;
      return {
        text,
        href: caseId ? `/case-brain/${caseId}` : "/case-brain",
        caseId,
      };
    },
  },
  claim_map_confirmed: {
    sentence: (e, ctx) => {
      const caseId = metaCaseId(e);
      const label = caseLabel(caseId, ctx.casesById) ?? "a case";
      return {
        text: `${ctx.personName} confirmed the claim map for ${label}`,
        href: caseId ? `/case-brain/${caseId}` : "/case-brain",
        caseId,
      };
    },
  },
  claim_edited: {
    sentence: (e, ctx) => {
      const caseId = metaCaseId(e);
      const label = caseLabel(caseId, ctx.casesById) ?? "a case";
      return {
        text: `${ctx.personName} edited a claim on ${label}`,
        href: caseId ? `/case-brain/${caseId}` : "/case-brain",
        caseId,
      };
    },
  },
  claim_shell_created: {
    sentence: (e, ctx) => {
      const caseId = metaCaseId(e);
      const label = caseLabel(caseId, ctx.casesById) ?? "a case";
      return {
        text: `${ctx.personName} started a claim on ${label}`,
        href: caseId ? `/case-brain/${caseId}` : "/case-brain",
        caseId,
      };
    },
  },
  support_edited: {
    sentence: (e, ctx) => {
      const caseId = metaCaseId(e);
      const label = caseLabel(caseId, ctx.casesById) ?? "a case";
      return {
        text: `${ctx.personName} updated a support on ${label}`,
        href: caseId ? `/case-brain/${caseId}` : "/case-brain",
        caseId,
      };
    },
  },
  counterclaim_edited: {
    sentence: (e, ctx) => {
      const caseId = metaCaseId(e);
      const label = caseLabel(caseId, ctx.casesById) ?? "a case";
      return {
        text: `${ctx.personName} updated a counterclaim on ${label}`,
        href: caseId ? `/case-brain/${caseId}` : "/case-brain",
        caseId,
      };
    },
  },
  backing_edited: {
    sentence: (e, ctx) => {
      const caseId = metaCaseId(e);
      const label = caseLabel(caseId, ctx.casesById) ?? "a case";
      return {
        text: `${ctx.personName} updated a backing on ${label}`,
        href: caseId ? `/case-brain/${caseId}` : "/case-brain",
        caseId,
      };
    },
  },
  proposal_created: {
    sentence: (e, ctx) => {
      const caseId = metaCaseId(e);
      const label = caseLabel(caseId, ctx.casesById) ?? "a case";
      return {
        text: `${ctx.personName} proposed a Truth Source idea for ${label}`,
        href: caseId ? `/case-brain/${caseId}` : "/case-brain",
        caseId,
      };
    },
  },
  proposal_accept: {
    sentence: (e, ctx) => {
      const caseId = metaCaseId(e);
      const label = caseLabel(caseId, ctx.casesById) ?? "a case";
      return {
        text: `${ctx.personName} accepted a Truth Source for ${label}`,
        href: caseId ? `/case-brain/${caseId}` : "/case-brain",
        caseId,
      };
    },
  },
  proposal_reject: {
    sentence: (e, ctx) => {
      const caseId = metaCaseId(e);
      const label = caseLabel(caseId, ctx.casesById) ?? "a case";
      return {
        text: `${ctx.personName} rejected a Truth Source for ${label}`,
        href: caseId ? `/case-brain/${caseId}` : "/case-brain",
        caseId,
      };
    },
  },
  proposal_edit: {
    sentence: (e, ctx) => {
      const caseId = metaCaseId(e);
      const label = caseLabel(caseId, ctx.casesById) ?? "a case";
      return {
        text: `${ctx.personName} edited a Truth Source proposal for ${label}`,
        href: caseId ? `/case-brain/${caseId}` : "/case-brain",
        caseId,
      };
    },
  },
  truth_accepted: {
    sentence: (e, ctx) => {
      const caseId = metaCaseId(e);
      const label = caseLabel(caseId, ctx.casesById) ?? "a case";
      return {
        text: `${ctx.personName} added a Truth Source on ${label}`,
        href: caseId ? `/case-brain/${caseId}` : "/case-brain",
        caseId,
      };
    },
  },
  decision_accept: {
    sentence: (e, ctx) => {
      const caseId = metaCaseId(e);
      const label = caseLabel(caseId, ctx.casesById) ?? "a case";
      return {
        text: `${ctx.personName} accepted a proposal for ${label}`,
        href: caseId ? `/case-brain/${caseId}` : "/case-brain",
        caseId,
      };
    },
  },
  decision_reject: {
    sentence: (e, ctx) => {
      const caseId = metaCaseId(e);
      const label = caseLabel(caseId, ctx.casesById) ?? "a case";
      return {
        text: `${ctx.personName} rejected a proposal for ${label}`,
        href: caseId ? `/case-brain/${caseId}` : "/case-brain",
        caseId,
      };
    },
  },
  decision_edit: {
    sentence: (e, ctx) => {
      const caseId = metaCaseId(e);
      const label = caseLabel(caseId, ctx.casesById) ?? "a case";
      return {
        text: `${ctx.personName} edited a proposal decision for ${label}`,
        href: caseId ? `/case-brain/${caseId}` : "/case-brain",
        caseId,
      };
    },
  },
  drive_sync: {
    sentence: (e, ctx) => {
      const seen =
        metaStr(e.meta, "filesSeen") ??
        metaStr(e.meta, "files_seen") ??
        metaStr(e.meta, "seen");
      const processed =
        metaStr(e.meta, "filesProcessed") ??
        metaStr(e.meta, "files_processed") ??
        metaStr(e.meta, "processed");
      const newCount = metaStr(e.meta, "newFileCount");
      const who =
        ctx.personName === "System" || ctx.personName === "system"
          ? "Drive sync"
          : ctx.personName;
      let text = `${who} ran a Drive sync`;
      if (newCount && Number(newCount) > 0) {
        text = `${newCount} new file${Number(newCount) === 1 ? "" : "s"} arrived from the Drive`;
      } else if (processed && seen) {
        text = `${who} synced the Drive: ${processed} of ${seen} files processed`;
      } else if (processed) {
        text = `${who} synced the Drive: ${processed} files processed`;
      }
      return { text, href: "/library", caseId: null };
    },
  },
  drive_sync_failed: {
    sentence: (e, ctx) => {
      const who = ctx.personName === "system" ? "Drive sync" : ctx.personName;
      return {
        text: `${who} could not finish a Drive sync`,
        href: "/library",
        caseId: null,
      };
    },
  },
  drive_crux_upload: {
    sentence: (e, ctx) => ({
      text: `${ctx.personName} uploaded a file to the Drive`,
      href: "/library",
      caseId: null,
    }),
  },
  drive_sorted: {
    sentence: (e, ctx) => ({
      text: `${ctx.personName} sorted a Drive file into the library`,
      href: "/library/sorting",
      caseId: null,
    }),
  },
  highlight_to_proposal: {
    sentence: (e, ctx) => {
      const caseId = metaCaseId(e);
      const label = caseLabel(caseId, ctx.casesById);
      return {
        text: label
          ? `${ctx.personName} sent a reading highlight to Evidence Library for ${label}`
          : `${ctx.personName} sent a reading highlight to Evidence Library`,
        href: caseId ? `/case-brain/${caseId}` : "/library",
        caseId,
      };
    },
  },
  highlight_to_flashcard: {
    sentence: (e, ctx) => ({
      text: `${ctx.personName} made a flashcard from a reading highlight`,
      href: "/revision/flashcards",
      caseId: metaCaseId(e),
    }),
  },
  highlight_created: {
    sentence: (e, ctx) => ({
      text: `${ctx.personName} highlighted a reading passage`,
      href: "/library",
      caseId: null,
    }),
  },
  comment_created: {
    sentence: (e, ctx) => ({
      text: `${ctx.personName} commented in the reading room`,
      href: "/library",
      caseId: null,
    }),
  },
  one_pager_drafted: {
    sentence: (e, ctx) => {
      const caseId = metaCaseId(e);
      const label = caseLabel(caseId, ctx.casesById) ?? "a case";
      return {
        text: `${ctx.personName} drafted a one pager for ${label}`,
        href: "/revision/one-pagers",
        caseId,
      };
    },
  },
  case_role_set: {
    sentence: (e, ctx) => {
      const caseId = metaCaseId(e);
      const label = caseLabel(caseId, ctx.casesById) ?? "a case";
      const role = metaStr(e.meta, "role");
      return {
        text: role
          ? `${ctx.personName} set a role (${role.replace(/_/g, " ")}) on ${label}`
          : `${ctx.personName} updated roles on ${label}`,
        href: "/team",
        caseId,
      };
    },
  },
  assignment_created: {
    sentence: (e, ctx) => ({
      text: `${ctx.personName} created a team assignment`,
      href: "/team",
      caseId: metaCaseId(e),
    }),
  },
  team_doc_imported: {
    sentence: (e, ctx) => {
      const caseId = metaCaseId(e);
      const label = caseLabel(caseId, ctx.casesById);
      return {
        text: label
          ? `${ctx.personName} imported a team doc for ${label}`
          : `${ctx.personName} imported a team doc`,
        href: caseId ? `/case-brain/${caseId}` : "/import-team-doc",
        caseId,
      };
    },
  },
  attendance_set: {
    sentence: (e, ctx) => ({
      text: `${ctx.personName} updated practice attendance`,
      href: "/practice",
      caseId: null,
    }),
  },
  attendance_self: {
    sentence: (e, ctx) => ({
      text: `${ctx.personName} checked in for practice`,
      href: "/practice",
      caseId: null,
    }),
  },
  attendance_confirmed: {
    sentence: (e, ctx) => ({
      text: `${ctx.personName} confirmed attendance`,
      href: "/practice",
      caseId: null,
    }),
  },
  attendance_marked: {
    sentence: (e, ctx) => ({
      text: `${ctx.personName} marked attendance`,
      href: "/practice",
      caseId: null,
    }),
  },
  practice_invite_accepted: {
    sentence: (e, ctx) => ({
      text: `${ctx.personName} accepted a practice invite`,
      href: "/practice",
      caseId: null,
    }),
  },
  practice_team_invited: {
    sentence: (e, ctx) => ({
      text: `${ctx.personName} invited a team to practice`,
      href: "/practice",
      caseId: null,
    }),
  },
  opposing_added: {
    sentence: (e, ctx) => {
      const caseId = metaCaseId(e);
      const label = caseLabel(caseId, ctx.casesById) ?? "a case";
      return {
        text: `${ctx.personName} added an opposing position for ${label}`,
        href: caseId ? `/case-brain/${caseId}` : "/case-brain",
        caseId,
      };
    },
  },
  principle_saved: {
    sentence: (e, ctx) => ({
      text: `${ctx.personName} saved a team principle`,
      href: "/team",
      caseId: metaCaseId(e),
    }),
  },
  chat_idea_queued: {
    sentence: (e, ctx) => ({
      text: `${ctx.personName} queued a chat idea for Evidence Library`,
      href: "/team/chat",
      caseId: metaCaseId(e),
    }),
  },
  competition_log_added: {
    sentence: (e, ctx) => ({
      text: `${ctx.personName} added a competition log entry`,
      href: "/admin/competition",
      caseId: null,
    }),
  },
  research_night: {
    sentence: (e, ctx) => ({
      text: `${ctx.personName === "system" ? "Cruxy" : ctx.personName} finished a research night run`,
      href: "/library",
      caseId: metaCaseId(e),
    }),
  },
  publish_version: {
    sentence: (e, ctx) => {
      const caseId = metaCaseId(e);
      const label = caseLabel(caseId, ctx.casesById) ?? "a case";
      return {
        text: `${ctx.personName} published a claim map for ${label}`,
        href: caseId ? `/case-brain/${caseId}` : "/case-brain",
        caseId,
      };
    },
  },
  confirm_version: {
    sentence: (e, ctx) => {
      const caseId = metaCaseId(e);
      const label = caseLabel(caseId, ctx.casesById) ?? "a case";
      return {
        text: `${ctx.personName} confirmed a claim map for ${label}`,
        href: caseId ? `/case-brain/${caseId}` : "/case-brain",
        caseId,
      };
    },
  },
};

/** Map proposal_accept style actions that are logged as proposal_${verdict}. */
function resolveTemplate(action: string): Template | null {
  if (TEMPLATES[action]) return TEMPLATES[action]!;
  if (action.startsWith("proposal_")) {
    const verdict = action.slice("proposal_".length);
    return TEMPLATES[`proposal_${verdict}`] ?? TEMPLATES.proposal_created!;
  }
  if (action.startsWith("decision_")) {
    const verdict = action.slice("decision_".length);
    return TEMPLATES[`decision_${verdict}`] ?? null;
  }
  return null;
}

export function isFeedActionVisible(action: string): boolean {
  if (HIDDEN.has(action)) return false;
  if (action.startsWith("ai_")) return false;
  return resolveTemplate(action) != null;
}

/**
 * Format raw activity rows into plain linked sentences.
 * Groups near-duplicate proposal_created for the same person+case+time bucket.
 */
export function buildActivityFeed(args: {
  entries: ActivityLogEntry[];
  personNames: Map<string, string>;
  cases: FeedCaseLookup[];
  now?: number;
  limit?: number;
}): FeedLine[] {
  const now = args.now ?? Date.now();
  const casesById = new Map(args.cases.map((c) => [c.id, c]));
  const limit = args.limit ?? 12;

  type Draft = {
    entry: ActivityLogEntry;
    personName: string;
    text: string;
    href: string | null;
    caseId: string | null;
    caseLabel: string | null;
    groupKey: string;
  };

  const drafts: Draft[] = [];
  for (const entry of args.entries) {
    if (!isFeedActionVisible(entry.action)) continue;
    const template = resolveTemplate(entry.action);
    if (!template) continue;
    const personName = entry.person_id
      ? (args.personNames.get(entry.person_id) ?? "Someone")
      : "System";
    const formatted = template.sentence(entry, {
      personName,
      casesById,
      now,
    });
    if (!formatted) continue;
    const cLabel = caseLabel(formatted.caseId, casesById);
    drafts.push({
      entry,
      personName,
      text: formatted.text,
      href: formatted.href,
      caseId: formatted.caseId,
      caseLabel: cLabel,
      groupKey: [
        entry.person_id ?? "system",
        formatted.caseId ?? "none",
        entry.action.startsWith("proposal_")
          ? "proposal_batch"
          : entry.action,
        bucketTime(entry.at, now),
      ].join("|"),
    });
  }

  // Collapse batched Truth Source proposals into one line.
  const grouped = new Map<string, Draft[]>();
  for (const d of drafts) {
    const list = grouped.get(d.groupKey) ?? [];
    list.push(d);
    grouped.set(d.groupKey, list);
  }

  const lines: FeedLine[] = [];
  for (const [, group] of grouped) {
    const first = group[0]!;
    const when = relativeTime(first.entry.at, now);
    if (
      group.length > 1 &&
      first.groupKey.includes("|proposal_batch|")
    ) {
      const label = first.caseLabel ?? "a case";
      const n = group.length;
      const text = `${n} new Truth Source ideas for ${label} from ${first.personName}${when ? `, ${when}` : ""}`;
      lines.push({
        id: first.entry.id,
        text,
        href: first.href,
        personName: first.personName,
        at: first.entry.at,
        caseId: first.caseId,
        caseLabel: first.caseLabel,
        groupKey: first.groupKey,
      });
      continue;
    }
    for (const d of group) {
      lines.push({
        id: d.entry.id,
        text: when ? `${d.text}, ${when}` : d.text,
        href: d.href,
        personName: d.personName,
        at: d.entry.at,
        caseId: d.caseId,
        caseLabel: d.caseLabel,
        groupKey: d.groupKey,
      });
    }
  }

  lines.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return lines.slice(0, limit);
}
