-- Workstream H: critique engine for the working-document suggestion rail.
-- Extends suggestion kinds so Cruxy can make a case (weak spot, why, stronger,
-- what do you think?), tracks critique runs for on-change and nightly caps.

-- Expand kinds (keep Wave 9 C kinds for compatibility).
alter table working_doc_suggestions
  drop constraint if exists working_doc_suggestions_kind_check;

alter table working_doc_suggestions
  add constraint working_doc_suggestions_kind_check
  check (kind in (
    'evidence',
    'gap',
    'counter',
    'sharper',
    'question',
    'missing_perspective',
    'missing_stakeholder',
    'unanswered_counter',
    'logical_fallacy',
    'disconnected_claim',
    'loose_end',
    'evidence_gap',
    'sharper_wording'
  ));

alter table working_doc_suggestions
  drop constraint if exists working_doc_suggestions_source_check;

alter table working_doc_suggestions
  add constraint working_doc_suggestions_source_check
  check (source in (
    'cruxy',
    'evidence_library',
    'member',
    'anonymous_travel'
  ));

alter table working_doc_suggestions
  add column if not exists weak_spot text,
  add column if not exists why_weak text,
  add column if not exists stronger_version text,
  add column if not exists question_back text,
  add column if not exists fallacy_name text,
  add column if not exists truth_source_ref text,
  add column if not exists cannot_cite boolean not null default false;

comment on column working_doc_suggestions.truth_source_ref is
  'Short pointer into the shared truth source (case set, domain prep, research, transcript, traveled idea). Never names another team.';
comment on column working_doc_suggestions.cannot_cite is
  'True when Cruxy could not attach a truth-source citation.';

create table if not exists critique_runs (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  trigger text not null
    check (trigger in ('on_change', 'nightly', 'manual', 'shared_ideas')),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'done', 'skipped', 'error')),
  suggestions_posted int not null default 0,
  notes text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references people(id)
);

create index if not exists critique_runs_team_case_idx
  on critique_runs (team_id, case_id, created_at desc);

create index if not exists critique_runs_queued_idx
  on critique_runs (status, created_at)
  where status = 'queued';

create index if not exists working_doc_suggestions_section_open_idx
  on working_doc_suggestions (team_id, case_id, section_key, status)
  where status = 'pending';

alter table critique_runs enable row level security;
revoke all on table critique_runs from anon, authenticated;

-- If C's idea_travel_scores already exists, allow highlight/comment sources.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'idea_travel_scores'
  ) then
    alter table idea_travel_scores
      drop constraint if exists idea_travel_scores_source_kind_check;
    alter table idea_travel_scores
      add constraint idea_travel_scores_source_kind_check
      check (source_kind in (
        'working_section',
        'accepted_suggestion',
        'note',
        'told_cruxy',
        'coherence',
        'highlight',
        'comment',
        'critique'
      ));
  end if;
end $$;
