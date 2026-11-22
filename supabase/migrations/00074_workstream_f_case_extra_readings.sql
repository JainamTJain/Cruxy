-- Workstream F: Extra reading imports a team can share; other teams opt in.
-- Deny by default; server uses the service role.

create table if not exists case_reading_imports (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  case_id uuid not null references cases(id) on delete cascade,
  title text not null,
  body text not null default '',
  kind text not null default 'import'
    check (kind in (
      'import',
      'fact',
      'quote',
      'example',
      'framework',
      'material'
    )),
  drive_file_id text,
  shared boolean not null default false,
  created_by uuid references people(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists case_reading_imports_case_idx
  on case_reading_imports (case_id, team_id);
create index if not exists case_reading_imports_shared_idx
  on case_reading_imports (case_id)
  where shared = true;

alter table case_reading_imports enable row level security;
revoke all on table case_reading_imports from anon, authenticated;

-- Other teams only see a shared import after they choose to add it.
create table if not exists case_reading_opt_ins (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  import_id uuid not null references case_reading_imports(id) on delete cascade,
  opted_in_by uuid references people(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (team_id, import_id)
);

create index if not exists case_reading_opt_ins_team_idx
  on case_reading_opt_ins (team_id);

alter table case_reading_opt_ins enable row level security;
revoke all on table case_reading_opt_ins from anon, authenticated;

comment on table case_reading_imports is
  'Team-imported Extra reading for a case; optional share flag for other teams.';
comment on table case_reading_opt_ins is
  'A team chose to show another team shared Extra reading.';
