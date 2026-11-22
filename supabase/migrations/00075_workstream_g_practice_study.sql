-- Wave G (case workflow v2): resumable solo question practice in Practice.
-- Flashcards reuse existing flashcards + card_fsrs_states tables.
-- RLS on; client JWT roles revoked (server uses service role).

create table if not exists solo_qa_sessions (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people (id) on delete cascade,
  team_id uuid not null references teams (id) on delete cascade,
  case_id uuid not null references cases (id) on delete cascade,
  kind text not null
    check (kind in ('moderator', 'judges')),
  status text not null default 'active'
    check (status in ('active', 'done')),
  current_index int not null default 0
    check (current_index >= 0),
  -- [{ questionId, prompt, answer, feedback, appeNotes, answeredAt }]
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists solo_qa_sessions_person_status_idx
  on solo_qa_sessions (person_id, status, updated_at desc);

create index if not exists solo_qa_sessions_case_idx
  on solo_qa_sessions (case_id, person_id);

alter table solo_qa_sessions enable row level security;
revoke all on table solo_qa_sessions from anon, authenticated;

comment on table solo_qa_sessions is
  'Practice solo Q: moderator/judge questions with Cruxy APPE feedback; resumable.';
