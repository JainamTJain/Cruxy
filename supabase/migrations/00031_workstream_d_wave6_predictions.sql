-- Workstream D Wave 6: required score predictions + personal Brier scores.
-- RLS deny by default; service role only. Personal Brier is not cross-team.

create table if not exists round_score_predictions (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  /** APPE item key → predicted score 1 to 10 */
  item_scores jsonb not null default '{}'::jsonb,
  /** Judge question the speaker expects to get */
  expected_question text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (round_id, person_id)
);

create index if not exists round_score_predictions_person_idx
  on round_score_predictions (person_id, created_at desc);

create table if not exists prediction_brier_scores (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id) on delete cascade,
  round_id uuid not null references rounds(id) on delete cascade,
  /** Mean Brier across scored items (0 best, higher worse) */
  brier numeric not null,
  /** Per-item Brier keyed by APPE item */
  item_briers jsonb not null default '{}'::jsonb,
  /** Mean of predicted scores used for this round */
  predicted_mean numeric,
  /** Mean of actual judge/Cruxy scores used */
  actual_mean numeric,
  created_at timestamptz not null default now(),
  unique (person_id, round_id)
);

create index if not exists prediction_brier_scores_person_idx
  on prediction_brier_scores (person_id, created_at desc);

alter table round_score_predictions enable row level security;
revoke all on table round_score_predictions from anon, authenticated;

alter table prediction_brier_scores enable row level security;
revoke all on table prediction_brier_scores from anon, authenticated;
