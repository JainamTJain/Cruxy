-- 00091 reading notes become working document suggestions when they carry ethical weight.
-- The case text itself opens in the reading room, so annotations can sit on it too.

alter table reading_annotations drop constraint if exists reading_annotations_reading_kind_check;
alter table reading_annotations
  add constraint reading_annotations_reading_kind_check
  check (reading_kind in ('web', 'import', 'case'));

create table if not exists reading_note_suggestions (
  source_kind text not null check (source_kind in ('annotation', 'case_comment')),
  source_id uuid not null,
  team_id uuid not null references teams(id) on delete cascade,
  case_id uuid not null references cases(id) on delete cascade,
  person_id uuid references people(id) on delete set null,
  status text not null default 'thinking' check (status in ('thinking', 'drafted', 'kept', 'failed')),
  reason text,
  suggestion_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (source_kind, source_id)
);
create index if not exists reading_note_suggestions_team_case_idx
  on reading_note_suggestions (team_id, case_id);
alter table reading_note_suggestions enable row level security;
revoke all on table reading_note_suggestions from anon, authenticated;
