-- Workstream E Wave 5: team-editable roadmap deadline overrides (F-149–F-156)
-- and readiness_cells refresh helpers. Next free number after 00019 / 00016 / 00018.

create table if not exists roadmap_deadline_overrides (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  stage text not null check (
    stage in (
      'read',
      'map',
      'one_pager',
      'flashcards',
      'question_drill',
      'practiced',
      'judged'
    )
  ),
  due date not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references people(id),
  unique (team_id, stage)
);

alter table roadmap_deadline_overrides enable row level security;
revoke all on table roadmap_deadline_overrides from anon, authenticated;

comment on table roadmap_deadline_overrides is
  'Per-team edits to recommended roadmap stage deadlines (defaults from competition date).';
