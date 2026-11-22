import type { NotifyKindsSettings } from "@/lib/notify/kinds";

export type NotificationSettings = {
  person_id: string;
  push_enabled: boolean;
  kinds: NotifyKindsSettings;
  quiet_hours_start: number | null;
  quiet_hours_end: number | null;
  updated_at: string;
};

export type PushSubscriptionRow = {
  id: string;
  person_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  created_at: string;
};

export type CalmRoutineLog = {
  id: string;
  person_id: string;
  round_id: string | null;
  case_id: string | null;
  completed: boolean;
  skipped: boolean;
  created_at: string;
};
