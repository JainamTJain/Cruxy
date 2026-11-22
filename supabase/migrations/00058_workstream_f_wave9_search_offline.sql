-- Workstream F Wave 9: global search index + offline pack metadata.
-- Deny by default; server reads with the service role.

create table if not exists search_documents (
  id uuid primary key default gen_random_uuid(),
  kind text not null
    check (kind in (
      'case',
      'brief',
      'evidence',
      'segment',
      'flashcard',
      'question',
      'chat',
      'passage'
    )),
  title text not null,
  body text not null default '',
  href text not null,
  case_id uuid references cases(id) on delete cascade,
  team_id uuid references teams(id) on delete cascade,
  -- null team_id = visible to all signed-in members
  source_id text not null,
  updated_at timestamptz not null default now(),
  search_tsv tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(body, '')), 'B')
  ) stored,
  unique (kind, source_id)
);

create index if not exists search_documents_tsv_idx
  on search_documents using gin (search_tsv);
create index if not exists search_documents_kind_idx
  on search_documents (kind, updated_at desc);
create index if not exists search_documents_case_idx
  on search_documents (case_id)
  where case_id is not null;

alter table search_documents enable row level security;
revoke all on table search_documents from anon, authenticated;

create table if not exists offline_case_packs (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id) on delete cascade,
  case_id uuid not null references cases(id) on delete cascade,
  saved_at timestamptz not null default now(),
  pack_bytes int not null default 0,
  unique (person_id, case_id)
);

create index if not exists offline_case_packs_person_idx
  on offline_case_packs (person_id, saved_at desc);

alter table offline_case_packs enable row level security;
revoke all on table offline_case_packs from anon, authenticated;

comment on table search_documents is
  'Unified FTS index for Cmd-K search across cases, briefs, evidence, segments, cards, questions, chat.';
comment on table offline_case_packs is
  'Which cases a person saved for offline; the pack body lives in the browser cache.';
