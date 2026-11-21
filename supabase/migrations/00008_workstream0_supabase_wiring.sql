-- Workstream 0: columns and tables needed by the Supabase repository path.
-- Applied after 00001–00007. Never edit those applied migrations.

alter table assignments
  add column if not exists target_kind text not null default 'case',
  add column if not exists target_id text;

alter table chats
  add column if not exists team_id uuid references teams(id);

-- Key/value bag for server-only ephemeral state (tech reauth stamp, etc.)
create table if not exists app_kv (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table app_kv enable row level security;
revoke all on app_kv from anon;
revoke all on app_kv from authenticated;

-- Moderator drill: questions already seen this session (mirrors sample drill_session_seen)
create table if not exists drill_session_seen (
  person_id uuid not null references people(id) on delete cascade,
  question_id uuid not null references questions(id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (person_id, question_id)
);

alter table drill_session_seen enable row level security;
revoke all on drill_session_seen from anon;
revoke all on drill_session_seen from authenticated;

-- Brute-force tracking for practice session join codes
create table if not exists session_code_attempts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  ip_hash text not null,
  attempted_at timestamptz not null default now()
);

create index if not exists session_code_attempts_session_idx
  on session_code_attempts (session_id, attempted_at desc);

alter table session_code_attempts enable row level security;
revoke all on session_code_attempts from anon;
revoke all on session_code_attempts from authenticated;

-- Idempotent auth_codes bootstrap: at most one shared starter and one admin per person
create unique index if not exists auth_codes_shared_starter_uidx
  on auth_codes (kind)
  where kind = 'starter' and person_id is null;

create unique index if not exists auth_codes_admin_person_uidx
  on auth_codes (person_id)
  where kind = 'admin' and person_id is not null;

-- Per-person starter (Dr. B coach starter): one starter row per person_id
create unique index if not exists auth_codes_person_starter_uidx
  on auth_codes (person_id)
  where kind = 'starter' and person_id is not null;
