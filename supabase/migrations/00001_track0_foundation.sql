-- Track 0 Foundation schema + RLS for Crux
-- Apply in Supabase SQL editor or via CLI when SUPABASE_URL is configured.
-- Sample-data path mirrors these tables in .data/store.json for local/dev.

create extension if not exists "pgcrypto";
create extension if not exists "vector";

-- ---------- core people / teams ----------
create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  colour text not null,
  created_at timestamptz not null default now(),
  created_by uuid
);

create table if not exists people (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  team_id uuid references teams(id),
  role text not null check (role in ('member', 'coach_admin', 'tech_admin')),
  email text,
  email_reminders_opt_in boolean not null default false,
  digest_opt_in boolean not null default false,
  consent_version text,
  consent_at timestamptz,
  recording_ok boolean not null default false,
  voice_sample_path text,
  first_run_checklist jsonb not null default '{}'::jsonb,
  failed_attempts int not null default 0,
  locked_until timestamptz,
  last_sign_in_at timestamptz,
  session_version int not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid
);

create table if not exists team_memberships (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id),
  team_id uuid not null references teams(id),
  from_at timestamptz not null default now(),
  to_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid
);

create table if not exists auth_codes (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('starter', 'personal', 'admin')),
  person_id uuid references people(id),
  hash text not null,
  encrypted_copy text,
  must_choose boolean not null default false,
  set_at timestamptz,
  last_revealed_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid
);

create table if not exists competitions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  date date not null,
  place text,
  timings jsonb,
  created_at timestamptz not null default now(),
  created_by uuid
);

create table if not exists cases (
  id uuid primary key default gen_random_uuid(),
  number int not null unique,
  title text not null,
  case_set_page text,
  crux text,
  trap text,
  closing_question text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid
);

-- ---------- library (Track 1 stubs) ----------
create table if not exists files (
  id uuid primary key default gen_random_uuid(),
  drive_id text,
  path text,
  mime text,
  modified_at timestamptz,
  checksum text,
  case_ids uuid[],
  type text,
  confidence real,
  card text,
  created_at timestamptz not null default now(),
  created_by uuid
);

create table if not exists passages (
  id uuid primary key default gen_random_uuid(),
  file_id uuid references files(id),
  anchor text,
  text text not null,
  embedding vector(1536),
  created_at timestamptz not null default now(),
  created_by uuid
);

create table if not exists highlights (
  id uuid primary key default gen_random_uuid(),
  passage_id uuid references passages(id),
  range text,
  person_id uuid references people(id),
  body text,
  thread_id uuid,
  created_at timestamptz not null default now(),
  created_by uuid
);

create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  passage_id uuid references passages(id),
  range text,
  person_id uuid references people(id),
  body text not null,
  thread_id uuid,
  created_at timestamptz not null default now(),
  created_by uuid
);

-- ---------- case brain (Track 2 stubs) ----------
create table if not exists claims (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id),
  case_id uuid references cases(id),
  text text not null,
  logic_line text,
  ord int not null default 0,
  citation_ids uuid[],
  created_at timestamptz not null default now(),
  created_by uuid
);

create table if not exists supports (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid references claims(id),
  team_id uuid references teams(id),
  case_id uuid references cases(id),
  text text not null,
  logic_line text,
  ord int not null default 0,
  citation_ids uuid[],
  created_at timestamptz not null default now(),
  created_by uuid
);

create table if not exists backings (
  id uuid primary key default gen_random_uuid(),
  support_id uuid references supports(id),
  team_id uuid references teams(id),
  case_id uuid references cases(id),
  text text not null,
  citation_ids uuid[],
  created_at timestamptz not null default now(),
  created_by uuid
);

create table if not exists counterclaims (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id),
  case_id uuid references cases(id),
  text text not null,
  concede text,
  distinguish text,
  rebut text,
  citation_ids uuid[],
  created_at timestamptz not null default now(),
  created_by uuid
);

create table if not exists truth_items (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id),
  case_id uuid references cases(id),
  kind text check (kind in ('fact', 'quote', 'example', 'framework')),
  text text not null,
  citation_ids uuid[],
  status text not null default 'accepted',
  created_at timestamptz not null default now(),
  created_by uuid
);

create table if not exists proposals (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id),
  case_id uuid references cases(id),
  origin text,
  origin_ref text,
  text text not null,
  cruxy_note text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  created_by uuid
);

create table if not exists decisions (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid references proposals(id),
  person_id uuid references people(id),
  verdict text check (verdict in ('accept', 'reject', 'edit')),
  reason text not null,
  edited_text text,
  created_at timestamptz not null default now(),
  created_by uuid
);

create table if not exists case_roles (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id),
  case_id uuid references cases(id),
  person_id uuid references people(id),
  role text not null,
  created_at timestamptz not null default now(),
  created_by uuid
);

