-- Workstream H Wave 6: robustness scores, judge-Q classification, candidate nodes.
-- Consumes K's arg_edges + recordEdge() from 00028 (already applied).

create table if not exists arg_candidate_nodes (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id),
  case_id uuid not null references cases(id),
  kind text not null
    check (kind in (
      'claim', 'support', 'backing', 'counterclaim',
      'truth_item', 'proposal', 'question', 'candidate'
    )),
  text text not null,
  import_id uuid,
  proposal_id uuid,
  citation_ids text[] not null default '{}',
  status text not null default 'candidate'
    check (status in ('candidate', 'promoted', 'dismissed')),
  created_by uuid references people(id),
  created_at timestamptz not null default now()
);

create index if not exists arg_candidate_nodes_case_idx
  on arg_candidate_nodes (team_id, case_id, status);

alter table arg_candidate_nodes enable row level security;
revoke all on table arg_candidate_nodes from anon, authenticated;

create table if not exists judge_q_classifications (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null,
  question_source text not null,
  question_id text not null,
  question_text text not null,
  claim_id uuid,
  team_id uuid references teams(id),
  case_id uuid references cases(id),
  citation_ids text[] not null default '{}',
  rationale text,
  edge_id uuid,
  created_at timestamptz not null default now(),
  created_by uuid references people(id),
  unique (question_source, question_id)
);

create index if not exists judge_q_classifications_round_idx
  on judge_q_classifications (round_id);
create index if not exists judge_q_classifications_claim_idx
  on judge_q_classifications (claim_id)
  where claim_id is not null;
create index if not exists judge_q_classifications_case_idx
  on judge_q_classifications (case_id);

alter table judge_q_classifications enable row level security;
revoke all on table judge_q_classifications from anon, authenticated;

-- Cached DF-QuAD scores (shared across teams for a case; recomputed in code).
create table if not exists claim_robustness_scores (
  claim_id uuid not null primary key,
  team_id uuid not null references teams(id),
  case_id uuid not null references cases(id),
  score numeric not null check (score >= 0 and score <= 1),
  score_pct int not null check (score_pct >= 0 and score_pct <= 100),
  attacks_answered int not null default 0,
  attacks_open int not null default 0,
  open_from_rounds text[] not null default '{}',
  support_strength numeric not null default 0,
  attack_strength numeric not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists claim_robustness_scores_case_idx
  on claim_robustness_scores (case_id, team_id);

alter table claim_robustness_scores enable row level security;
revoke all on table claim_robustness_scores from anon, authenticated;

insert into app_kv (key, value, updated_at)
values (
  'wave6_h_robustness',
  jsonb_build_object('migration', '00029', 'at', now()),
  now()
)
on conflict (key) do update
set value = excluded.value, updated_at = excluded.updated_at;
