-- Workstream H: Cruxy's brain
-- pgvector match_passages RPC, example library, feedback, weekly review drafts.

-- Optional case_id on passages for direct filtering (also matched via files.case_ids).
alter table passages add column if not exists case_id uuid references cases(id);

create index if not exists passages_case_id_idx on passages(case_id);
-- Cosine search works without an ANN index; add ivfflat/hnsw later once passages are populated.

-- Cosine similarity search for context packing (top 8–12 passages).
create or replace function match_passages(
  query_embedding vector(1536),
  case_id uuid,
  match_count int default 12
)
returns table (
  id uuid,
  file_id uuid,
  case_id uuid,
  anchor text,
  text text,
  similarity float
)
language sql
stable
as $$
  select
    p.id,
    p.file_id,
    coalesce(p.case_id, match_passages.case_id) as case_id,
    p.anchor,
    p.text,
    (1 - (p.embedding <=> query_embedding))::float as similarity
  from passages p
  left join files f on f.id = p.file_id
  where p.embedding is not null
    and (
      p.case_id = match_passages.case_id
      or match_passages.case_id = any (coalesce(f.case_ids, '{}'::uuid[]))
    )
  order by p.embedding <=> query_embedding
  limit greatest(1, least(coalesce(match_count, 12), 24));
$$;

revoke all on function match_passages(vector, uuid, int) from public, anon, authenticated;
grant execute on function match_passages(vector, uuid, int) to service_role;

-- Growing example library (worked / weak arguments).
create table if not exists worked_examples (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('strong', 'weak')),
  agent text not null,
  case_id uuid references cases(id),
  team_id uuid references teams(id),
  title text not null,
  body text not null,
  what_went_wrong text,
  citation_ids text[] not null default '{}',
  embedding vector(1536),
  source_ref text,
  created_at timestamptz not null default now(),
  created_by uuid references people(id),
  approved boolean not null default false,
  approved_at timestamptz,
  approved_by uuid references people(id)
);

alter table worked_examples enable row level security;
revoke all on table worked_examples from anon, authenticated;

create index if not exists worked_examples_case_idx on worked_examples(case_id);
create index if not exists worked_examples_agent_idx on worked_examples(agent);

-- People grade Cruxy: useful / not useful / mark wrong.
create table if not exists cruxy_feedback (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id),
  agent text not null,
  feature text not null,
  output_ref text,
  case_id uuid references cases(id),
  verdict text not null check (verdict in ('useful', 'not_useful', 'wrong')),
  reason text,
  created_at timestamptz not null default now(),
  created_by uuid references people(id)
);

alter table cruxy_feedback enable row level security;
revoke all on table cruxy_feedback from anon, authenticated;

create index if not exists cruxy_feedback_agent_idx on cruxy_feedback(agent, created_at desc);

-- Weekly review drafts for the technical admin to approve.
create table if not exists weekly_review_drafts (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  draft_body text not null,
  proposed_example_ids uuid[] not null default '{}',
  proposed_check_updates jsonb not null default '[]'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  created_by uuid references people(id),
  reviewed_at timestamptz,
  reviewed_by uuid references people(id),
  review_note text
);

alter table weekly_review_drafts enable row level security;
revoke all on table weekly_review_drafts from anon, authenticated;

create unique index if not exists weekly_review_drafts_week_pending_idx
  on weekly_review_drafts(week_start)
  where status = 'pending';
