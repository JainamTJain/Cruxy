-- Workstream E: discussion in place on the case (threads on annotations,
-- working-doc suggestions, one-pager fields, plus a general case thread).
-- Reserved migration number: 00069.

create table if not exists discussion_threads (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  case_id uuid not null references cases(id) on delete cascade,
  kind text not null
    check (kind in (
      'annotation',
      'suggestion',
      'one_pager_field',
      'general'
    )),
  -- annotation id, suggestion id, one-pager field key, or 'general'
  target_id text not null,
  title text not null default '',
  created_by uuid references people(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, case_id, kind, target_id)
);

create index if not exists discussion_threads_case_idx
  on discussion_threads (team_id, case_id, updated_at desc);

alter table discussion_threads enable row level security;
revoke all on table discussion_threads from anon, authenticated;

comment on table discussion_threads is
  'Per-team discussion threads attached to work on a case (not cross-team).';

create table if not exists discussion_replies (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references discussion_threads(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  body text not null,
  mention_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  check (char_length(body) >= 1 and char_length(body) <= 2000)
);

create index if not exists discussion_replies_thread_idx
  on discussion_replies (thread_id, created_at);

alter table discussion_replies enable row level security;
revoke all on table discussion_replies from anon, authenticated;

create table if not exists discussion_visits (
  person_id uuid not null references people(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  case_id uuid not null references cases(id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  primary key (person_id, team_id, case_id)
);

alter table discussion_visits enable row level security;
revoke all on table discussion_visits from anon, authenticated;

comment on table discussion_visits is
  'When the person last opened discussion on a case; drives Catch me up.';
