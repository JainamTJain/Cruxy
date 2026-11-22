-- Workstream I: highlights and comments on working documents
-- (team_doc passages and Crux sections). Separate from library passages.

create table if not exists working_annotations (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  target_kind text not null
    check (target_kind in ('passage', 'section')),
  target_id text not null,
  kind text not null
    check (kind in ('highlight', 'comment')),
  range text not null,
  body text,
  person_id uuid not null references people(id),
  created_at timestamptz not null default now(),
  created_by uuid references people(id)
);

create index if not exists working_annotations_case_team_idx
  on working_annotations (case_id, team_id, created_at desc);

create index if not exists working_annotations_target_idx
  on working_annotations (team_id, target_kind, target_id);

alter table working_annotations enable row level security;
revoke all on table working_annotations from anon, authenticated;

comment on table working_annotations is
  'Per-person highlights and comments on a team working document.';
