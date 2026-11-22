-- Workstream C (Wave 9): Competition Day hub at /regional.
-- Logistics, carpools, packing ticks, round-day cards, richer round logs.

create table if not exists competition_day_logistics (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competitions(id) on delete cascade,
  schedule_text text,
  departure_time text,
  meeting_point text,
  dress_guidance text,
  venue_notes text,
  room_notes text,
  packing_items text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references people(id),
  unique (competition_id)
);

create table if not exists competition_carpools (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competitions(id) on delete cascade,
  driver_person_id uuid not null references people(id) on delete cascade,
  seats int not null default 4 check (seats >= 1 and seats <= 12),
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references people(id)
);

create table if not exists competition_carpool_riders (
  id uuid primary key default gen_random_uuid(),
  carpool_id uuid not null references competition_carpools(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (carpool_id, person_id)
);

create table if not exists competition_packing_ticks (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competitions(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  item_key text not null,
  done boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (competition_id, person_id, item_key)
);

create table if not exists competition_day_rounds (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competitions(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  round_number int not null check (round_number >= 1 and round_number <= 12),
  case_id uuid references cases(id) on delete set null,
  case_label text,
  side text check (side in ('presenting', 'commenting') or side is null),
  speakers jsonb not null default '[]'::jsonb,
  key_points text[] not null default '{}',
  room text,
  starts_at text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references people(id),
  unique (competition_id, team_id, round_number)
);

-- Richer real-round log fields for H's retrospective and /regional.
alter table competition_logs
  add column if not exists round_number int;
alter table competition_logs
  add column if not exists side text;
alter table competition_logs
  add column if not exists debrief_worked text;
alter table competition_logs
  add column if not exists debrief_change text;
alter table competition_logs
  add column if not exists day_round_id uuid references competition_day_rounds(id)
    on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'competition_logs_side_check'
  ) then
    alter table competition_logs
      add constraint competition_logs_side_check
      check (side in ('presenting', 'commenting') or side is null);
  end if;
end $$;

alter table competition_day_logistics enable row level security;
alter table competition_carpools enable row level security;
alter table competition_carpool_riders enable row level security;
alter table competition_packing_ticks enable row level security;
alter table competition_day_rounds enable row level security;

revoke all on table competition_day_logistics from anon, authenticated;
revoke all on table competition_carpools from anon, authenticated;
revoke all on table competition_carpool_riders from anon, authenticated;
revoke all on table competition_packing_ticks from anon, authenticated;
revoke all on table competition_day_rounds from anon, authenticated;

create index if not exists competition_carpools_comp_idx
  on competition_carpools (competition_id);
create index if not exists competition_day_rounds_team_idx
  on competition_day_rounds (team_id, competition_id);
create index if not exists competition_packing_ticks_person_idx
  on competition_packing_ticks (person_id, competition_id);

comment on table competition_day_logistics is
  'Dec 5 logistics: schedule, departure, dress, packing list. Empty fields mean Dr. B will add this.';
comment on table competition_day_rounds is
  'Round-day cards: drawn case, side, speakers, stance key points.';
comment on column competition_logs.debrief_worked is
  'Two-minute debrief: one thing that worked.';
comment on column competition_logs.debrief_change is
  'Two-minute debrief: one thing to change.';
