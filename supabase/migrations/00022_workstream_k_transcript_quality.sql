-- Workstream K Wave 5: transcript glossary quality + talk analytics support.
-- Applied after 00019. Server-only (service role); revoke anon/authenticated.

-- Per-line correction / uncertainty flags (keeps D's transcript_lines mapper intact).
create table if not exists transcript_line_quality (
  line_id uuid primary key references transcript_lines(id) on delete cascade,
  uncertain_words text[] not null default '{}',
  corrections jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table transcript_line_quality enable row level security;
revoke all on table transcript_line_quality from anon, authenticated;

create index if not exists transcript_line_quality_uncertain_idx
  on transcript_line_quality (line_id)
  where cardinality(uncertain_words) > 0;

-- Glossary provenance + freshness (additive columns; existing rows stay valid).
alter table glossary_terms
  add column if not exists source text not null default 'seed';

alter table glossary_terms
  add column if not exists updated_at timestamptz not null default now();

-- F-230: pronunciation note set by the person, tech admin, or transcription vendor
-- after a voice sample. Never invent pronunciations for real people.
alter table people
  add column if not exists pronunciation_note text;

-- Per-round glossary accuracy for Jainam (F-231).
create table if not exists glossary_round_checks (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds(id) on delete cascade,
  case_id uuid references cases(id),
  accuracy real not null default 0,
  term_hits jsonb not null default '[]'::jsonb,
  uncertain_count int not null default 0,
  correction_count int not null default 0,
  checked_at timestamptz not null default now(),
  created_by uuid references people(id)
);

create unique index if not exists glossary_round_checks_round_uidx
  on glossary_round_checks (round_id);

alter table glossary_round_checks enable row level security;
revoke all on table glossary_round_checks from anon, authenticated;

-- Short test clip per case; re-run when glossary changes (F-231).
create table if not exists glossary_test_clips (
  case_id uuid primary key references cases(id) on delete cascade,
  expected_terms text[] not null default '{}',
  last_run_at timestamptz,
  last_accuracy real,
  needs_rerun boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table glossary_test_clips enable row level security;
revoke all on table glossary_test_clips from anon, authenticated;

insert into app_kv (key, value, updated_at)
values (
  'transcript_quality',
  jsonb_build_object('migration', '00022', 'at', now()),
  now()
)
on conflict (key) do update
set value = excluded.value, updated_at = excluded.updated_at;
