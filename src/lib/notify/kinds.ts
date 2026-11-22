/**
 * Wave 9 J notification kinds for settings, push and email.
 * Existing in-app `notifications.kind` values map into these buckets.
 */

export const NOTIFY_KINDS = [
  "mention",
  "role_or_task",
  "session_soon",
  "brief_suggestion",
  "dec5_reminder",
] as const;

export type NotifyKind = (typeof NOTIFY_KINDS)[number];

export type EmailChannel = "off" | "instant" | "digest";

export type KindChannels = {
  push: boolean;
  email: EmailChannel;
};

export type NotifyKindsSettings = Record<NotifyKind, KindChannels>;

export const DEFAULT_KIND_SETTINGS: NotifyKindsSettings = {
  mention: { push: true, email: "digest" },
  role_or_task: { push: true, email: "instant" },
  session_soon: { push: true, email: "instant" },
  brief_suggestion: { push: true, email: "digest" },
  dec5_reminder: { push: true, email: "instant" },
};

export const KIND_LABELS: Record<NotifyKind, string> = {
  mention: "Mentions in chat",
  role_or_task: "Roles and tasks",
  session_soon: "Practice starting soon",
  brief_suggestion: "Team Brief suggestions",
  dec5_reminder: "Dec 5 reminders",
};

/** Map free-form notification.kind strings into a settings bucket. */
export function bucketForStoredKind(kind: string): NotifyKind | null {
  const k = kind.toLowerCase();
  if (
    k === "chat_mention" ||
    k === "mention" ||
    k === "discussion_mention"
  ) {
    return "mention";
  }
  if (
    k === "case_role" ||
    k === "role_or_task" ||
    k === "task" ||
    k === "assignment"
  ) {
    return "role_or_task";
  }
  if (
    k === "practice_invite" ||
    k === "session_soon" ||
    k === "session_starting"
  ) {
    return "session_soon";
  }
  if (
    k === "brief_suggestion" ||
    k === "team_brief_suggestion" ||
    k === "suggestion"
  ) {
    return "brief_suggestion";
  }
  if (k === "dec5_reminder" || k === "regional_reminder") return "dec5_reminder";
  return null;
}
