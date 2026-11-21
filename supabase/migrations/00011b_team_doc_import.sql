-- Workstream H Wave 4: team doc import
-- Tracks imports so re-import only adds what changed; citation ids on proposals.

alter table proposals
  add column if not exists citation_ids text[] not null default '{}';

create table if not exists team_doc_imports (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id),
  case_id uuid not null references cases(id),
  source_kind text not null check (source_kind in ('drive', 'paste')),
  drive_file_id text,
  title text not null,
  checksum text not null,
  text_preview text,
  created_at timestamptz not null default now(),
  created_by uuid references people(id),
  updated_at timestamptz not null default now()
);

create unique index if not exists team_doc_imports_team_drive_uidx
  on team_doc_imports (team_id, drive_file_id)
  where drive_file_id is not null;

create index if not exists team_doc_imports_team_case_idx
  on team_doc_imports (team_id, case_id);

alter table team_doc_imports enable row level security;
revoke all on table team_doc_imports from anon, authenticated;

create table if not exists team_doc_passages (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references team_doc_imports(id) on delete cascade,
  team_id uuid not null references teams(id),
  case_id uuid not null references cases(id),
  anchor text not null,
  text text not null,
  ord int not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references people(id)
);

create index if not exists team_doc_passages_import_idx
  on team_doc_passages (import_id, ord);

alter table team_doc_passages enable row level security;
revoke all on table team_doc_passages from anon, authenticated;
