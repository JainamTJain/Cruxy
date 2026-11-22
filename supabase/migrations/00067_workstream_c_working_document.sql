-- Workstream C: Working document tab (builds on Team Brief / 00050).
-- Path choice, sectioned Crux doc, per-team suggestion decisions, shared Evidence Library ticks.

alter table team_briefs
  add column if not exists working_path text
    check (working_path is null or working_path in ('imported', 'crux'));

comment on column team_briefs.working_path is
  'null = not started (show Import vs Start); imported = Google Doc; crux = sections in Crux.';

create table if not exists working_doc_sections (
  id uuid primary key default gen_random_uuid(),
  brief_id uuid not null references team_briefs(id) on delete cascade,
  section_key text not null
    check (section_key in (
      'answer_one_sentence',
      'claims',
      'support',
      'objection_reply',
      'values_in_tension',
      'judges_questions'
    )),
  body text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references people(id),
  unique (brief_id, section_key)
);

create table if not exists working_doc_socratic (
  id uuid primary key default gen_random_uuid(),
  brief_id uuid not null references team_briefs(id) on delete cascade,
  section_key text not null,
  question text not null,
  answer text,
  status text not null default 'open'
    check (status in ('open', 'answered', 'skipped')),
  created_at timestamptz not null default now(),
  created_by uuid references people(id),
  answered_at timestamptz,
  answered_by uuid references people(id)
);

create index if not exists working_doc_socratic_brief_idx
  on working_doc_socratic (brief_id, section_key, created_at desc);

create table if not exists working_doc_suggestions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  brief_id uuid references team_briefs(id) on delete set null,
  kind text not null
    check (kind in ('evidence', 'gap', 'counter', 'sharper', 'question')),
  text text not null,
  citation text,
  paragraph_anchor text,
  section_key text,
  source text not null default 'cruxy'
    check (source in ('cruxy', 'evidence_library', 'member')),
  truth_item_id uuid references truth_items(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'ticked', 'crossed')),
  reject_reason text,
  created_at timestamptz not null default now(),
  created_by uuid references people(id),
  decided_at timestamptz,
  decided_by uuid references people(id)
);

create index if not exists working_doc_suggestions_team_idx
  on working_doc_suggestions (team_id, case_id, status);

-- Shared Evidence Library facts: each team's own tick/cross (never changes another team).
create table if not exists evidence_team_decisions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  case_id uuid not null references cases(id) on delete cascade,
  truth_item_id uuid not null references truth_items(id) on delete cascade,
  decision text not null check (decision in ('tick', 'cross')),
  reason text,
  decided_at timestamptz not null default now(),
  decided_by uuid references people(id),
  unique (team_id, truth_item_id)
);

create index if not exists evidence_team_decisions_case_idx
  on evidence_team_decisions (case_id, team_id);

alter table working_doc_sections enable row level security;
alter table working_doc_socratic enable row level security;
alter table working_doc_suggestions enable row level security;
alter table evidence_team_decisions enable row level security;

revoke all on table working_doc_sections from anon, authenticated;
revoke all on table working_doc_socratic from anon, authenticated;
revoke all on table working_doc_suggestions from anon, authenticated;
revoke all on table evidence_team_decisions from anon, authenticated;
