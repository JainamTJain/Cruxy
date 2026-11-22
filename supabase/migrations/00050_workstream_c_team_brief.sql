-- Workstream C (Wave 8): Team Brief + Evidence Library.
-- One brief per team per case; mode own_doc | build_in_crux;
-- suggestions checklist for own-doc accepts; fact-only library candidates.

create table if not exists team_briefs (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  case_id uuid not null references cases(id) on delete cascade,
  mode text not null default 'build_in_crux'
    check (mode in ('own_doc', 'build_in_crux')),
  drive_file_id text,
  drive_title text,
  thesis text,
  stance_version int not null default 0,
  confirmed_by uuid[] not null default '{}',
  drift_flag boolean not null default false,
  drift_detail text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references people(id),
  unique (team_id, case_id)
);

create table if not exists brief_checklist_items (
  id uuid primary key default gen_random_uuid(),
  brief_id uuid not null references team_briefs(id) on delete cascade,
  proposal_id uuid references proposals(id) on delete set null,
  text text not null,
  kind text not null default 'suggestion'
    check (kind in ('suggestion', 'evidence', 'question', 'counter', 'inspired')),
  done boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references people(id),
  done_at timestamptz,
  done_by uuid references people(id)
);

create table if not exists library_candidates (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  case_id uuid not null references cases(id) on delete cascade,
  brief_id uuid references team_briefs(id) on delete set null,
  text text not null,
  citation text,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected')),
  source_passage_id uuid,
  created_at timestamptz not null default now(),
  created_by uuid references people(id),
  decided_at timestamptz,
  decided_by uuid references people(id)
);

-- Allow stance drift on existing drift_flags.
alter table drift_flags drop constraint if exists drift_flags_source_check;
alter table drift_flags
  add constraint drift_flags_source_check
  check (source in ('alignment', 'transcript', 'manual', 'stance'));

alter table team_briefs enable row level security;
alter table brief_checklist_items enable row level security;
alter table library_candidates enable row level security;

revoke all on table team_briefs from anon, authenticated;
revoke all on table brief_checklist_items from anon, authenticated;
revoke all on table library_candidates from anon, authenticated;

create index if not exists team_briefs_case_idx on team_briefs (case_id);
create index if not exists brief_checklist_brief_idx on brief_checklist_items (brief_id);
create index if not exists library_candidates_case_idx
  on library_candidates (case_id, status);