create table if not exists assignments (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id),
  case_id uuid references cases(id),
  person_id uuid references people(id),
  task text,
  due date,
  assigned_by uuid references people(id),
  status text not null default 'open',
  created_at timestamptz not null default now(),
  created_by uuid
);

-- ---------- revision (Track 3 stubs) ----------
create table if not exists one_pagers (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id),
  case_id uuid references cases(id),
  version int not null default 1,
  body jsonb,
  created_at timestamptz not null default now(),
  created_by uuid
);

create table if not exists flashcards (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id),
  case_id uuid references cases(id),
  deck text,
  front text not null,
  back text not null,
  citation_ids uuid[],
  created_at timestamptz not null default now(),
  created_by uuid
);

create table if not exists card_reviews (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references people(id),
  card_id uuid references flashcards(id),
  grade int,
  next_due timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid
);

create table if not exists questions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references cases(id),
  text text not null,
  type text,
  difficulty int,
  origin text,
  created_at timestamptz not null default now(),
  created_by uuid
);

create table if not exists answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid references questions(id),
  person_id uuid references people(id),
  transcript_ref text,
  score real,
  feedback text,
  created_at timestamptz not null default now(),
  created_by uuid
);

create table if not exists roadmap_stages (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references people(id),
  case_id uuid references cases(id),
  stage text not null,
  required boolean not null default true,
  due date,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid
);

-- ---------- sessions / practice (Track 5 stubs) ----------
create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  date date,
  place text,
  online boolean not null default false,
  code_hash text,
  created_at timestamptz not null default now(),
  created_by uuid references people(id)
);

create table if not exists rounds (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id),
  case_id uuid references cases(id),
  teams uuid[],
  sides jsonb,
  moderator text,
  judges jsonb,
  timings jsonb,
  created_at timestamptz not null default now(),
  created_by uuid
);

create table if not exists attendance (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id),
  person_id uuid references people(id),
  status text,
  source text,
  created_at timestamptz not null default now(),
  created_by uuid
);

create table if not exists recordings (
  id uuid primary key default gen_random_uuid(),
  round_id uuid references rounds(id),
  chunk_paths text[],
  status text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid
);

create table if not exists transcript_lines (
  id uuid primary key default gen_random_uuid(),
  round_id uuid references rounds(id),
  start_ms int,
  end_ms int,
  speaker_person_id uuid references people(id),
  text text not null,
  created_at timestamptz not null default now(),
  created_by uuid
);

create table if not exists judges (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  background text,
  weight real,
  created_at timestamptz not null default now(),
  created_by uuid
);

create table if not exists judge_cards (
  id uuid primary key default gen_random_uuid(),
  round_id uuid references rounds(id),
  judge_id uuid references judges(id),
  cruxy boolean not null default false,
  team_id uuid references teams(id),
  created_at timestamptz not null default now(),
  created_by uuid
);

create table if not exists card_scores (
  id uuid primary key default gen_random_uuid(),
  card_id uuid references judge_cards(id),
  item text not null,
  score int,
  comment text,
  evidence_line_ids uuid[],
  created_at timestamptz not null default now(),
  created_by uuid
);

create table if not exists feedback_items (
  id uuid primary key default gen_random_uuid(),
  round_id uuid references rounds(id),
  person_id uuid references people(id),
  kind text,
  quote_line_id uuid references transcript_lines(id),
  reasoning text,
  better_version text,
  created_at timestamptz not null default now(),
  created_by uuid
);

create table if not exists redos (
  id uuid primary key default gen_random_uuid(),
  feedback_item_id uuid references feedback_items(id),
  transcript_ref text,
  score_before real,
  score_after real,
  created_at timestamptz not null default now(),
  created_by uuid
);

create table if not exists bank_entries (
  id uuid primary key default gen_random_uuid(),
  lesson text not null,
  example_line_id uuid,
  why text,
  improved text,
  drill_id uuid,
  seen_count int not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid
);

-- ---------- chat / research / cost / activity ----------
create table if not exists chats (
  id uuid primary key default gen_random_uuid(),
  channel text not null,
  created_at timestamptz not null default now(),
  created_by uuid
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid references chats(id),
  person_id uuid references people(id),
  from_cruxy boolean not null default false,
  body text not null,
  refs uuid[],
  created_at timestamptz not null default now(),
  created_by uuid
);

create table if not exists research_runs (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references cases(id),
  gaps jsonb,
  findings jsonb,
  created_at timestamptz not null default now(),
  created_by uuid
);

create table if not exists book_requests (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  reason text,
  chapter text,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  created_by uuid
);

