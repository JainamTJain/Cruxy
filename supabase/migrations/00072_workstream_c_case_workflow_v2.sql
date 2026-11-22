-- Workstream C: case workflow v2
-- Team-level document import (split by case), one-pager sync proposals from
-- the working document. Suggestions stay on working_doc_suggestions (00067).

create table if not exists team_doc_batches (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  status text not null default 'review'
    check (status in ('review', 'confirmed', 'cancelled')),
  created_at timestamptz not null default now(),
  created_by uuid references people(id),
  confirmed_at timestamptz,
  confirmed_by uuid references people(id)
);

create index if not exists team_doc_batches_team_idx
  on team_doc_batches (team_id, created_at desc);

create table if not exists team_doc_batch_sources (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references team_doc_batches(id) on delete cascade,
  drive_file_id text,
  drive_url text,
  title text not null default 'Imported document',
  body_text text not null default '',
  checksum text,
  created_at timestamptz not null default now()
);

create index if not exists team_doc_batch_sources_batch_idx
  on team_doc_batch_sources (batch_id);

-- One row per split piece: matched case, not in regional, or unmatched paragraphs.
create table if not exists team_doc_batch_splits (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references team_doc_batches(id) on delete cascade,
  source_id uuid references team_doc_batch_sources(id) on delete set null,
  kind text not null
    check (kind in ('found', 'not_in_regional', 'unmatched')),
  case_number int,
  case_id uuid references cases(id) on delete set null,
  title_guess text,
  section_count int not null default 0,
  body_text text not null default '',
  change_summary text,
  assigned_case_id uuid references cases(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists team_doc_batch_splits_batch_idx
  on team_doc_batch_splits (batch_id);

-- When the working document changes, propose a matching one-pager update.
create table if not exists one_pager_sync_proposals (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  case_id uuid not null references cases(id) on delete cascade,
  proposed_body jsonb not null,
  change_summary text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'dismissed')),
  created_at timestamptz not null default now(),
  created_by uuid references people(id),
  decided_at timestamptz,
  decided_by uuid references people(id)
);

create index if not exists one_pager_sync_proposals_pending_idx
  on one_pager_sync_proposals (team_id, case_id, status);

comment on table team_doc_batches is
  'Team-level Import our documents: one batch, many Drive files, split by case.';
comment on table one_pager_sync_proposals is
  'One pager updates proposed from the working document; team accepts or dismisses.';

alter table team_doc_batches enable row level security;
alter table team_doc_batch_sources enable row level security;
alter table team_doc_batch_splits enable row level security;
alter table one_pager_sync_proposals enable row level security;

revoke all on table team_doc_batches from anon, authenticated;
revoke all on table team_doc_batch_sources from anon, authenticated;
revoke all on table team_doc_batch_splits from anon, authenticated;
revoke all on table one_pager_sync_proposals from anon, authenticated;
