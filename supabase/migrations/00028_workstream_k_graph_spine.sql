-- Workstream K Wave 6: argument graph spine.
-- arg_edges + vector(1536) embeddings on claim-map nodes.
-- Server-only (service role); revoke anon and authenticated.

-- ---------- Node embeddings (embed tier, 1536 dims like passages) ----------
alter table claims
  add column if not exists embedding vector(1536);

alter table supports
  add column if not exists embedding vector(1536);

alter table counterclaims
  add column if not exists embedding vector(1536);

create index if not exists claims_embedding_null_idx
  on claims (id)
  where embedding is null;

create index if not exists supports_embedding_null_idx
  on supports (id)
  where embedding is null;

create index if not exists counterclaims_embedding_null_idx
  on counterclaims (id)
  where embedding is null;

-- ---------- Argument edges ----------
-- edge_key is the idempotent natural key so recordEdge() can upsert.
create table if not exists arg_edges (
  id uuid primary key default gen_random_uuid(),
  edge_key text not null,
  from_kind text not null,
  from_id uuid not null,
  to_kind text not null,
  to_id uuid not null,
  type text not null
    check (type in (
      'supports',
      'attacks',
      'concedes',
      'distinguishes',
      'rebuts',
      'cites',
      'contradicts',
      'inspired_by',
      'used_in_round',
      'tested_by_question'
    )),
  weight real not null default 1
    check (weight >= 0 and weight <= 1),
  -- Provenance
  source_kind text,
  source_id uuid,
  round_id uuid references rounds(id) on delete set null,
  line_id uuid references transcript_lines(id) on delete set null,
  team_id uuid references teams(id) on delete set null,
  case_id uuid references cases(id) on delete set null,
  created_by uuid references people(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint arg_edges_edge_key_uidx unique (edge_key)
);

create index if not exists arg_edges_to_idx
  on arg_edges (to_kind, to_id, type);

create index if not exists arg_edges_from_idx
  on arg_edges (from_kind, from_id, type);

create index if not exists arg_edges_case_team_idx
  on arg_edges (case_id, team_id, created_at desc);

create index if not exists arg_edges_round_idx
  on arg_edges (round_id)
  where round_id is not null;

create index if not exists arg_edges_type_idx
  on arg_edges (type, created_at desc);

alter table arg_edges enable row level security;
revoke all on table arg_edges from anon, authenticated;

insert into app_kv (key, value, updated_at)
values (
  'graph_spine',
  jsonb_build_object('migration', '00028', 'at', now()),
  now()
)
on conflict (key) do update
set value = excluded.value, updated_at = excluded.updated_at;
