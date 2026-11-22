-- Workstream C: team privacy + vetted idea travel + coherence audit.
-- Members see only their own team. Strong ideas may travel as anonymous
-- suggestions. Scores and reasons are stored for Dr. B to audit.

create table if not exists idea_travel_scores (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  source_team_id uuid not null references teams(id) on delete cascade,
  source_kind text not null
    check (source_kind in (
      'working_section',
      'accepted_suggestion',
      'note',
      'told_cruxy',
      'coherence'
    )),
  source_ref text,
  idea_text text not null,
  appe_score numeric(4, 1) not null,
  would_help_win boolean not null,
  reason text not null,
  traveled boolean not null default false,
  suggestion_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  created_by uuid references people(id)
);

create index if not exists idea_travel_scores_case_idx
  on idea_travel_scores (case_id, created_at desc);
create index if not exists idea_travel_scores_audit_idx
  on idea_travel_scores (would_help_win, traveled);

comment on table idea_travel_scores is
  'APPE-scored ideas: only strong ones travel anonymously to other teams. Dr. B audits score + reason.';

alter table idea_travel_scores enable row level security;
revoke all on table idea_travel_scores from anon, authenticated;
