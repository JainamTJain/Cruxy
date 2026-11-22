-- Wave 9 H: after the regional (results, retro, Nationals prep, archive, handoff).
-- Round logs stay in competition_logs (C / Track 6). Field names agreed in wave9.md.

create table if not exists seasons (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  status text not null default 'active'
    check (status in ('active', 'archived')),
  competition_id uuid references competitions (id) on delete set null,
  archived_at timestamptz,
  archive_storage_path text,
  created_at timestamptz not null default now(),
  created_by uuid references people (id) on delete set null
);

alter table seasons enable row level security;
revoke all on table seasons from anon, authenticated;

create index if not exists seasons_status_idx on seasons (status);

-- Team-level regional result summary (entered by Dr. B or Jainam only).
create table if not exists competition_team_results (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons (id) on delete cascade,
  competition_id uuid references competitions (id) on delete set null,
  team_id uuid not null references teams (id) on delete cascade,
  rounds_played int not null default 0 check (rounds_played >= 0),
  wins int not null default 0 check (wins >= 0),
  losses int not null default 0 check (losses >= 0),
  ties int not null default 0 check (ties >= 0),
  advanced boolean not null default false,
  advancement_note text,
  notes text,
  entered_by uuid references people (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_id, team_id)
);

alter table competition_team_results enable row level security;
revoke all on table competition_team_results from anon, authenticated;

create index if not exists competition_team_results_season_idx
  on competition_team_results (season_id);

-- Guided team retrospective.
create table if not exists season_retros (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons (id) on delete cascade,
  team_id uuid not null references teams (id) on delete cascade,
  what_worked text not null default '',
  what_to_change text not null default '',
  cases_that_landed text not null default '',
  arguments_that_landed text not null default '',
  status text not null default 'draft'
    check (status in ('draft', 'published')),
  created_by uuid references people (id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (season_id, team_id)
);

alter table season_retros enable row level security;
revoke all on table season_retros from anon, authenticated;

-- Judge-comment themes with citations back to competition_logs.
create table if not exists retro_comment_themes (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons (id) on delete cascade,
  team_id uuid not null references teams (id) on delete cascade,
  theme text not null,
  summary text not null,
  citation_log_ids uuid[] not null default '{}',
  citation_quotes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references people (id) on delete set null
);

alter table retro_comment_themes enable row level security;
revoke all on table retro_comment_themes from anon, authenticated;

create index if not exists retro_comment_themes_season_team_idx
  on retro_comment_themes (season_id, team_id);

-- Nationals prep checklist (shown when the team advanced).
create table if not exists nationals_checklist_items (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons (id) on delete cascade,
  team_id uuid not null references teams (id) on delete cascade,
  label text not null,
  detail text not null default '',
  done boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table nationals_checklist_items enable row level security;
revoke all on table nationals_checklist_items from anon, authenticated;

create index if not exists nationals_checklist_season_team_idx
  on nationals_checklist_items (season_id, team_id);

-- Editable next-year handoff guide.
create table if not exists season_handoffs (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons (id) on delete cascade,
  body text not null default '',
  who_did_what jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references people (id) on delete set null,
  unique (season_id)
);

alter table season_handoffs enable row level security;
revoke all on table season_handoffs from anon, authenticated;

comment on table seasons is
  'Wave 9 H: season container for regional results, retro, archive and handoff.';
comment on table competition_team_results is
  'Wave 9 H: how each USC team did; entered by coach or tech admin only. Never invented.';
comment on table season_retros is
  'Wave 9 H: guided team retrospective answers.';
comment on table retro_comment_themes is
  'Wave 9 H: themes from competition_logs.judge_comments with log citations.';
comment on table nationals_checklist_items is
  'Wave 9 H: what changes for Nationals when a team advances.';
comment on table season_handoffs is
  'Wave 9 H: what-we-learned guide and who-did-what for next year.';
