-- Workstream E Wave 9: solo async prep.
-- Migration reserved in wave9.md: E next = 00064.

-- Per-person deliverable progress on a case (presentation, commentary, …)
create table if not exists solo_part_progress (
  person_id uuid not null references people(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  case_id uuid not null references cases(id) on delete cascade,
  part text not null
    check (part in ('presentation', 'commentary', 'response', 'judges')),
  done_at timestamptz,
  minutes_spent int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (person_id, case_id, part)
);

alter table solo_part_progress enable row level security;
revoke all on table solo_part_progress from anon, authenticated;

comment on table solo_part_progress is
  'Solo prep: which round parts a person has finished on each case.';

-- Async review recordings (own part, not full practice round)
create table if not exists solo_recordings (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  case_id uuid not null references cases(id) on delete cascade,
  part text not null
    check (part in ('presentation', 'commentary', 'response', 'judges')),
  title text not null,
  storage_path text,
  duration_ms int,
  created_at timestamptz not null default now()
);

create index if not exists solo_recordings_case_idx
  on solo_recordings (case_id, created_at desc);

alter table solo_recordings enable row level security;
revoke all on table solo_recordings from anon, authenticated;

comment on table solo_recordings is
  'Async review: person records their part for teammates and Dr. B to comment.';

-- Timed comments on a solo recording
create table if not exists solo_review_comments (
  id uuid primary key default gen_random_uuid(),
  recording_id uuid not null references solo_recordings(id) on delete cascade,
  author_id uuid not null references people(id) on delete cascade,
  body text not null,
  at_ms int not null default 0,
  created_at timestamptz not null default now(),
  check (char_length(body) <= 800)
);

create index if not exists solo_review_comments_rec_idx
  on solo_review_comments (recording_id, at_ms);

alter table solo_review_comments enable row level security;
revoke all on table solo_review_comments from anon, authenticated;

-- Handoff notes when stopping work on a case
create table if not exists solo_handoffs (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  case_id uuid not null references cases(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  check (char_length(body) <= 1000)
);

create index if not exists solo_handoffs_case_idx
  on solo_handoffs (case_id, created_at desc);

alter table solo_handoffs enable row level security;
revoke all on table solo_handoffs from anon, authenticated;

-- Last time a person looked at a case (for since-you-looked)
create table if not exists solo_case_visits (
  person_id uuid not null references people(id) on delete cascade,
  case_id uuid not null references cases(id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  primary key (person_id, case_id)
);

alter table solo_case_visits enable row level security;
revoke all on table solo_case_visits from anon, authenticated;

comment on table solo_case_visits is
  'When the person last opened a case for solo prep; drives since-you-looked.';
