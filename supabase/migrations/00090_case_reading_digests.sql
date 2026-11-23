-- Extra reading a team imports on the case page (a file, a web link or
-- pasted text) is digested by Cruxy: a short card (summary, key points,
-- usable ideas, judge questions) plus the full text split into passages that
-- Cruxy searches when it critiques, researches ideas or answers on that case.
-- Team-private like the import itself.

create table if not exists case_reading_digests (
  import_id uuid primary key references case_reading_imports(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  case_id uuid not null references cases(id) on delete cascade,
  source_url text,
  file_name text,
  chars int not null default 0,
  status text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  digest jsonb,
  error text,
  digested_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists case_reading_passages (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references case_reading_imports(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  case_id uuid not null references cases(id) on delete cascade,
  ord int not null,
  anchor text,
  text text not null
);

create index if not exists case_reading_digests_team_case_idx
  on case_reading_digests (team_id, case_id);
create index if not exists case_reading_passages_team_case_idx
  on case_reading_passages (team_id, case_id);

alter table case_reading_digests enable row level security;
alter table case_reading_passages enable row level security;
revoke all on table case_reading_digests from anon, authenticated;
revoke all on table case_reading_passages from anon, authenticated;

-- Reading room: web readings Cruxy found are read inside Crux too. Their text
-- is fetched once and kept as shared passages (public material).
alter table case_open_readings
  add column if not exists text_status text not null default 'none'
    check (text_status in ('none', 'done', 'failed')),
  add column if not exists text_error text,
  add column if not exists digest jsonb;

create table if not exists case_open_reading_passages (
  id uuid primary key default gen_random_uuid(),
  open_reading_id uuid not null references case_open_readings(id) on delete cascade,
  ord int not null,
  anchor text,
  text text not null
);
create index if not exists case_open_reading_passages_reading_idx
  on case_open_reading_passages (open_reading_id, ord);
alter table case_open_reading_passages enable row level security;
revoke all on table case_open_reading_passages from anon, authenticated;

-- A team's highlights, comments and sticky notes on any reading, kept with
-- the case so Cruxy can turn them into working document suggestions.
create table if not exists reading_annotations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  case_id uuid not null references cases(id) on delete cascade,
  reading_kind text not null check (reading_kind in ('web', 'import')),
  reading_id uuid not null,
  passage_ord int,
  kind text not null check (kind in ('highlight', 'comment', 'note')),
  quote text,
  body text,
  person_id uuid references people(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists reading_annotations_team_case_idx
  on reading_annotations (team_id, case_id);
create index if not exists reading_annotations_reading_idx
  on reading_annotations (reading_kind, reading_id);
alter table reading_annotations enable row level security;
revoke all on table reading_annotations from anon, authenticated;
