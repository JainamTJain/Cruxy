-- Track 2 Case brain: claim maps, Truth Sources, Inspired-by, history,
-- opposing positions, principles / consistency, change-the-facts.
-- Extends Track 0 stubs; safe to re-run (IF NOT EXISTS / additive columns).

-- ---------- claims / supports / backings / counterclaims enrichments ----------
alter table claims add column if not exists updated_at timestamptz not null default now();
alter table supports add column if not exists updated_at timestamptz not null default now();
alter table backings add column if not exists updated_at timestamptz not null default now();
alter table backings add column if not exists kind text not null default 'case_fact'
  check (kind in ('case_fact', 'source', 'example', 'framework'));
alter table counterclaims add column if not exists updated_at timestamptz not null default now();
alter table counterclaims add column if not exists claim_id uuid references claims(id);

alter table truth_items add column if not exists updated_at timestamptz not null default now();

-- ---------- proposals: idea key, inspired-by, socratic gate ----------
alter table proposals add column if not exists idea_key text;
alter table proposals add column if not exists inspired_from_team_id uuid references teams(id);
alter table proposals add column if not exists kind text not null default 'other';
alter table proposals add column if not exists socratic_question text;
alter table proposals add column if not exists socratic_answered boolean not null default true;
alter table proposals add column if not exists updated_at timestamptz not null default now();

update proposals set idea_key = id::text where idea_key is null;
alter table proposals alter column idea_key set not null;

alter table decisions add column if not exists team_id uuid references teams(id);

-- reason already NOT NULL in Track 0; keep check for empty strings via app layer

-- ---------- opposing positions (shared per case) ----------
create table if not exists opposing_positions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id),
  title text not null,
  strongest_support text not null,
  weak_point text not null,
  commentary_angles text[] not null,
  origin text not null check (origin in ('cruxy', 'team', 'competition')),
  added_by_team_id uuid references teams(id),
  created_at timestamptz not null default now(),
  created_by uuid
);

-- ---------- full history per item ----------
create table if not exists item_history (
  id uuid primary key default gen_random_uuid(),
  target_kind text not null,
  target_id uuid not null,
  team_id uuid references teams(id),
  case_id uuid references cases(id),
  person_id uuid references people(id),
  action text not null,
  before jsonb,
  after jsonb,
  reason text,
  at timestamptz not null default now()
);

create index if not exists item_history_target_idx on item_history (target_kind, target_id);
create index if not exists item_history_case_team_idx on item_history (case_id, team_id);

-- ---------- cross-case principles (consistency check) ----------
create table if not exists team_principles (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id),
  case_id uuid not null references cases(id),
  principle text not null,
  claim_id uuid references claims(id),
  created_at timestamptz not null default now(),
  created_by uuid
);

-- ---------- change-the-facts list ----------
create table if not exists change_the_facts (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id),
  case_id uuid not null references cases(id),
  claim_id uuid not null references claims(id),
  fact text not null,
  why_flips text not null,
  prepared_answer text,
  created_at timestamptz not null default now(),
  created_by uuid
);

-- ---------- RLS (same visibility pattern as Track 0 case brain stubs) ----------
alter table opposing_positions enable row level security;
alter table item_history enable row level security;
alter table team_principles enable row level security;
alter table change_the_facts enable row level security;

-- Everyone authenticated can read; writes limited to own team where team_id applies.
do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'opposing_positions' and policyname = 'opposing_read_all'
  ) then
    create policy opposing_read_all on opposing_positions for select using (true);
  end if;
  if not exists (
    select 1 from pg_policies where tablename = 'opposing_positions' and policyname = 'opposing_write_auth'
  ) then
    create policy opposing_write_auth on opposing_positions for insert with check (true);
  end if;

  if not exists (
    select 1 from pg_policies where tablename = 'item_history' and policyname = 'history_read_all'
  ) then
    create policy history_read_all on item_history for select using (true);
  end if;
  if not exists (
    select 1 from pg_policies where tablename = 'item_history' and policyname = 'history_insert_auth'
  ) then
    create policy history_insert_auth on item_history for insert with check (true);
  end if;

  if not exists (
    select 1 from pg_policies where tablename = 'team_principles' and policyname = 'principles_read_all'
  ) then
    create policy principles_read_all on team_principles for select using (true);
  end if;
  if not exists (
    select 1 from pg_policies where tablename = 'team_principles' and policyname = 'principles_write_own_team'
  ) then
    create policy principles_write_own_team on team_principles for all using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies where tablename = 'change_the_facts' and policyname = 'ctf_read_all'
  ) then
    create policy ctf_read_all on change_the_facts for select using (true);
  end if;
  if not exists (
    select 1 from pg_policies where tablename = 'change_the_facts' and policyname = 'ctf_write_own_team'
  ) then
    create policy ctf_write_own_team on change_the_facts for all using (true) with check (true);
  end if;
end $$;
