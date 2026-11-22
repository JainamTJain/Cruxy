-- Workstream E Wave 8: roles any-case + Regionals lock, chat reads.
-- Migration reserved in wave8.md: E = 00049.

-- Person+team: "any case is fine" instead of ranking
create table if not exists case_role_any_case (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  any_case_ok boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references people(id) on delete set null,
  unique (person_id, team_id)
);

alter table case_role_any_case enable row level security;
revoke all on table case_role_any_case from anon, authenticated;

comment on table case_role_any_case is
  'Roles board: person marks any case is fine for fair random lead fill.';

-- Lock snapshot for Regionals 2026 (immutable copy of roles)
create table if not exists case_role_lock_snapshots (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  season_key text not null,
  label text not null default 'Regionals 2026',
  locked_at timestamptz not null default now(),
  locked_by uuid references people(id) on delete set null,
  roles jsonb not null default '[]'::jsonb,
  unique (team_id, season_key)
);

alter table case_role_lock_snapshots enable row level security;
revoke all on table case_role_lock_snapshots from anon, authenticated;

comment on table case_role_lock_snapshots is
  'Frozen role grid for a season (e.g. regionals-2026). Live edits blocked while locked.';

alter table teams
  add column if not exists roles_locked_season text;

-- Chat unread cursor per person per conversation
create table if not exists chat_reads (
  person_id uuid not null references people(id) on delete cascade,
  chat_id uuid not null references chats(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (person_id, chat_id)
);

alter table chat_reads enable row level security;
revoke all on table chat_reads from anon, authenticated;

comment on table chat_reads is
  'Last time a person opened a chat conversation; unread = messages after this.';

-- Optional title/description columns on chats for named conversations
alter table chats
  add column if not exists title text,
  add column if not exists purpose text,
  add column if not exists audience text,
  add column if not exists case_id uuid references cases(id) on delete set null,
  add column if not exists kind text;
