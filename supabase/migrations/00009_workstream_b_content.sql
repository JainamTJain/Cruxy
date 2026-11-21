-- Workstream B: tables needed to load real case-prep content.
-- Safe to apply after 00001–00007. Workstream 0 may use 00008.
-- Idempotent content upserts use deterministic primary keys (see scripts/seed-content.ts).
-- All DB access is server-side via the service role (bypasses RLS).

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

-- RLS on; no policies. Deny anon/authenticated by default (matches 00001 sensitive tables).
alter table case_stakeholders enable row level security;
alter table scoring_card_items enable row level security;

drop policy if exists stakeholders_read_all on case_stakeholders;
drop policy if exists stakeholders_write_auth on case_stakeholders;
drop policy if exists scoring_items_read_all on scoring_card_items;
drop policy if exists scoring_items_write_auth on scoring_card_items;

revoke all on case_stakeholders from anon, authenticated;
revoke all on scoring_card_items from anon, authenticated;
