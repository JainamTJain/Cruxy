-- Team overrides for distilled Drive reading points, plus a hash-keyed cache
-- of Cruxy's fallacy checks. Team-private: other teams never see the wording
-- or the flags. Server routes use the service role; RLS denies anon by default.

create table if not exists file_segment_overrides (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  segment_id uuid not null references file_segments(id) on delete cascade,
  body text not null,
  original_body text not null,
  edited_by uuid references people(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, segment_id)
);

create index if not exists file_segment_overrides_team_idx
  on file_segment_overrides (team_id);
create index if not exists file_segment_overrides_segment_idx
  on file_segment_overrides (segment_id);

alter table file_segment_overrides enable row level security;
revoke all on table file_segment_overrides from anon, authenticated;

comment on table file_segment_overrides is
  'Per-team wording overrides for distilled Drive reading points. Original kept.';

-- Cache fallacy checks by hash of the displayed text so Cruxy only re-runs
-- when the wording changes (including after a team edit).
create table if not exists file_segment_fallacy_cache (
  text_hash text primary key,
  sound boolean not null default true,
  fallacy_name text,
  why text,
  better_wording text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table file_segment_fallacy_cache enable row level security;
revoke all on table file_segment_fallacy_cache from anon, authenticated;

comment on table file_segment_fallacy_cache is
  'Cruxy fallacy flags for reading points, keyed by sha256 of the point text.';
