-- Workstream B: tables needed to load real case-prep content.
-- Safe to apply after 00001–00007. Workstream 0 may use 00008.
-- Idempotent content upserts use deterministic primary keys (see scripts/seed-content.ts).

-- Stakeholders on each case card (from case prep docs).
create table if not exists case_stakeholders (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  who text not null,
  stake text not null,
  voice_in_case text,
  ord int not null default 0,
  origin text not null default 'case prep doc',
  created_at timestamptz not null default now(),
  created_by uuid
);

create index if not exists case_stakeholders_case_idx
  on case_stakeholders (case_id, ord);

-- Canonical APPE scoring card items (from docs/domain/scoring-card.md).
create table if not exists scoring_card_items (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  question text not null,
  sort_ord int not null,
  min_score int not null default 1,
  max_score int not null default 10,
  is_total boolean not null default false,
  created_at timestamptz not null default now()
);

-- Origin tag for accepted truth items seeded from prep docs.
alter table truth_items
  add column if not exists origin text;

-- RLS (deny anon by default; server uses service role).
alter table case_stakeholders enable row level security;
alter table scoring_card_items enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'case_stakeholders' and policyname = 'stakeholders_read_all'
  ) then
    create policy stakeholders_read_all on case_stakeholders for select using (true);
  end if;
  if not exists (
    select 1 from pg_policies where tablename = 'case_stakeholders' and policyname = 'stakeholders_write_auth'
  ) then
    create policy stakeholders_write_auth on case_stakeholders for all using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies where tablename = 'scoring_card_items' and policyname = 'scoring_items_read_all'
  ) then
    create policy scoring_items_read_all on scoring_card_items for select using (true);
  end if;
  if not exists (
    select 1 from pg_policies where tablename = 'scoring_card_items' and policyname = 'scoring_items_write_auth'
  ) then
    create policy scoring_items_write_auth on scoring_card_items for all using (true) with check (true);
  end if;
end $$;
