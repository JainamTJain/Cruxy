-- Workstream G Wave 5: drills (Q&A routing) + APPE scoring sheet versions from Drive.
-- RLS on; deny anon/authenticated by default.

create table if not exists scoring_sheet_versions (
  id uuid primary key default gen_random_uuid(),
  source_path text not null,
  source_label text not null,
  checksum text not null,
  status text not null
    check (status in ('active', 'pending', 'superseded')),
  diff_summary text null,
  confirmed_at timestamptz null,
  confirmed_by uuid null references people (id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists scoring_sheet_versions_one_active
  on scoring_sheet_versions (status)
  where status = 'active';

create table if not exists scoring_guide_sections (
  id uuid primary key default gen_random_uuid(),
  sheet_version_id uuid not null references scoring_sheet_versions (id) on delete cascade,
  kind text not null check (kind in ('band', 'guide')),
  title text not null,
  body text not null,
  sort_ord int not null,
  created_at timestamptz not null default now()
);

create index if not exists scoring_guide_sections_version_idx
  on scoring_guide_sections (sheet_version_id, sort_ord);

-- Link existing scoring_card_items to a sheet version when present.
alter table scoring_card_items
  add column if not exists sheet_version_id uuid null references scoring_sheet_versions (id) on delete set null;

create table if not exists qa_routing_assignments (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams (id) on delete cascade,
  question_kind text not null
    check (question_kind in ('facts', 'framework_pushback', 'change_facts', 'practical')),
  person_id uuid not null references people (id) on delete cascade,
  updated_at timestamptz not null default now(),
  updated_by uuid null references people (id) on delete set null,
  unique (team_id, question_kind)
);

create index if not exists qa_routing_assignments_team_idx
  on qa_routing_assignments (team_id);

alter table scoring_sheet_versions enable row level security;
alter table scoring_guide_sections enable row level security;
alter table qa_routing_assignments enable row level security;

revoke all on scoring_sheet_versions from anon, authenticated;
revoke all on scoring_guide_sections from anon, authenticated;
revoke all on qa_routing_assignments from anon, authenticated;
