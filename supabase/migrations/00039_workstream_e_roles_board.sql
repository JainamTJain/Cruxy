-- Workstream E Wave 7: Roles board preferences (case rankings for fair split).
-- case_roles already holds the grid; this table stores each member's preferred case order.

create table if not exists case_role_preferences (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  case_id uuid not null references cases(id) on delete cascade,
  -- 1 = most preferred. Unique per person+team+case.
  rank int not null check (rank >= 1),
  updated_at timestamptz not null default now(),
  updated_by uuid references people(id) on delete set null,
  unique (person_id, team_id, case_id)
);

create index if not exists case_role_preferences_team_person_idx
  on case_role_preferences (team_id, person_id);

alter table case_role_preferences enable row level security;
revoke all on table case_role_preferences from anon, authenticated;

comment on table case_role_preferences is
  'Per-person ranking of cases for the Roles board preference template. Team members and admins write via server routes only.';
