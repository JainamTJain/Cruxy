-- Open reading from the web for each case: encyclopedia entries, open-access
-- papers, reports, court decisions and journalism Cruxy found for a deeper
-- dive. Shared program-wide (it is public material). Material that is not
-- free to read goes to book_requests for the tech admin instead.

create table if not exists case_open_readings (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  title text not null,
  url text not null,
  source_kind text not null default 'other'
    check (source_kind in ('encyclopedia', 'paper', 'report', 'court', 'news', 'book', 'other')),
  why text,
  authors text,
  year int,
  status text not null default 'active' check (status in ('active', 'hidden')),
  found_at timestamptz not null default now(),
  unique (case_id, url)
);

create index if not exists case_open_readings_case_idx
  on case_open_readings (case_id, status);

alter table case_open_readings enable row level security;
revoke all on table case_open_readings from anon, authenticated;
