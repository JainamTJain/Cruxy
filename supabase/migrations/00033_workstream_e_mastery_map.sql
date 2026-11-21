-- Workstream E Wave 6: Mastery map (person × claim-node grid).
-- Migration number reserved in wave6-innovation.md: E = 00033.
-- Compatible with F's node_mastery (00032): create-if-missing so E can ship
-- before F lands; F may extend columns later without dropping this shape.
-- Soft dependency on K's arg_edges (00028): read in app code; indexes already
-- exist from 00028.

create table if not exists node_mastery (
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

create index if not exists node_mastery_case_team_idx
  on node_mastery (case_id, team_id);

create index if not exists node_mastery_person_case_idx
  on node_mastery (person_id, case_id);

alter table node_mastery enable row level security;
revoke all on table node_mastery from anon, authenticated;

comment on table node_mastery is
  'Per-person mastery of a claim (or related) node. Filled from real card_reviews, answers and rounds. Personal; admins may read all for the mastery map.';
