-- Workstream J Wave 6: Socratic outcomes
-- After a Socratic exchange, track the next attempt on linked claims and
-- write the result into cruxy_outcomes (table from 00027).

alter table cruxy_outcomes
  add column if not exists claim_id uuid;

alter table cruxy_outcomes
  add column if not exists attempt_kind text;

alter table cruxy_outcomes
  add column if not exists socratic_session_id uuid references socratic_sessions(id);

create index if not exists cruxy_outcomes_claim_idx
  on cruxy_outcomes (claim_id, created_at desc);

create index if not exists cruxy_outcomes_socratic_idx
  on cruxy_outcomes (socratic_session_id);

create table if not exists socratic_outcome_pending (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id),
  socratic_session_id uuid not null references socratic_sessions(id) on delete cascade,
  claim_id uuid not null,
  case_id uuid references cases(id),
  score_before numeric,
  created_at timestamptz not null default now(),
  created_by uuid references people(id),
  resolved_at timestamptz,
  outcome_id uuid references cruxy_outcomes(id),
  unique (person_id, socratic_session_id, claim_id)
);

create index if not exists socratic_outcome_pending_open_idx
  on socratic_outcome_pending (person_id, case_id)
  where resolved_at is null;

alter table socratic_outcome_pending enable row level security;
revoke all on table socratic_outcome_pending from anon, authenticated;
