-- Workstream F Wave 6: graph-aware flashcards
-- Links cards to claim nodes; per-person node mastery from reviews.
-- Open-attack priority reads arg_edges when K's 00028 is applied;
-- until then we fall back to unanswered counterclaims in application code.

alter table flashcards
  add column if not exists claim_id uuid references claims(id) on delete set null;

create index if not exists flashcards_claim_id_idx on flashcards (claim_id)
  where claim_id is not null;

create table if not exists node_mastery (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id) on delete cascade,
  claim_id uuid not null references claims(id) on delete cascade,
  mastery real not null default 0.5
    check (mastery >= 0 and mastery <= 1),
  review_count int not null default 0,
  last_grade int,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (person_id, claim_id)
);

create index if not exists node_mastery_person_idx on node_mastery (person_id);
create index if not exists node_mastery_claim_idx on node_mastery (claim_id);

alter table node_mastery enable row level security;

revoke all on table node_mastery from anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies where policyname = 'node_mastery_read' and tablename = 'node_mastery'
  ) then
    create policy node_mastery_read on node_mastery for select using (true);
  end if;
end $$;

comment on column flashcards.claim_id is
  'Claim-map node this card drills. Null until linked.';
comment on table node_mastery is
  'Per person mastery of a claim node, updated from card_reviews on linked flashcards.';
