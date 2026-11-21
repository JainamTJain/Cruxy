-- Track 1 Library enhancements on top of Track 0 stubs.
-- Safe to re-run: uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS patterns where possible.

alter table files add column if not exists name text;
alter table files add column if not exists text_content text;
alter table files add column if not exists scanned_pdf boolean not null default false;
alter table files add column if not exists status text not null default 'pending';
alter table files add column if not exists case_numbers int[];
alter table files add column if not exists extracted_ideas text[] default '{}';

alter table passages add column if not exists drive_id text;
alter table passages add column if not exists ord int not null default 0;

alter table book_requests add column if not exists case_id uuid references cases(id);

alter table research_runs add column if not exists stub boolean not null default true;

create table if not exists sync_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  files_seen int not null default 0,
  files_processed int not null default 0,
  files_skipped_unchanged int not null default 0,
  ai_calls int not null default 0,
  stub boolean not null default false,
  mode text not null default 'manual',
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid
);

alter table sync_runs enable row level security;

create policy sync_runs_admin_select on sync_runs
  for select to authenticated
  using (public.is_admin());

-- Sorting queue view: confidence under 0.7 or explicit status
create or replace view library_sorting_queue as
  select *
  from files
  where status = 'sorting_queue'
     or (confidence is not null and confidence < 0.7);

-- Index helpers for search
create index if not exists passages_file_id_idx on passages(file_id);
create index if not exists files_drive_id_idx on files(drive_id);
create index if not exists files_status_idx on files(status);
