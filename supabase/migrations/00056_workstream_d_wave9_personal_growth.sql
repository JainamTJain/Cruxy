-- Workstream D Wave 9: personal growth and privacy.
-- Round reflections, personal goals (+ coach comments).
-- Personal: self, coach admin, tech admin (app gates). RLS on; client roles revoked.

create table if not exists round_reflections (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people (id) on delete cascade,
  round_id uuid not null references rounds (id) on delete cascade,
  case_id uuid references cases (id) on delete set null,
  went_well text not null default '',
  one_change text not null default '',
  confidence int not null default 50
    check (confidence between 0 and 100),
  seconds_spent int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (person_id, round_id)
);

create index if not exists round_reflections_person_created_idx
  on round_reflections (person_id, created_at desc);
create index if not exists round_reflections_case_person_idx
  on round_reflections (case_id, person_id, created_at desc);

alter table round_reflections enable row level security;
revoke all on table round_reflections from anon, authenticated;

create table if not exists personal_goals (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people (id) on delete cascade,
  title text not null,
  body text,
  status text not null default 'open'
    check (status in ('open', 'done', 'dropped')),
  target_appe_item text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references people (id) on delete set null
);

create index if not exists personal_goals_person_idx
  on personal_goals (person_id, updated_at desc);

alter table personal_goals enable row level security;
revoke all on table personal_goals from anon, authenticated;

create table if not exists personal_goal_comments (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references personal_goals (id) on delete cascade,
  author_id uuid not null references people (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists personal_goal_comments_goal_idx
  on personal_goal_comments (goal_id, created_at);

alter table personal_goal_comments enable row level security;
revoke all on table personal_goal_comments from anon, authenticated;

comment on table round_reflections is
  'Wave 9 D: 60s post-round reflection. Personal only.';
comment on table personal_goals is
  'Wave 9 D: up to three personal goals. Visible to owner, Dr. B, Jainam.';
comment on table personal_goal_comments is
  'Wave 9 D: coach/tech comments on personal goals.';
