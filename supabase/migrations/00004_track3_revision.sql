-- Track 3 Revision: one-pagers, FSRS flashcards, moderator bank, roadmaps.
-- Extends Track 0 stub tables. Sample-data path mirrors these columns in .data/store.json.

-- ---------- one pagers ----------
alter table one_pagers
  add column if not exists previous_body jsonb,
  add column if not exists change_note text,
  add column if not exists signed_off_by uuid[] not null default '{}',
  add column if not exists drive_doc_id text,
  add column if not exists drive_pdf_exported boolean not null default false,
  add column if not exists origin_tag text not null default 'Cruxy';

create unique index if not exists one_pagers_team_case_version
  on one_pagers (team_id, case_id, version);

-- ---------- flashcards + FSRS ----------
alter table flashcards
  add column if not exists truth_item_id uuid references truth_items(id),
  add column if not exists source_kind text not null default 'manual',
  add column if not exists updated_at timestamptz not null default now();

create table if not exists card_fsrs_states (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id),
  card_id uuid not null references flashcards(id) on delete cascade,
  due timestamptz not null default now(),
  stability real not null default 0,
  difficulty real not null default 0,
  elapsed_days real not null default 0,
  scheduled_days real not null default 0,
  reps int not null default 0,
  lapses int not null default 0,
  state int not null default 0,
  last_review timestamptz,
  correct_streak int not null default 0,
  created_at timestamptz not null default now(),
  unique (person_id, card_id)
);

alter table card_reviews
  add column if not exists mode text not null default 'typed';

create table if not exists deck_opt_ins (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id),
  team_id uuid not null references teams(id),
  case_id uuid not null references cases(id),
  assigned boolean not null default false,
  created_at timestamptz not null default now(),
  unique (person_id, case_id)
);

-- ---------- moderator bank ----------
alter table questions
  add column if not exists status text not null default 'active',
  add column if not exists origin_label text,
  add column if not exists asked_at_tag text;

alter table answers
  add column if not exists text text,
  add column if not exists mode text not null default 'typed',
  add column if not exists team_id uuid references teams(id);

-- ---------- phrasebook + socratic ----------
create table if not exists phrasebook_entries (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id),
  case_id uuid references cases(id),
  claim_ref text,
  text text not null,
  kind text not null default 'custom',
  created_at timestamptz not null default now()
);

create table if not exists socratic_sessions (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id),
  team_id uuid not null references teams(id),
  case_id uuid not null references cases(id),
  turns jsonb not null default '[]'::jsonb,
  summary text,
  claim_links uuid[] not null default '{}',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- activity feeds for roadmap auto-mark ----------
create table if not exists reading_progress (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id),
  case_id uuid not null references cases(id),
  file_id text not null,
  opened_ratio real not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (person_id, case_id, file_id)
);

create table if not exists practice_speak_logs (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id),
  case_id uuid not null references cases(id),
  round_id uuid,
  spoken boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists judge_attempts (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id),
  case_id uuid not null references cases(id),
  score real not null,
  created_at timestamptz not null default now()
);

create table if not exists map_reviews (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id),
  team_id uuid not null references teams(id),
  case_id uuid not null references cases(id),
  claim_id uuid,
  kind text not null default 'reviewed',
  created_at timestamptz not null default now()
);

-- ---------- RLS (same spirit as Track 0) ----------
alter table card_fsrs_states enable row level security;
alter table deck_opt_ins enable row level security;
alter table phrasebook_entries enable row level security;
alter table socratic_sessions enable row level security;
alter table reading_progress enable row level security;
alter table practice_speak_logs enable row level security;
alter table judge_attempts enable row level security;
alter table map_reviews enable row level security;

-- Readable by authenticated members (service role bypasses); writes scoped in app.
do $$ begin
  create policy card_fsrs_read on card_fsrs_states for select using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy deck_opt_ins_read on deck_opt_ins for select using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy phrasebook_read on phrasebook_entries for select using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy socratic_read on socratic_sessions for select using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy reading_progress_read on reading_progress for select using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy practice_speak_read on practice_speak_logs for select using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy judge_attempts_read on judge_attempts for select using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy map_reviews_read on map_reviews for select using (true);
exception when duplicate_object then null; end $$;
