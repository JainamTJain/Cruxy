-- Workstream C (Wave 6): calibrated judge.
-- Pair each human card with Cruxy's card for the same round,
-- store per-item kappa snapshots, and cache bias-corrected intervals.
-- Real analysed cards only; empty until enough human cards exist.

create table if not exists judge_card_pairs (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  human_card_id uuid not null references judge_cards(id) on delete cascade,
  cruxy_card_id uuid not null references judge_cards(id) on delete cascade,
  analysis_id uuid references judge_card_analyses(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (human_card_id, cruxy_card_id)
);

create table if not exists calibrated_judge_item_kappa (
  item text primary key,
  kappa real,
  n_pairs int not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists calibrated_judge_snapshots (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds(id) on delete cascade,
  team_id uuid references teams(id) on delete set null,
  cruxy_card_id uuid not null references judge_cards(id) on delete cascade,
  cruxy_mean real,
  corrected_mean real,
  ci_low real,
  ci_high real,
  overall_kappa real,
  n_cards int not null default 0,
  item_kappas jsonb not null default '{}'::jsonb,
  enough boolean not null default false,
  message text not null default 'Not enough human cards yet',
  updated_at timestamptz not null default now(),
  unique (round_id, cruxy_card_id)
);

alter table judge_card_pairs enable row level security;
alter table calibrated_judge_item_kappa enable row level security;
alter table calibrated_judge_snapshots enable row level security;

revoke all on table judge_card_pairs from anon, authenticated;
revoke all on table calibrated_judge_item_kappa from anon, authenticated;
revoke all on table calibrated_judge_snapshots from anon, authenticated;

create index if not exists judge_card_pairs_round_idx
  on judge_card_pairs (round_id);
create index if not exists judge_card_pairs_cruxy_idx
  on judge_card_pairs (cruxy_card_id);
create index if not exists calibrated_judge_snapshots_round_idx
  on calibrated_judge_snapshots (round_id);
