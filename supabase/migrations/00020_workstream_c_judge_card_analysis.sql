-- Workstream C (Wave 5): judge card analysis, per-item learn decisions,
-- slow scoring corrections, and Cruxy judge Q&A prompts.
-- Real cards only; empty until humans or Cruxy produce cards.

create table if not exists judge_card_analyses (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references judge_cards(id) on delete cascade,
  round_id uuid not null references rounds(id) on delete cascade,
  judge_id uuid references judges(id),
  background_guess text,
  evidence_note text not null default '',
  position_lean_note text not null default '',
  drift_note text not null default '',
  agreement_note text not null default '',
  conflicts_note text not null default '',
  overall_note text not null default '',
  overall_use text not null default 'feedback_only'
    check (overall_use in ('full', 'reduced', 'feedback_only')),
  effective_use text not null default 'feedback_only'
    check (effective_use in ('full', 'reduced', 'feedback_only')),
  override_use text
    check (override_use is null or override_use in ('full', 'reduced', 'feedback_only')),
  override_reason text,
  override_by uuid references people(id),
  override_at timestamptz,
  worked_example_id uuid references worked_examples(id),
  created_at timestamptz not null default now(),
  created_by uuid references people(id),
  unique (card_id)
);

create table if not exists judge_card_item_uses (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references judge_card_analyses(id) on delete cascade,
  item text not null,
  use_decision text not null
    check (use_decision in ('full', 'reduced', 'feedback_only')),
  reason text not null default '',
  created_at timestamptz not null default now(),
  unique (analysis_id, item)
);

create table if not exists scoring_item_corrections (
  item text primary key,
  delta real not null default 0,
  agreement_count int not null default 0,
  last_card_ids uuid[] not null default '{}',
  updated_at timestamptz not null default now()
);

create table if not exists cruxy_judge_qa (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds(id) on delete cascade,
  seat_index int not null check (seat_index >= 1 and seat_index <= 6),
  question text not null,
  follow_up text not null,
  created_at timestamptz not null default now(),
  created_by uuid references people(id),
  unique (round_id, seat_index)
);

alter table judge_card_analyses enable row level security;
alter table judge_card_item_uses enable row level security;
alter table scoring_item_corrections enable row level security;
alter table cruxy_judge_qa enable row level security;

revoke all on table judge_card_analyses from anon, authenticated;
revoke all on table judge_card_item_uses from anon, authenticated;
revoke all on table scoring_item_corrections from anon, authenticated;
revoke all on table cruxy_judge_qa from anon, authenticated;

create index if not exists judge_card_analyses_round_idx
  on judge_card_analyses (round_id);
create index if not exists cruxy_judge_qa_round_idx
  on cruxy_judge_qa (round_id);
