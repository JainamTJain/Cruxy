-- Track 5 Practice: sessions, recording, judging, feedback enhancements
-- Extends Track 0 stubs with practice modes, glossary, calibration, skills.

alter table sessions
  add column if not exists kind text not null default 'admin'
    check (kind in ('admin', 'member_practice')),
  add column if not exists title text not null default 'Practice',
  add column if not exists status text not null default 'scheduled'
    check (status in ('scheduled', 'live', 'ended')),
  add column if not exists mode text,
  add column if not exists invite_team_ids uuid[];

alter table rounds
  add column if not exists phase text not null default 'setup',
  add column if not exists mode text not null default 'full_round',
  add column if not exists ord int not null default 0,
  add column if not exists case_number int,
  add column if not exists started_at timestamptz,
  add column if not exists ended_at timestamptz;

alter table recordings
  add column if not exists chunk_meta jsonb not null default '[]'::jsonb,
  add column if not exists transcript_job_id text;

alter table transcript_lines
  add column if not exists speaker_label text,
  add column if not exists corrected boolean not null default false;

alter table judges
  add column if not exists person_id uuid references people(id),
  add column if not exists guest_token_hash text;

alter table judge_cards
  add column if not exists spirit int,
  add column if not exists spirit_comment text,
  add column if not exists overall_comment text,
  add column if not exists moments jsonb not null default '[]'::jsonb,
  add column if not exists predictions jsonb,
  add column if not exists calibration_note text,
  add column if not exists calibration_use text;

alter table feedback_items
  add column if not exists scoring_item text,
  add column if not exists audience_heard text;

alter table redos
  add column if not exists person_id uuid references people(id),
  add column if not exists open boolean not null default true;

alter table bank_entries
  add column if not exists case_id uuid references cases(id);

create table if not exists glossary_terms (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references cases(id),
  term text not null,
  misheard text[] not null default '{}',
  pronunciation text,
  created_at timestamptz not null default now(),
  created_by uuid
);

create table if not exists round_reports (
  id uuid primary key default gen_random_uuid(),
  round_id uuid references rounds(id),
  headline text not null,
  socratic_followups text[] not null default '{}',
  proposal_ids uuid[],
  created_at timestamptz not null default now(),
  created_by uuid
);

create table if not exists skill_charts (
  person_id uuid primary key references people(id),
  skills jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists speaker_confirms (
  round_id uuid primary key references rounds(id),
  mappings jsonb not null default '[]'::jsonb,
  confirmed_by uuid references people(id),
  confirmed_at timestamptz
);

create table if not exists talk_analytics (
  id uuid primary key default gen_random_uuid(),
  round_id uuid references rounds(id),
  person_id uuid references people(id),
  talk_ms int not null default 0,
  words int not null default 0,
  filler_count int not null default 0,
  time_to_first_answer_ms int,
  interruptions int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists guest_judge_tokens (
  token_hash text primary key,
  judge_id uuid not null references judges(id),
  round_id uuid not null references rounds(id),
  expires_at timestamptz not null
);

alter table glossary_terms enable row level security;
alter table round_reports enable row level security;
alter table skill_charts enable row level security;
alter table speaker_confirms enable row level security;
alter table talk_analytics enable row level security;
alter table guest_judge_tokens enable row level security;

create policy glossary_select on glossary_terms for select to authenticated using (true);
create policy round_reports_select on round_reports for select to authenticated using (true);
create policy skill_charts_select on skill_charts for select to authenticated using (true);
create policy speaker_confirms_select on speaker_confirms for select to authenticated using (true);
create policy talk_analytics_select on talk_analytics for select to authenticated using (true);

-- Guest tokens: service/admin only
create policy guest_tokens_tech on guest_judge_tokens
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Hide judges.weight from members via existing judges_public view
-- (drop first: Postgres can't add a column in the middle of an existing view)
drop view if exists judges_public;
create view judges_public as
  select id, name, background, person_id, created_at, created_by
  from judges;
