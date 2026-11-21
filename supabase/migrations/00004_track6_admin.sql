-- Track 6 Admin: program map helpers, spend caps, competition logs, calibration
-- Apply after 00001_track0_foundation.sql. Sample-data path mirrors these in .data/store.json.

create table if not exists readiness_cells (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id),
  case_id uuid not null references cases(id),
  readiness_pct real not null default 0,
  lead_names text[] not null default '{}',
  latest_event text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by uuid,
  unique (team_id, case_id)
);

create table if not exists program_totals (
  id int primary key default 1 check (id = 1),
  drive_files int not null default 0,
  passages_cited int not null default 0,
  ideas_accepted int not null default 0,
  sources_verified int not null default 0,
  bank_questions int not null default 0,
  rounds_graded int not null default 0,
  redo_improvements int not null default 0,
  updated_at timestamptz not null default now()
);

insert into program_totals (id) values (1) on conflict do nothing;

create table if not exists spend_caps (
  id int primary key default 1 check (id = 1),
  monthly_usd numeric(10, 2) not null default 30,
  per_round_usd numeric(10, 2) not null default 0.75,
  per_research_night_usd numeric(10, 2) not null default 0.25,
  per_person_assistant_day_usd numeric(10, 2) not null default 0.20,
  research_paused boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references people(id)
);

insert into spend_caps (id) values (1) on conflict do nothing;

create table if not exists calibration_rows (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  gap real not null,
  judge_name text,
  weight real,
  human_cards int not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid
);

create table if not exists competition_logs (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid references competitions(id),
  case_id uuid references cases(id),
  case_number int,
  opponent text not null,
  moderator_question text,
  judges_questions text,
  judge_comments text,
  score_us real,
  score_them real,
  result text check (result in ('win', 'loss', 'tie', 'pending') or result is null),
  team_id uuid references teams(id),
  created_at timestamptz not null default now(),
  created_by uuid
);

create table if not exists drive_sort_queue (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  hint text,
  confidence real not null default 0,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  created_by uuid
);

create table if not exists feature_useful (
  id uuid primary key default gen_random_uuid(),
  feature text not null,
  person_id uuid references people(id),
  at timestamptz not null default now()
);

create table if not exists last_visits (
  person_id uuid primary key references people(id),
  at timestamptz not null default now()
);

alter table readiness_cells enable row level security;
alter table program_totals enable row level security;
alter table spend_caps enable row level security;
alter table calibration_rows enable row level security;
alter table competition_logs enable row level security;
alter table drive_sort_queue enable row level security;
alter table feature_useful enable row level security;
alter table last_visits enable row level security;

create policy readiness_select on readiness_cells for select to authenticated using (true);
create policy program_totals_select on program_totals for select to authenticated using (true);
create policy competition_logs_select on competition_logs for select to authenticated using (true);
create policy competition_logs_admin_write on competition_logs
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Spend caps / calibration / drive sort: tech admin only
create policy spend_caps_tech on spend_caps
  for all to authenticated
  using (public.is_tech_admin())
  with check (public.is_tech_admin());

create policy calibration_tech on calibration_rows
  for all to authenticated
  using (public.is_tech_admin())
  with check (public.is_tech_admin());

create policy drive_sort_tech on drive_sort_queue
  for all to authenticated
  using (public.is_tech_admin())
  with check (public.is_tech_admin());

create policy feature_useful_insert on feature_useful
  for insert to authenticated
  with check (public.current_person_id() = person_id);

create policy feature_useful_admin_select on feature_useful
  for select to authenticated
  using (public.is_admin() or public.current_person_id() = person_id);

create policy last_visits_own on last_visits
  for all to authenticated
  using (public.current_person_id() = person_id or public.is_admin())
  with check (public.current_person_id() = person_id or public.is_admin());

revoke all on spend_caps from anon;
revoke all on calibration_rows from anon;
revoke all on drive_sort_queue from anon;
