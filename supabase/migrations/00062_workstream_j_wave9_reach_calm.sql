-- Wave 9 J: reach (push + email digest settings) and calm routine logs.
-- Deny-by-default RLS; all access is server-side via the secret key.

create table if not exists notification_settings (
  person_id uuid primary key references people (id) on delete cascade,
  -- Master push switch after the person taps "Turn on alerts".
  push_enabled boolean not null default false,
  -- Per kind: push on/off and email off | instant | digest.
  kinds jsonb not null default '{
    "mention": {"push": true, "email": "digest"},
    "role_or_task": {"push": true, "email": "instant"},
    "session_soon": {"push": true, "email": "instant"},
    "brief_suggestion": {"push": true, "email": "digest"},
    "dec5_reminder": {"push": true, "email": "instant"}
  }'::jsonb,
  -- Quiet hours as minutes from midnight (America/Los_Angeles local intent).
  -- null / null means quiet hours are off.
  quiet_hours_start smallint,
  quiet_hours_end smallint,
  updated_at timestamptz not null default now(),
  constraint notification_settings_quiet_start check (
    quiet_hours_start is null or (quiet_hours_start >= 0 and quiet_hours_start < 1440)
  ),
  constraint notification_settings_quiet_end check (
    quiet_hours_end is null or (quiet_hours_end >= 0 and quiet_hours_end < 1440)
  )
);

alter table notification_settings enable row level security;
revoke all on table notification_settings from anon, authenticated;

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  unique (endpoint)
);

create index if not exists push_subscriptions_person_idx
  on push_subscriptions (person_id);

alter table push_subscriptions enable row level security;
revoke all on table push_subscriptions from anon, authenticated;

-- Items waiting for a daily digest email.
create table if not exists notification_email_queue (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people (id) on delete cascade,
  notification_id uuid not null references notifications (id) on delete cascade,
  kind text not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists notification_email_queue_pending_idx
  on notification_email_queue (person_id)
  where sent_at is null;

alter table notification_email_queue enable row level security;
revoke all on table notification_email_queue from anon, authenticated;

-- Optional log of calm routine offers (completed or skipped).
create table if not exists calm_routine_logs (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people (id) on delete cascade,
  round_id uuid,
  case_id uuid,
  completed boolean not null default false,
  skipped boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists calm_routine_logs_person_idx
  on calm_routine_logs (person_id, created_at desc);

alter table calm_routine_logs enable row level security;
revoke all on table calm_routine_logs from anon, authenticated;
