-- Workstream D Wave 8: personal learning profile.
-- Sliders 0 to 100 and APPE baseline self-ratings.
-- Personal: only the person, coach admin and tech admin (via app gates).
-- RLS on; client JWT roles revoked (server uses service role).

create table if not exists learning_profiles (
  person_id uuid primary key references people (id) on delete cascade,
  visual_verbal int not null default 50
    check (visual_verbal between 0 and 100),
  analogies_formal int not null default 50
    check (analogies_formal between 0 and 100),
  ethical_mechanization int not null default 50
    check (ethical_mechanization between 0 and 100),
  short_deep int not null default 50
    check (short_deep between 0 and 100),
  direct_gentle int not null default 50
    check (direct_gentle between 0 and 100),
  -- AppeItemKey -> 1..10 self-rating
  appe_baselines jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table learning_profiles enable row level security;
revoke all on table learning_profiles from anon, authenticated;

create index if not exists learning_profiles_updated_at_idx
  on learning_profiles (updated_at desc);

comment on table learning_profiles is
  'Wave 8 D: how the person learns + APPE baseline self-ratings. Personal only.';
