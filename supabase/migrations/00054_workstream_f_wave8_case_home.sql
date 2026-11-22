-- Workstream F Wave 8: distilled Drive segments per case.
-- Library shows short organised cards; full original stays one tap away.

create table if not exists file_segments (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references files(id) on delete cascade,
  case_id uuid references cases(id) on delete set null,
  kind text not null
    check (kind in (
      'what',
      'key_point',
      'question',
      'speaker',
      'note'
    )),
  title text not null,
  body text not null,
  speaker_name text,
  ord int not null default 0,
  citation_anchor text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references people(id) on delete set null
);

create index if not exists file_segments_file_idx on file_segments (file_id, ord);
create index if not exists file_segments_case_idx on file_segments (case_id, kind, ord)
  where case_id is not null;

alter table file_segments enable row level security;
revoke all on table file_segments from anon, authenticated;

-- No client policies: deny by default; the server reads with the service role.

comment on table file_segments is
  'Short distilled bits from a Drive file, organised per case. Full file remains on files.';