create table if not exists ai_calls (
  id uuid primary key default gen_random_uuid(),
  feature text not null,
  model text not null,
  tokens_in int not null default 0,
  tokens_out int not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  person_id uuid references people(id),
  refused boolean not null default false,
  refuse_reason text,
  created_at timestamptz not null default now(),
  created_by uuid
);

create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references people(id),
  action text not null,
  target text,
  meta jsonb,
  ip_hash text,
  at timestamptz not null default now()
);

-- ---------- RLS ----------
alter table teams enable row level security;
alter table people enable row level security;
alter table team_memberships enable row level security;
alter table auth_codes enable row level security;
alter table competitions enable row level security;
alter table cases enable row level security;
alter table files enable row level security;
alter table passages enable row level security;
alter table highlights enable row level security;
alter table comments enable row level security;
alter table claims enable row level security;
alter table supports enable row level security;
alter table backings enable row level security;
alter table counterclaims enable row level security;
alter table truth_items enable row level security;
alter table proposals enable row level security;
alter table decisions enable row level security;
alter table case_roles enable row level security;
alter table assignments enable row level security;
alter table one_pagers enable row level security;
alter table flashcards enable row level security;
alter table card_reviews enable row level security;
alter table questions enable row level security;
alter table answers enable row level security;
alter table roadmap_stages enable row level security;
alter table sessions enable row level security;
alter table rounds enable row level security;
alter table attendance enable row level security;
alter table recordings enable row level security;
alter table transcript_lines enable row level security;
alter table judges enable row level security;
alter table judge_cards enable row level security;
alter table card_scores enable row level security;
alter table feedback_items enable row level security;
alter table redos enable row level security;
alter table bank_entries enable row level security;
alter table chats enable row level security;
alter table messages enable row level security;
alter table research_runs enable row level security;
alter table book_requests enable row level security;
alter table ai_calls enable row level security;
alter table activity_log enable row level security;

-- Helper: current person id from request JWT claim (set by app)
create or replace function public.current_person_id() returns uuid
language sql stable as $$
  select nullif(auth.jwt() ->> 'person_id', '')::uuid;
$$;

create or replace function public.current_role() returns text
language sql stable as $$
  select coalesce(auth.jwt() ->> 'role', 'member');
$$;

create or replace function public.is_admin() returns boolean
language sql stable as $$
  select public.current_role() in ('tech_admin', 'coach_admin');
$$;

create or replace function public.is_tech_admin() returns boolean
language sql stable as $$
  select public.current_role() = 'tech_admin';
$$;

-- Everyone authenticated can read most tables
do $$
declare t text;
begin
  foreach t in array array[
    'teams','people','team_memberships','competitions','cases','files','passages',
    'highlights','comments','claims','supports','backings','counterclaims',
    'truth_items','proposals','decisions','case_roles','assignments',
    'one_pagers','flashcards','card_reviews','questions','answers','roadmap_stages',
    'sessions','rounds','attendance','recordings','transcript_lines',
    'judges','judge_cards','card_scores','feedback_items','redos','bank_entries',
    'chats','messages','research_runs'
  ]
  loop
    execute format(
      'create policy %I on %I for select to authenticated using (true);',
      t || '_select_all', t
    );
  end loop;
end $$;

-- auth_codes: NO member select. Only tech_admin (service role / JWT).
create policy auth_codes_tech_only on auth_codes
  for all to authenticated
  using (public.is_tech_admin())
  with check (public.is_tech_admin());

-- ai_calls: admins only (tech for full; coach read via admin console later)
create policy ai_calls_admin_select on ai_calls
  for select to authenticated
  using (public.is_admin());

create policy ai_calls_service_insert on ai_calls
  for insert to authenticated
  with check (public.is_admin() or public.current_person_id() is not null);

-- book_requests: tech_admin only
create policy book_requests_tech on book_requests
  for all to authenticated
  using (public.is_tech_admin())
  with check (public.is_tech_admin());

-- judges.weight hidden from members: expose via view without weight for members
create or replace view judges_public as
  select id, name, background, created_at, created_by
  from judges;

-- activity_log: admins (coach read-only enforced in app)
create policy activity_log_admin on activity_log
  for select to authenticated
  using (public.is_admin());

create policy activity_log_insert on activity_log
  for insert to authenticated
  with check (true);

-- Session codes: hash column only; plaintext never stored. Members cannot select sessions.code_hash via view.
create or replace view sessions_public as
  select id, date, place, online, created_at, created_by,
    case when public.is_admin() then code_hash else null end as code_hash
  from sessions;

-- Deny anon everything sensitive by default (no policies for anon on auth_codes/ai_calls)
revoke all on auth_codes from anon;
revoke all on ai_calls from anon;
revoke all on book_requests from anon;
revoke all on activity_log from anon;
