-- Workstream H Wave 7: material requests + round dates on robustness cache.
-- Research finding bibliographic fields live in research_runs.findings JSONB.

create table if not exists material_requests (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  authors text,
  year int,
  doi text,
  url text,
  citation text not null,
  why_it_matters text not null,
  case_id uuid references cases(id) on delete set null,
  claim_ref text,
  where_to_look text,
  status text not null default 'open'
    check (status in ('open', 'fulfilled', 'dismissed')),
  matched_file_id uuid,
  matched_drive_id text,
  created_at timestamptz not null default now(),
  created_by uuid references people(id) on delete set null,
  fulfilled_at timestamptz
);

create index if not exists material_requests_status_idx
  on material_requests (status, created_at desc);
create index if not exists material_requests_case_idx
  on material_requests (case_id)
  where case_id is not null;
create index if not exists material_requests_doi_idx
  on material_requests (doi)
  where doi is not null;

alter table material_requests enable row level security;
revoke all on table material_requests from anon, authenticated;

alter table claim_robustness_scores
  add column if not exists open_from_round_dates text[] not null default '{}';

insert into app_kv (key, value, updated_at)
values (
  'wave7_h_research_reach',
  jsonb_build_object('migration', '00040', 'at', now()),
  now()
)
on conflict (key) do update
set value = excluded.value, updated_at = excluded.updated_at;
