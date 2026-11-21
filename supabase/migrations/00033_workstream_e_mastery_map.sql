-- Workstream E Wave 6: Mastery map (person × claim-node grid).
-- Migration number reserved in wave6-innovation.md: E = 00033.
-- F's 00032 already owns node_mastery (person_id, claim_id, mastery,
-- review_count, last_grade). This table is the map grid cache only;
-- card-review evidence is read from F's node_mastery at compute time.

create table if not exists mastery_map_cells (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id) on delete cascade,
  team_id uuid references teams(id) on delete cascade,
  case_id uuid not null references cases(id) on delete cascade,
  node_kind text not null check (
    node_kind in ('claim', 'support', 'counterclaim', 'truth_item')
  ),
  node_id uuid not null,
  -- 0..1 mastery from card reviews, drill answers and round performance.
  mastery real not null default 0 check (mastery >= 0 and mastery <= 1),
  -- Evidence counts: { card_reviews, answers, round_hits }.
  evidence jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (person_id, node_kind, node_id)
);

create index if not exists mastery_map_cells_case_team_idx
  on mastery_map_cells (case_id, team_id);

create index if not exists mastery_map_cells_person_case_idx
  on mastery_map_cells (person_id, case_id);

alter table mastery_map_cells enable row level security;
revoke all on table mastery_map_cells from anon, authenticated;

comment on table mastery_map_cells is
  'Mastery map grid cells (person × claim node). Computed from F node_mastery card reviews, drill answers and round feedback. Personal; admins may read all for the map.';
