/** Workstream E: discussion in place on the case. */

export type DiscussionThreadKind =
  | "annotation"
  | "suggestion"
  | "one_pager_field"
  | "general";

export type DiscussionThread = {
  id: string;
  team_id: string;
  case_id: string;
  kind: DiscussionThreadKind;
  target_id: string;
  title: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  reply_count: number;
  last_reply_at: string | null;
  last_body_preview: string | null;
};

export type DiscussionReply = {
  id: string;
  thread_id: string;
  person_id: string;
  person_name: string | null;
  body: string;
  mention_ids: string[];
  created_at: string;
};

export type DiscussionCatchUp = {
  since: string | null;
  decided: Array<{ text: string; threadId: string; href: string }>;
  open: Array<{ text: string; threadId: string; href: string }>;
  summary: string;
  stub: boolean;
};

export function discussionAnchorId(
  kind: DiscussionThreadKind,
  targetId: string,
): string {
  const safe = targetId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
  return `disc-${kind}-${safe}`;
}

export function discussionHref(input: {
  caseId: string;
  teamId: string;
  kind: DiscussionThreadKind;
  targetId: string;
  threadId?: string;
}): string {
  const tab =
    input.kind === "annotation"
      ? "reading"
      : input.kind === "suggestion"
        ? "working"
        : input.kind === "one_pager_field"
          ? "one_pager"
          : "reading";
  const params = new URLSearchParams({
    tab,
    team: input.teamId,
    discussion: "1",
  });
  if (input.threadId) params.set("thread", input.threadId);
  params.set("jump", discussionAnchorId(input.kind, input.targetId));
  return `/case-brain/${input.caseId}?${params.toString()}`;
}
